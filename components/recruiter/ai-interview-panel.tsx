"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { AiInterview, Stage } from "@/types";
import { useAsync } from "@/lib/hooks/useAsync";
import { aiInterviewService } from "@/lib/services/aiInterviewService";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import { AIBadge } from "@/components/ui/bits";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { toast } from "@/components/ui/toaster";

export interface Decide { stage: Stage; hasInterview: boolean; schedule: () => void; offer: () => void; reject: () => void }

const ERRORS: Record<string, string> = {
  not_configured: "AI is not switched on for this site yet.",
  slow_down: "Too many AI requests in a minute. Wait a little and try again.",
  busy: "The AI service is busy. Try again in a moment.",
  refused: "The AI declined this request. Try different notes.",
  network: "Could not reach the AI service.",
};
const say = (e: unknown, fallback: string) => ERRORS[e instanceof Error ? e.message : ""] ?? (e instanceof Error && e.message.length < 140 && !/^status_|^incomplete$/.test(e.message) ? e.message : fallback);

function DraftEditor({ interview, onRegenerate, regenerating }: { interview: AiInterview; onRegenerate: () => void; regenerating: boolean }) {
  const [texts, setTexts] = useState(interview.questions.map((q) => q.text));
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const filled = texts.map((t) => t.trim()).filter(Boolean);

  async function save() {
    setBusy(true);
    try { await aiInterviewService.saveQuestions(interview.id, texts); toast.success("Questions saved."); }
    catch (e) { toast.error(say(e, "Could not save the questions.")); }
    setBusy(false);
  }
  async function approve() {
    setBusy(true);
    try {
      await aiInterviewService.saveQuestions(interview.id, texts);
      await aiInterviewService.approve(interview.id);
      toast.success("Approved. The applicant has been notified.");
      setConfirm(false);
    } catch (e) { toast.error(say(e, "Could not approve the interview.")); }
    setBusy(false);
  }

  return (
    <div>
      <p className="text-sm flex flex-wrap items-center gap-2 mb-3"><AIBadge /> Drafted from the job and this candidate&apos;s resume. Edit anything. Nothing is sent until you approve.</p>
      <ol className="space-y-2">
        {texts.map((t, i) => (
          <li key={i} className="flex gap-2 items-start">
            <span className="font-display text-xl text-accent w-6 pt-1.5 shrink-0">{i + 1}</span>
            <label className="sr-only" htmlFor={`aq-${i}`}>Question {i + 1}</label>
            <textarea id={`aq-${i}`} className="input min-h-14" value={t} onChange={(e) => setTexts((l) => l.map((x, j) => (j === i ? e.target.value : x)))} />
            <button className="btn btn-text btn-sm" aria-label={`Remove question ${i + 1}`} onClick={() => setTexts((l) => l.filter((_, j) => j !== i))} disabled={texts.length <= 1}><Trash2 size={15} /></button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2 mt-3">
        <button className="btn btn-sm" onClick={() => setTexts((l) => [...l, ""])} disabled={texts.length >= 8}><Plus size={14} aria-hidden /> Add question</button>
        <button className="btn btn-sm" onClick={onRegenerate} disabled={regenerating || busy}>{regenerating ? "Drafting…" : "Draft new questions"}</button>
        <button className="btn btn-sm" onClick={save} disabled={busy}>Save changes</button>
        <button className="btn btn-primary btn-sm ml-auto" onClick={() => setConfirm(true)} disabled={busy || filled.length === 0}>Approve and notify applicant</button>
      </div>
      <ConfirmDialog open={confirm} onCancel={() => setConfirm(false)} onConfirm={approve} busy={busy} title="Approve this AI interview?" confirmLabel="Approve and notify"
        body={<>The applicant will be notified that they have an AI interview of {filled.length} {filled.length === 1 ? "question" : "questions"} to complete within 7 days. They can answer by voice or by typing. You cannot change the questions after approving.</>} />
    </div>
  );
}

function Completed({ interview, onRetry, decide }: { interview: AiInterview; onRetry: () => void; decide?: Decide }) {
  const s = interview.summary;
  return (
    <div>
      <p className="text-sm text-muted mb-3">Completed {interview.completedAt ? formatDateTime(interview.completedAt) : ""}. {interview.answers.filter((a) => a.inputMode === "voice").length} of {interview.answers.length} answers were spoken; the rest were typed.</p>
      {!s ? (
        <div role="status" aria-label="Writing the interview summary" className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-2/3" /><p className="text-sm text-muted">Writing the summary…</p></div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold">Summary</p><AIBadge /></div>
          <p className="max-w-prose">{s.overview}</p>
          <div className="grid gap-5 sm:grid-cols-2">
            <div><p className="eyebrow mb-1">Strengths</p><ul className="list-disc pl-5 text-sm space-y-1">{s.strengths.map((x) => <li key={x}>{x}</li>)}</ul></div>
            <div><p className="eyebrow mb-1">Concerns</p><ul className="list-disc pl-5 text-sm space-y-1">{s.concerns.map((x) => <li key={x}>{x}</li>)}</ul></div>
          </div>
          <p className="border-l-2 border-accent pl-3"><strong>Recommendation:</strong> {s.recommendation}</p>
          {decide && (
            <div role="group" aria-label="What next" className="flex flex-wrap items-center gap-2 border border-ink p-3">
              <span className="text-sm font-semibold px-1">Your decision:</span>
              <button className="btn btn-sm btn-primary" onClick={decide.schedule}>{decide.hasInterview ? "Reschedule interview" : "Book an interview"}</button>
              {decide.stage !== "Offer" && <button className="btn btn-sm" onClick={decide.offer}>Move to offer</button>}
              <button className="btn btn-sm" onClick={decide.reject}>Reject with feedback</button>
            </div>
          )}
          <div>
            <p className="eyebrow mb-1">Answer by answer</p>
            <ol className="border-t border-rule">{s.perAnswer.map((a, i) => <li key={i} className="py-2.5 border-b border-rule text-sm"><p className="font-semibold">{i + 1}. {a.question}</p><p>{a.note}</p></li>)}</ol>
          </div>
          <p className="text-xs text-muted">AI-generated from the transcript only. It does not judge accent, voice or fluency, and speech-to-text can make mistakes. It supports your decision; it is not the decision. <button className="link" onClick={onRetry}>Write it again</button></p>
        </div>
      )}
      <details className="mt-5">
        <summary className="cursor-pointer text-sm font-semibold">Read the full transcript</summary>
        <ol className="mt-2 border-t border-rule">{interview.answers.map((a, i) => (
          <li key={a.questionId} className="py-3 border-b border-rule text-sm">
            <p className="font-semibold">{i + 1}. {a.questionText}</p>
            <p className="whitespace-pre-wrap mt-1">{a.answer || "(no answer)"}</p>
            <p className="text-xs text-muted mt-1">{a.inputMode === "voice" ? `Spoken${a.durationSeconds ? `, ${a.durationSeconds} seconds` : ""}, transcribed on the applicant's device` : "Typed"}</p>
          </li>
        ))}</ol>
      </details>
    </div>
  );
}

/** Recruiter controls for one candidate's AI interview: draft, edit, approve, then read the summary. */
export function AiInterviewPanel({ applicationId, stage, decide }: { applicationId: string; stage: Stage; decide?: Decide }) {
  const { data, error, loading, reload } = useAsync(() => aiInterviewService.get(applicationId), [applicationId]);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const summaryFor = useRef<string | null>(null);

  const needsSummary = data?.status === "completed" && !data.summary;
  const interviewId = data?.id;
  useEffect(() => {
    if (!needsSummary || !interviewId || summaryFor.current === interviewId) return;
    summaryFor.current = interviewId;
    aiInterviewService.generateSummary(interviewId).catch((e) => { summaryFor.current = null; toast.error(say(e, "Could not write the interview summary.")); });
  }, [needsSummary, interviewId]);

  async function draft() {
    setBusy(true);
    try { await aiInterviewService.draftQuestions(applicationId, notes); }
    catch (e) { toast.error(say(e, "Could not draft questions right now. Try again.")); }
    setBusy(false);
  }
  async function cancel() {
    setBusy(true);
    try { await aiInterviewService.cancel(data!.id); toast.success("AI interview cancelled."); setCancelOpen(false); }
    catch (e) { toast.error(say(e, "Could not cancel.")); }
    setBusy(false);
  }

  const eligible = ["Shortlisted", "Interview", "Offer"].includes(stage);
  const open = data && data.status !== "cancelled" ? data : null;

  return (
    <section aria-labelledby="aiiv">
      <div className="flex items-center justify-between gap-2 mb-3"><h2 id="aiiv" className="text-3xl">AI interview</h2>{open && <AIBadge>AI interview</AIBadge>}</div>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading && data === undefined ? <Skeleton className="h-24 w-full" /> : (
        <>
          {!open && (
            eligible ? (
              <div className="border border-ink border-l-4 border-l-accent p-5">
                <p className="eyebrow mb-1">Next step</p>
                <p className="mb-1 font-semibold">Screen this candidate with a short spoken interview</p>
                <p className="text-sm text-muted mb-4">Claude drafts questions from the role and the resume, you approve them, and the applicant answers by voice or text at a time that suits them. You then get a summary. Nothing reaches the applicant until you approve.</p>
                <label className="field-label" htmlFor="ainotes">Anything the questions should focus on (optional)</label>
                <textarea id="ainotes" className="input min-h-16 mb-3" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="For example: their experience leading a team, or how they handle tight deadlines." />
                <button className="btn btn-primary" onClick={draft} disabled={busy}>{busy ? "Drafting questions…" : "Draft questions with AI"}</button>
              </div>
            ) : <p className="text-sm text-muted border-t border-b border-rule py-5">AI interviews are for shortlisted candidates. Shortlist this person to set one up.</p>
          )}
          {open?.status === "draft" && <DraftEditor key={open.id + open.questions.map((q) => q.text).join("|")} interview={open} onRegenerate={draft} regenerating={busy} />}
          {open?.status === "approved" && (
            <div className="border border-rule p-5">
              <p className="font-semibold">Approved and sent. Waiting for the applicant.</p>
              <p className="text-sm text-muted mt-1">{open.questions.length} questions. Approved {open.approvedAt ? formatDate(open.approvedAt) : ""}; the link works until {open.expiresAt ? formatDate(open.expiresAt) : "7 days"}.</p>
              <button className="btn btn-sm mt-3" onClick={() => setCancelOpen(true)}>Cancel this interview</button>
            </div>
          )}
          {open?.status === "in_progress" && <p className="border border-rule p-5">The applicant has started the interview and has not submitted it yet.</p>}
          {open?.status === "completed" && <Completed interview={open} decide={decide} onRetry={() => { summaryFor.current = null; aiInterviewService.generateSummary(open.id).catch((e) => toast.error(say(e, "Could not write the summary."))); }} />}
          {data?.status === "cancelled" && !open && eligible && <p className="text-xs text-muted mt-2">The last AI interview was cancelled.</p>}
        </>
      )}
      <ConfirmDialog open={cancelOpen} onCancel={() => setCancelOpen(false)} onConfirm={cancel} busy={busy} title="Cancel this AI interview?" confirmLabel="Cancel interview"
        body="The applicant will no longer be able to take it. You can set up a new one afterwards." />
    </section>
  );
}
