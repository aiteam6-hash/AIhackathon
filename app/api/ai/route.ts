import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { ZodError } from "zod";
import { AI_CALLS_PER_MINUTE } from "@/lib/config";
import { AI_TASKS, type AiTask } from "@/lib/ai/schemas";
import { AiBadOutput, AiRefusal, Anthropic, claudeConfigured, generate } from "@/lib/ai/server/claude";
import { build } from "@/lib/ai/server/tasks";

export const maxDuration = 60;

const json = (status: number, error: string) => NextResponse.json({ error }, { status });

/**
 * The only place Claude is called from. Requires a signed-in user, checks their role, limits how often
 * they can call, and logs every call to ai_generations (tokens and timing, never the content).
 */
export async function POST(request: Request) {
  if (!claudeConfigured()) return json(503, "not_configured");

  const cookieStore = await cookies();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
  });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return json(401, "sign_in_required");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!profile?.role) return json(403, "choose_a_role_first");

  const text = await request.text();
  if (text.length > 80_000) return json(413, "too_large");
  let body: { task?: string; input?: unknown; jobId?: string; applicationId?: string };
  try { body = JSON.parse(text); } catch { return json(400, "bad_json"); }
  const task = body.task as AiTask;
  if (!AI_TASKS.includes(task)) return json(400, "unknown_task");
  // Resume parsing is for applicants; every other task helps recruiters decide.
  if (task === "parse_resume" ? profile.role !== "applicant" : profile.role !== "recruiter") return json(403, "wrong_role");

  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supabase.from("ai_generations").select("id", { count: "exact", head: true }).eq("created_by", auth.user.id).gte("created_at", since);
  if ((count ?? 0) >= AI_CALLS_PER_MINUTE) return json(429, "slow_down");

  const started = Date.now();
  const log = (model: string, status: "ok" | "error", extra: { inputTokens?: number; outputTokens?: number; error?: string } = {}) =>
    supabase.from("ai_generations").insert({
      kind: task === "parse_resume" ? "parse_resume" : task === "job_description" ? "job_description" : task,
      model, status, input_tokens: extra.inputTokens ?? null, output_tokens: extra.outputTokens ?? null,
      latency_ms: Date.now() - started, error: extra.error ?? null, created_by: auth.user!.id,
      job_id: body.jobId ?? null, application_id: body.applicationId ?? null,
    });

  let built;
  try {
    built = build(task, body.input);
  } catch (e) {
    return json(400, e instanceof ZodError ? "invalid_input" : "bad_request");
  }

  try {
    const out = await generate(built as never) as { data: unknown; model: string; inputTokens: number; outputTokens: number };
    await log(out.model, "ok", out);
    return NextResponse.json({ data: out.data, model: out.model });
  } catch (e) {
    const kind = e instanceof AiRefusal ? "refused" : e instanceof AiBadOutput ? "bad_output"
      : e instanceof Anthropic.RateLimitError ? "busy" : e instanceof Anthropic.AuthenticationError ? "not_configured" : "failed";
    await log(String((built as { model: string }).model), "error", { error: kind });
    return json(kind === "busy" ? 429 : kind === "refused" ? 422 : kind === "not_configured" ? 503 : 502, kind);
  }
}
