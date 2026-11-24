"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { effectiveScore } from "@/lib/ai/engine";
import { useAsync } from "@/lib/hooks/useAsync";
import { applicationsService } from "@/lib/services/applicationsService";
import { aiService } from "@/lib/services/aiService";
import { formatDate, formatDateTime, money } from "@/lib/utils/format";
import { AIBadge, AIBasis, Breadcrumbs, PageHeader, ScoreBar, StageMark } from "@/components/ui/bits";
import { ErrorState, Skeleton, SkeletonBlock } from "@/components/ui/states";
import { Modal } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { RequirementsChecklist } from "@/components/jobs/job-parts";
import { useCandidateActions } from "@/components/recruiter/candidate-actions";
import type { CriterionScore } from "@/types";

function OverrideDialog({ id, row, onClose }: { id: string; row: CriterionScore | null; onClose: () => void }) {
  return (
    <Modal open={!!row} onClose={onClose} title={`Override: ${row?.label ?? ""}`} description={row ? `The AI gave ${row.score}. Your score replaces it in the final score; the AI value stays on record.` : undefined}>
      {row && <OverrideForm key={row.criterionId} id={id} row={row} onClose={onClose} />}
    </Modal>
  );
}

function OverrideForm({ id, row, onClose }: { id: string; row: CriterionScore; onClose: () => void }) {
  const [score, setScore] = useState(effectiveScore(row));
  const [comment, setComment] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!comment.trim()) return setErr("Add a comment explaining the change. It is recorded with the override.");
    setBusy(true);
    try { await applicationsService.overrideScore(id, row.criterionId, score, comment); toast.success("Score overridden and logged."); onClose(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not save the override."); }
    setBusy(false);
  }
  return (
      <div className="space-y-4">
        <div><label htmlFor="ov-s" className="field-label">Your score: <span className="num">{score}</span></label><input id="ov-s" type="range" min={0} max={100} value={score} onChange={(e) => setScore(Number(e.target.value))} className="w-full" /></div>
        <div><label htmlFor="ov-c" className="field-label">Comment <span className="text-accent">*</span></label><textarea id="ov-c" className="input" value={comment} aria-invalid={!!err} onChange={(e) => setComment(e.target.value)} placeholder="For example: The resume understates her Kubernetes work, which she described on the call." /></div>
        {err && <p role="alert" className="field-error">{err}</p>}
        <div className="flex justify-end gap-2"><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save override"}</button></div>
      </div>
  );
}

