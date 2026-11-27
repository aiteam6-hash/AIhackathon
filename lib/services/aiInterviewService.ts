/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AiInterview, AiInterviewAnswer, AiInterviewStatus, AiInterviewSummary } from "@/types";
import { aiInterviewQuestions, aiInterviewSummary } from "@/lib/ai/client";
import { supabaseBrowser } from "@/lib/supabase/client";
import { applicationsService } from "./applicationsService";
import { bump, ServiceError } from "./util";

const sb = () => supabaseBrowser();
const fail = (e: { message: string } | null) => { if (e) throw new ServiceError(e.message); };
const asQuestions = (texts: string[]) => texts.map((text, i) => ({ id: `q${i + 1}`, text: text.trim() })).filter((q) => q.text);

function toInterview(r: any, answers: any[], summary: any): AiInterview {
  return {
    id: r.id, applicationId: r.application_id, status: r.status as AiInterviewStatus, questions: r.questions ?? [],
    approvedAt: r.approved_at ?? undefined, expiresAt: r.expires_at ?? undefined, startedAt: r.started_at ?? undefined, completedAt: r.completed_at ?? undefined,
    answers: answers.map((a): AiInterviewAnswer => ({ questionId: a.question_id, questionText: a.question_text, answer: a.answer, inputMode: a.input_mode, durationSeconds: a.duration_seconds ?? undefined })),
    summary: summary ? ({ overview: summary.overview, strengths: summary.strengths, concerns: summary.concerns, perAnswer: summary.per_answer, recommendation: summary.recommendation, model: summary.model, createdAt: summary.created_at } as AiInterviewSummary) : undefined,
  };
}

/** AI interviews exist only for real accounts. Demo accounts have no interviews, so these calls are never made for them. */
export const aiInterviewService = {
  /** The most recent interview for an application, or null. Applicants only ever receive approved, started or finished ones. */
  async get(applicationId: string): Promise<AiInterview | null> {
    const { data, error } = await sb().from("ai_interviews").select("*").eq("application_id", applicationId).order("created_at", { ascending: false }).limit(1);
    fail(error);
    const row = data?.[0];
    if (!row) return null;
    const [ans, sum] = await Promise.all([
      sb().from("ai_interview_answers").select("*").eq("interview_id", row.id).order("created_at"),
      sb().from("ai_interview_summaries").select("*").eq("interview_id", row.id).maybeSingle(),
    ]);
    fail(ans.error);
    return toInterview(row, ans.data ?? [], sum.data);
  },

  /** Recruiter: asks Claude for questions and saves them as a draft (replacing an earlier draft). */
  async draftQuestions(applicationId: string, notes?: string): Promise<AiInterview> {
    const bundle = await applicationsService.getCandidate(applicationId);
    const questions = asQuestions(await aiInterviewQuestions(bundle, notes));
    const { data: auth } = await sb().auth.getUser();
    const existing = await sb().from("ai_interviews").select("id").eq("application_id", applicationId).eq("status", "draft").maybeSingle();
    if (existing.data) fail((await sb().from("ai_interviews").update({ questions }).eq("id", existing.data.id)).error);
    else fail((await sb().from("ai_interviews").insert({ application_id: applicationId, questions, created_by: auth.user!.id })).error);
    bump();
    return (await aiInterviewService.get(applicationId))!;
  },

  async saveQuestions(id: string, texts: string[]) {
    const questions = asQuestions(texts);
    if (!questions.length) throw new ServiceError("Keep at least one question.");
    fail((await sb().from("ai_interviews").update({ questions }).eq("id", id)).error);
    bump();
  },

  /** Recruiter: approves the questions. The database stamps who approved it, opens a 7 day window and notifies the applicant. */
  async approve(id: string) {
    fail((await sb().from("ai_interviews").update({ status: "approved" }).eq("id", id)).error);
    bump();
  },

  async cancel(id: string) {
    fail((await sb().from("ai_interviews").update({ status: "cancelled" }).eq("id", id)).error);
    bump();
  },

  /** Recruiter: writes the summary for a finished interview (done by the server so the transcript cannot be altered). */
  async generateSummary(id: string) {
    await aiInterviewSummary(id);
    bump();
  },

  /** Applicant: records consent and starts (or restarts) the interview. */
  async start(id: string) {
    fail((await sb().rpc("start_ai_interview", { p_id: id })).error);
    bump();
  },

  /** Applicant: submits all answers. Only transcripts are sent; audio never leaves the device. */
  async submit(id: string, answers: { questionId: string; answer: string; inputMode: "voice" | "typed"; durationSeconds?: number }[]) {
    fail((await sb().rpc("submit_ai_interview", {
      p_id: id,
      p_answers: answers.map((a) => ({ question_id: a.questionId, answer: a.answer, input_mode: a.inputMode, duration_seconds: a.durationSeconds ?? null })),
    })).error);
    bump();
  },
};
