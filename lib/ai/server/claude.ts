import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

/** Server-only Claude client. The key comes from ANTHROPIC_API_KEY and never reaches the browser. */
let client: Anthropic | null = null;
export const claudeConfigured = () => !!process.env.ANTHROPIC_API_KEY;
const getClient = () => (client ??= new Anthropic());

export class AiRefusal extends Error {}
export class AiBadOutput extends Error {}

export interface GenerateOptions<T> {
  model: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}

export interface Generated<T> {
  data: T;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * One structured-output request. The reply is checked against `schema` before it is returned.
 * Sonnet is called with server-side refusal fallbacks switched on; Haiku has no fallback option.
 */
export async function generate<T>(o: GenerateOptions<T>): Promise<Generated<T>> {
  const base = {
    model: o.model,
    max_tokens: o.maxTokens ?? 4000,
    system: o.system,
    messages: [{ role: "user" as const, content: o.user }],
    output_config: { effort: o.effort ?? "low", format: zodOutputFormat(o.schema) },
  };

  const useFallbacks = o.model.startsWith("claude-sonnet-5-5") || o.model.startsWith("claude-opus-5") || o.model.startsWith("claude-fable");
  const res = useFallbacks
    ? await getClient().beta.messages.parse({ ...base, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } as never)
    : await getClient().messages.parse(base as never);

  const r = res as unknown as { stop_reason: string; parsed_output: T | null; model: string; usage: { input_tokens: number; output_tokens: number } };
  if (r.stop_reason === "refusal") throw new AiRefusal("The model declined this request.");
  if (r.stop_reason === "max_tokens") throw new AiBadOutput("The reply was cut off.");
  if (!r.parsed_output) throw new AiBadOutput("The reply did not match the expected format.");
  return { data: r.parsed_output, model: r.model ?? o.model, inputTokens: r.usage.input_tokens, outputTokens: r.usage.output_tokens };
}

export { Anthropic };