export default function CandidatePage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useAsync(() => applicationsService.getCandidate(id), [id]);
  const actions = useCandidateActions();
  const [override, setOverride] = useState<CriterionScore | null>(null);
  const [note, setNote] = useState("");
  const [scoring, setScoring] = useState(false);
  const summaryFor = useRef<string | null>(null);

  // Generate the recruiter summary the first time a candidate is opened.
  const needsSummary = !!data && !data.application.summary;
  useEffect(() => {
    if (!needsSummary || summaryFor.current === id) return;
    summaryFor.current = id;
    aiService.summarizeApplication(data!.application).catch(() => { summaryFor.current = null; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsSummary, id]);

  if (error) return <><Breadcrumbs items={[{ label: "Roles", href: "/recruiter/jobs" }, { label: "Candidate" }]} /><ErrorState message={error} onRetry={reload} /></>;
  if (!data) return <SkeletonBlock className="h-[36rem]" />;
  const { application: a, applicant: p, resume, job } = data;
  const s = a.score;
  const active = !["Rejected", "Withdrawn", "Hired"].includes(a.stage);

  async function scoreNow() {
    setScoring(true);
    try { await applicationsService.scoreOne(a.id); toast.success("Scored with the role's saved criteria."); } catch (e) { toast.error(e instanceof Error ? e.message : "Scoring failed."); }
    setScoring(false);
  }
  async function addNote() {
    if (!note.trim()) return;
    await applicationsService.addNote(a.id, note.trim()); setNote(""); toast.success("Note added.");
  }

  return (
    <>
      <Breadcrumbs items={[{ label: "Roles", href: "/recruiter/jobs" }, { label: job.title, href: `/recruiter/jobs/${job.id}` }, { label: p.name }]} />
      <PageHeader eyebrow={`${job.title} · applied ${formatDate(a.appliedAt)}`} title={p.name}
        description={<span className="flex flex-wrap items-center gap-x-4 gap-y-1">{p.headline} · {p.location} · {p.experienceYears} yrs <StageMark stage={a.stage} />{a.stage === "Rejected" && a.rejectedAtStage && <span className="text-sm">(at {a.rejectedAtStage})</span>}</span>}
        actions={s && <div className="text-right"><p className="font-display text-6xl leading-none num">{s.final}</p><p className="text-xs uppercase tracking-wider text-muted mt-1">Final score</p></div>} />

      {/* Decision bar */}
      <div role="region" aria-label="Decisions" className="flex flex-wrap items-center gap-2 border border-ink p-3 mb-10">
        {active ? <>
          {a.stage !== "Shortlisted" && a.stage !== "Interview" && a.stage !== "Offer" && <button className="btn btn-sm btn-primary" onClick={() => actions.move(a.id, "Shortlisted")}>Shortlist</button>}
          <button className="btn btn-sm" onClick={() => actions.schedule(a.id)}>{a.interview ? "Reschedule interview" : "Schedule interview"}</button>
          {a.stage !== "Offer" && <button className="btn btn-sm" onClick={() => actions.move(a.id, "Offer")}>Move to offer</button>}
          <button className="btn btn-sm" onClick={() => actions.move(a.id, "Hired")}>Mark hired</button>
          <button className="btn btn-sm" onClick={() => actions.move(a.id, "Rejected")}>Reject with feedback</button>
        </> : a.stage === "Rejected" ? <>
          <span className="text-sm px-2">Rejected at {a.rejectedAtStage}. Reversing records an override.</span>
          <button className="btn btn-sm" onClick={() => actions.move(a.id, "Screening")}>Move back to Screening</button>
          <button className="btn btn-sm" onClick={() => actions.move(a.id, "Shortlisted")}>Shortlist anyway</button>
        </> : <span className="text-sm px-2">{a.stage === "Hired" ? "Hired." : "The applicant withdrew."}</span>}
        <Link href={`/recruiter/jobs/${job.id}`} className="link text-sm ml-auto px-2">Back to applicants</Link>
      </div>

      <div className="grid gap-12 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-12 min-w-0">
          <section aria-labelledby="sum">
            <div className="flex items-center justify-between gap-2 mb-3"><h2 id="sum" className="text-3xl">Summary</h2><AIBadge /></div>
            {a.summary ? <div className="space-y-1.5 max-w-prose">{a.summary.split("\n").map((l) => { const [h, ...r] = l.split(": "); return r.length ? <p key={l}><strong>{h}:</strong> {r.join(": ")}</p> : <p key={l}>{l}</p>; })}</div>
              : <div className="space-y-2" role="status" aria-label="Writing summary"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-2/3" /></div>}
            <p className="text-xs text-muted mt-3">{s ? <>Based on the scores below and the hard requirements.</> : "Based on the hard requirements; no scores yet."}</p>
          </section>

          <section aria-labelledby="scores">
            <div className="flex items-center justify-between gap-2 mb-3"><h2 id="scores" className="text-3xl">Scores and reasoning</h2><AIBadge /></div>
            {s ? (
              <>
                <div className="space-y-7">
                  {s.criteria.map((c) => (
                    <div key={c.criterionId}>
                      <ScoreBar label={c.label} weight={c.weight} value={effectiveScore(c)} overridden={!!c.override} />
                      <p className="text-sm mt-2 max-w-prose">{c.reasoning}</p>
                      {c.override && <p className="text-sm mt-1.5 border-l-2 border-accent pl-3"><strong>Manual score {c.override.score}</strong> (AI said {c.score}): {c.override.comment} <span className="text-muted">· {formatDateTime(c.override.at)}</span></p>}
                      <div className="mt-1.5 flex gap-3"><button className="link text-sm" onClick={() => setOverride(c)}>{c.override ? "Change override" : "Override this score"}</button>
                        {c.override && <button className="link text-sm" onClick={async () => { await applicationsService.clearOverride(a.id, c.criterionId); toast.success("Override removed."); }}>Use the AI score</button>}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 pt-4 border-t border-ink"><AIBasis score={s} /><p className="text-xs text-muted mt-1">Scored {formatDateTime(s.ranAt)}.</p></div>
              </>
            ) : (
              <div className="border border-rule p-6"><p className="mb-1 font-semibold">Not scored yet</p><p className="text-sm text-muted mb-4">Score this candidate on the role&apos;s {job.criteria.length} saved criteria, or run scoring for everyone from the criteria page.</p>
                <div className="flex flex-wrap gap-2"><button className="btn btn-primary btn-sm" onClick={scoreNow} disabled={scoring}>{scoring ? "Scoring…" : "Score this candidate"}</button><Link className="btn btn-sm" href={`/recruiter/jobs/${job.id}/criteria`}>Edit criteria</Link></div></div>
            )}
          </section>

          <section aria-labelledby="resume">
            <h2 id="resume" className="text-3xl mb-3">Resume</h2>
            {resume ? <><p className="text-sm text-muted mb-2">{resume.fileName} · uploaded {formatDate(resume.uploadedAt)}. Showing the text we extracted.</p><pre className="whitespace-pre-wrap font-sans text-sm border border-rule p-5 leading-relaxed bg-hover max-h-[28rem] overflow-y-auto">{resume.text}</pre></> : <p className="text-muted">No resume on file.</p>}
          </section>

          <section aria-labelledby="ans">
            <h2 id="ans" className="text-3xl mb-3">Application</h2>
            <dl className="border-t border-ink">
              <div className="py-3 border-b border-rule"><dt className="text-sm text-muted">Cover note</dt><dd className="whitespace-pre-wrap max-w-prose">{a.coverNote || "No cover note."}</dd></div>
              {job.screeningQuestions.map((q) => <div key={q.id} className="py-3 border-b border-rule"><dt className="text-sm text-muted">{q.text}</dt><dd className="whitespace-pre-wrap max-w-prose">{a.answers[q.id] || "No answer."}</dd></div>)}
              <div className="py-3 border-b border-rule"><dt className="text-sm text-muted">Expectation and availability</dt><dd className="num">{money(a.expectedSalary, p.salaryCurrency)} (posted {money(job.salaryMin, job.currency)} – {money(job.salaryMax, job.currency)}) · {a.noticeDays}-day notice</dd></div>
            </dl>
          </section>
        </div>

        <aside className="space-y-10 lg:border-l lg:border-rule lg:pl-10 min-w-0">
          <RequirementsChecklist eligibility={a.eligibility} title="Hard requirements" />
          {a.appliedAnyway && <p className="text-sm border-l-2 border-accent pl-3">This applicant applied without meeting every requirement, which you allowed on this role.</p>}

          {a.interview && (
            <section><h2 className="text-2xl mb-2">Interview</h2>
              <p className="num">{formatDate(a.interview.date)}, {a.interview.time} · {a.interview.mode}</p>
              <p className="text-sm break-all">{a.interview.link}</p><p className="text-sm text-muted">Panel: {a.interview.panel.join(", ")}</p>
              <p className="text-sm mt-1"><strong>Applicant response:</strong> {a.interview.status === "Scheduled" ? "waiting" : a.interview.status}</p></section>
          )}

          {a.feedback && (
            <section><div className="flex items-center justify-between mb-2"><h2 className="text-2xl">Feedback sent</h2><AIBadge>{a.feedback.edited ? "AI, edited" : "AI-generated"}</AIBadge></div>
              <ul className="list-disc pl-5 text-sm space-y-1">{a.feedback.reasons.map((r) => <li key={r}>{r}</li>)}</ul></section>
          )}

          <section aria-labelledby="notes">
            <h2 id="notes" className="text-2xl mb-2">Notes</h2>
            <label htmlFor="note" className="sr-only">Add a note</label>
            <textarea id="note" className="input min-h-20" placeholder="Private note for your team" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn btn-sm mt-2" onClick={addNote} disabled={!note.trim()}>Add note</button>
            <ul className="mt-3 border-t border-rule">{a.notes.length === 0 && <li className="text-sm text-muted py-3">No notes yet.</li>}{a.notes.map((n) => <li key={n.id} className="py-2.5 border-b border-rule text-sm"><p className="whitespace-pre-wrap">{n.text}</p><p className="text-xs text-muted">{formatDateTime(n.at)}</p></li>)}</ul>
          </section>

          {a.overrides.length > 0 && (
            <section><h2 className="text-2xl mb-2">Overrides</h2>
              <ul className="border-t border-rule">{[...a.overrides].reverse().map((o, i) => <li key={i} className="py-2.5 border-b border-rule text-sm"><p><strong>{o.type === "score" ? `Score: ${o.target}` : "Decision"}</strong> {o.from} → {o.to}</p><p className="text-muted">{o.comment} · {formatDateTime(o.at)}</p></li>)}</ul></section>
          )}

          <section><h2 className="text-2xl mb-2">Stage history</h2>
            <ol className="border-t border-rule">{[...a.history].reverse().map((h, i) => <li key={i} className="py-2 border-b border-rule text-sm flex justify-between gap-3"><span><strong>{h.stage}</strong> <span className="text-muted">by {h.by}{h.note ? `: ${h.note}` : ""}</span></span><span className="text-muted num shrink-0">{formatDate(h.at)}</span></li>)}</ol></section>
        </aside>
      </div>

      <OverrideDialog id={a.id} row={override} onClose={() => setOverride(null)} />
      {actions.dialogs}
    </>
  );
}
