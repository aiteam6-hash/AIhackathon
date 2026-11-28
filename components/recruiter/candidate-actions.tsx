"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Feedback, Stage } from "@/types";
import { useSession } from "@/lib/hooks/useSession";
import { useAsync } from "@/lib/hooks/useAsync";
import { aiService } from "@/lib/services/aiService";
import { applicationsService } from "@/lib/services/applicationsService";
import { Modal } from "@/components/ui/dialog";
import { AIBadge } from "@/components/ui/bits";
import { Field } from "@/components/ui/field";
import { ErrorState, SkeletonBlock } from "@/components/ui/states";
import { toast } from "@/components/ui/toaster";

/* ----------------------------- Reject ----------------------------- */
function RejectForm({ applicationId, stage, name, initial, onClose }: { applicationId: string; stage: Stage; name: string; initial: Feedback; onClose: () => void }) {
  const [message, setMessage] = useState(initial.message);
  const [reasons, setReasons] = useState(initial.reasons.join("\n"));
  const [improvements, setImprovements] = useState(initial.improvements.join("\n"));
  const [busy, setBusy] = useState(false);
  const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
  const invalid = !message.trim() || lines(reasons).length === 0;

  async function send() {
    setBusy(true);
    const fb: Feedback = { ...initial, message: message.trim(), reasons: lines(reasons), improvements: lines(improvements), edited: message !== initial.message || reasons !== initial.reasons.join("\n") || improvements !== initial.improvements.join("\n") };
    try { await applicationsService.reject(applicationId, fb); toast.success(`${name} was rejected and the feedback was sent.`); onClose(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not reject this candidate."); setBusy(false); }
  }
  return (
    <div className="space-y-4">
      <p className="text-sm flex flex-wrap items-center gap-2"><AIBadge /> Drafted for the <strong>{stage}</strong> stage from the resume, the hard requirements and the scores. {name} will see exactly this text. Edit anything.</p>
      <Field label="Message to the applicant">{(p) => <textarea className="input min-h-24" value={message} onChange={(e) => setMessage(e.target.value)} {...p} />}</Field>
      <Field label="Reasons (one per line)" hint="Two to four specific reasons." error={lines(reasons).length === 0 ? "Add at least one reason." : undefined}>{(p) => <textarea className="input min-h-28" value={reasons} onChange={(e) => setReasons(e.target.value)} {...p} />}</Field>
      <Field label="What to improve (one per line)">{(p) => <textarea className="input min-h-24" value={improvements} onChange={(e) => setImprovements(e.target.value)} {...p} />}</Field>
      <div className="flex justify-end gap-2 pt-2">
        <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" onClick={send} disabled={busy || invalid}>{busy ? "Sending…" : "Reject and send feedback"}</button>
      </div>
    </div>
  );
}

export function RejectDialog({ applicationId, onClose }: { applicationId: string | null; onClose: () => void }) {
  const { data, error, reload } = useAsync(async () => {
    if (!applicationId) return null;
    const b = await applicationsService.getCandidate(applicationId);
    return { b, fb: await aiService.generateRejectionFeedback(b.application, b.application.stage) };
  }, [applicationId]);
  return (
    <Modal open={!!applicationId} onClose={onClose} title="Reject with feedback" wide>
      {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <div aria-live="polite"><p className="text-sm text-muted mb-3">Drafting feedback…</p><SkeletonBlock className="h-56" /></div>
        : <RejectForm key={applicationId} applicationId={applicationId!} stage={data.b.application.stage} name={data.b.applicant.name} initial={data.fb} onClose={onClose} />}
    </Modal>
  );
}

/* ----------------------------- Schedule ----------------------------- */
const schema = z.object({
  date: z.string().min(1, "Pick a date."),
  time: z.string().min(1, "Pick a time."),
  mode: z.enum(["Video", "Phone", "Onsite"]),
  link: z.string().min(3, "Add a meeting link, phone number or address."),
  panel: z.string().min(2, "List at least one interviewer."),
});
type SV = z.infer<typeof schema>;

function ScheduleForm({ applicationId, name, existing, onClose }: { applicationId: string; name: string; existing?: SV; onClose: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SV>({
    resolver: zodResolver(schema),
    defaultValues: existing ?? { date: "", time: "11:00", mode: "Video", link: "", panel: "" },
  });
  const submit = handleSubmit(async (v) => {
    await applicationsService.scheduleInterview(applicationId, { date: v.date, time: v.time, mode: v.mode, link: v.link, panel: v.panel.split(",").map((p) => p.trim()).filter(Boolean) });
    toast.success(`Interview scheduled. ${name} can see it in their account.`);
    onClose();
  });
  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      <Field label="Date" required error={errors.date}>{(p) => <input type="date" min={today} className="input" {...p} {...register("date")} />}</Field>
      <Field label="Time" required error={errors.time}>{(p) => <input type="time" className="input" {...p} {...register("time")} />}</Field>
      <Field label="Mode">{(p) => <select className="input" {...p} {...register("mode")}><option>Video</option><option>Phone</option><option>Onsite</option></select>}</Field>
      <Field label="Link, number or address" required error={errors.link}>{(p) => <input className="input" {...p} {...register("link")} />}</Field>
      <div className="sm:col-span-2"><Field label="Panel" required hint="Separate names with commas." error={errors.panel}>{(p) => <input className="input" {...p} {...register("panel")} />}</Field></div>
      <div className="sm:col-span-2 flex justify-end gap-2"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={isSubmitting}>{isSubmitting ? "Scheduling…" : "Schedule interview"}</button></div>
    </form>
  );
}

export function ScheduleDialog({ applicationId, onClose }: { applicationId: string | null; onClose: () => void }) {
  const { data } = useAsync(async () => (applicationId ? applicationsService.getCandidate(applicationId) : null), [applicationId]);
  const ex = data?.application.interview;
  return (
    <Modal open={!!applicationId} onClose={onClose} title={ex ? "Reschedule interview" : "Schedule interview"} description={data ? `${data.applicant.name} for ${data.job.title}` : undefined} wide>
      {!data ? <SkeletonBlock className="h-40" /> : <ScheduleForm key={applicationId} applicationId={applicationId!} name={data.applicant.name} onClose={onClose} existing={ex ? { date: ex.date, time: ex.time, mode: ex.mode, link: ex.link, panel: ex.panel.join(", ") } : undefined} />}
    </Modal>
  );
}

/* ----------------------------- Hire ----------------------------- */
export function HireDialog({ applicationId, onClose }: { applicationId: string | null; onClose: () => void }) {
  const { data } = useAsync(async () => {
    if (!applicationId) return null;
    const b = await applicationsService.getCandidate(applicationId);
    return { b, rest: await applicationsService.remainingCount(b.job.id, applicationId) };
  }, [applicationId]);
  const [filled, setFilled] = useState(true);
  const [feedback, setFeedback] = useState(true);
  const [busy, setBusy] = useState(false);
  async function hire() {
    setBusy(true);
    try {
      const r = await applicationsService.markHired(applicationId!, { markFilled: filled, feedbackToRest: feedback });
      toast.success(`${data?.b.applicant.name} is marked as hired.${r.notified ? ` Feedback sent to ${r.notified} other applicants.` : ""}${filled ? " The role is filled." : ""}`);
      onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not mark as hired."); }
    setBusy(false);
  }
  return (
    <Modal open={!!applicationId} onClose={onClose} title="Mark as hired"
      footer={<><button className="btn" onClick={onClose} disabled={busy}>Cancel</button><button className="btn btn-primary" onClick={hire} disabled={busy || !data}>{busy ? "Working…" : "Confirm hire"}</button></>}>
      {!data ? <SkeletonBlock className="h-24" /> : (
        <div className="space-y-4 text-sm">
          <p><strong>{data.b.applicant.name}</strong> will be marked as hired for {data.b.job.title}. Close the loop while you are here:</p>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5" checked={filled} onChange={(e) => setFilled(e.target.checked)} /> <span>Mark the role as filled, so it stops accepting applications.</span></label>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5" checked={feedback} onChange={(e) => setFeedback(e.target.checked)} disabled={data.rest === 0} /> <span>Reject the {data.rest} other {data.rest === 1 ? "applicant" : "applicants"} still in the pipeline and send each one AI-drafted feedback naming their stage.</span></label>
        </div>
      )}
    </Modal>
  );
}

/** One place for stage moves that need a dialog (reject, interview, hire) and those that do not. */
export function useCandidateActions() {
  const [dlg, setDlg] = useState<{ type: "reject" | "schedule" | "hire"; id: string } | null>(null);
  const { isDemo } = useSession();
  async function move(id: string, to: Stage) {
    if (to === "Rejected") return setDlg({ type: "reject", id });
    if (to === "Interview") return setDlg({ type: "schedule", id });
    if (to === "Hired") return setDlg({ type: "hire", id });
    try { await applicationsService.moveStage([id], to); toast.success(to === "Shortlisted" && !isDemo ? "Shortlisted. Next, set up an AI interview on the candidate page." : `Moved to ${to}.`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not move this candidate."); }
  }
  const close = () => setDlg(null);
  const dialogs = (
    <>
      <RejectDialog applicationId={dlg?.type === "reject" ? dlg.id : null} onClose={close} />
      <ScheduleDialog applicationId={dlg?.type === "schedule" ? dlg.id : null} onClose={close} />
      <HireDialog applicationId={dlg?.type === "hire" ? dlg.id : null} onClose={close} />
    </>
  );
  return { move, schedule: (id: string) => setDlg({ type: "schedule", id }), dialogs };
}
