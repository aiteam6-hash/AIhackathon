"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CalendarClock, MapPin, Mic, Video } from "lucide-react";
import { useSession } from "@/lib/hooks/useSession";
import { useAsync } from "@/lib/hooks/useAsync";
import { applicationsService } from "@/lib/services/applicationsService";
import { aiInterviewService } from "@/lib/services/aiInterviewService";
import { formatDate, money } from "@/lib/utils/format";
import { AIBadge, Breadcrumbs, PageHeader, StageMark } from "@/components/ui/bits";
import { ErrorState, SkeletonBlock } from "@/components/ui/states";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { StageTimeline } from "@/components/applications/stage-timeline";
import { RequirementsChecklist } from "@/components/jobs/job-parts";

export default function ApplicationDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, isDemo } = useSession();
  const { data, error, reload } = useAsync(() => applicationsService.getForApplicant(id, user!.applicantId!), [id, user?.id]);
  // AI interviews exist only for real accounts; demo accounts skip the lookup.
  const aiIv = useAsync(async () => (isDemo ? null : aiInterviewService.get(id)), [id, isDemo]);
  const [withdraw, setWithdraw] = useState(false);
  const [busy, setBusy] = useState(false);

  if (error) return <><Breadcrumbs items={[{ label: "My applications", href: "/applications" }, { label: "Application" }]} /><ErrorState message={error} onRetry={reload} /></>;
  if (!data) return <SkeletonBlock className="h-[30rem]" />;
  const { application: a, job, company, applicant } = data;
  const active = !["Rejected", "Withdrawn", "Hired"].includes(a.stage);

  async function doWithdraw() {
    setBusy(true);
    await applicationsService.withdraw(a.id);
    setBusy(false); setWithdraw(false);
    toast.success("Application withdrawn.");
  }
  async function respond(r: "Accepted" | "Reschedule requested") {
    setBusy(true);
    try { await applicationsService.respondToInterview(a.id, r); toast.success(r === "Accepted" ? "Interview accepted. The recruiter has been told." : "Reschedule request sent."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not send your response."); }
    setBusy(false);
  }

  return (
    <>
      <Breadcrumbs items={[{ label: "My applications", href: "/applications" }, { label: job.title }]} />
      <PageHeader eyebrow={`${company.name} · ${job.location}`} title={job.title}
        actions={<>
          <Link href={`/jobs/${job.id}`} className="btn btn-sm">View job</Link>
          {active && <button className="btn btn-sm" onClick={() => setWithdraw(true)}>Withdraw application</button>}
        </>}
        description={<span className="inline-flex items-center gap-3">Status: <StageMark stage={a.stage} /> · Applied {formatDate(a.appliedAt)}</span>} />

      <section aria-label="Timeline" className="mb-12"><StageTimeline application={a} /></section>

      {a.stage === "Rejected" && a.feedback && (
        <section aria-labelledby="fb" className="border border-ink p-6 md:p-8 mb-12 max-w-3xl">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <p className="eyebrow">Not taken forward at the {a.rejectedAtStage ?? a.feedback.stage} stage</p>
            <AIBadge>{a.feedback.edited ? "AI-generated, edited by recruiter" : "AI-generated"}</AIBadge>
          </div>
          <h2 id="fb" className="text-3xl mb-3">Why this was not a match</h2>
          <p className="mb-5 max-w-prose">{a.feedback.message}</p>
          <h3 className="text-xl mb-2">What drove the decision</h3>
          <ul className="list-disc pl-5 space-y-2 mb-6">{a.feedback.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          <h3 className="text-xl mb-2">What would help next time</h3>
          <ol className="list-decimal pl-5 space-y-2">{a.feedback.improvements.map((r) => <li key={r}>{r}</li>)}</ol>
          <p className="text-xs text-muted mt-6">Written from your profile and the role&apos;{"s"} requirements{a.score ? `, and a score based on: ${a.score.basedOn.map((b) => b.label).join(", ")}` : ""}. A recruiter reviewed the decision.</p>
          <Link href="/jobs" className="btn mt-5 btn-sm">Find roles that fit better</Link>
        </section>
      )}
      {a.stage === "Rejected" && !a.feedback && <p className="mb-12 text-muted">This application was not taken forward at the {a.rejectedAtStage} stage. No written feedback was recorded.</p>}

      {a.stage === "Offer" && <section className="border border-accent p-6 mb-12 max-w-3xl" role="status"><h2 className="text-3xl mb-2">You have an offer</h2><p>{company.name} would like to make you an offer for {job.title}. The recruiter will contact you at {applicant.email} with the details.</p></section>}
      {a.stage === "Hired" && <section className="border border-accent p-6 mb-12 max-w-3xl" role="status"><h2 className="text-3xl mb-2">You are hired</h2><p>Congratulations. {company.name} marked you as hired for {job.title}.</p></section>}

      {aiIv.data && (aiIv.data.status === "approved" || aiIv.data.status === "in_progress") && (
        <section aria-labelledby="aiiv" className="border border-accent p-6 mb-12 max-w-3xl">
          <p className="eyebrow mb-1">Action needed</p>
          <h2 id="aiiv" className="text-3xl mb-2">You have an AI interview to complete</h2>
          <p className="mb-4">{company.name} approved a short interview call with {aiIv.data.questions.length} questions. Answer by voice or by typing, whichever you prefer.{aiIv.data.expiresAt ? ` Please finish by ${formatDate(aiIv.data.expiresAt)}.` : ""}</p>
          <Link href={`/applications/${a.id}/ai-interview`} className="btn btn-primary"><Mic size={16} aria-hidden /> {aiIv.data.status === "in_progress" ? "Continue the interview" : "Start the interview"}</Link>
        </section>
      )}
      {aiIv.data?.status === "completed" && (
        <p className="mb-12 max-w-3xl text-sm border-l-2 border-accent pl-3" role="status">You completed your AI interview{aiIv.data.completedAt ? ` on ${formatDate(aiIv.data.completedAt)}` : ""}. The recruiter will review it.</p>
      )}

      {a.interview && a.stage === "Interview" && (
        <section aria-labelledby="iv" className="mb-12 max-w-3xl">
          <h2 id="iv" className="text-3xl mb-4">Your interview</h2>
          <dl className="border-t border-ink">
            <div className="grid sm:grid-cols-[10rem_1fr] py-3 border-b border-rule"><dt className="text-muted text-sm">When</dt><dd className="flex items-center gap-2 num"><CalendarClock size={16} aria-hidden /> {formatDate(a.interview.date)}, {a.interview.time}</dd></div>
            <div className="grid sm:grid-cols-[10rem_1fr] py-3 border-b border-rule"><dt className="text-muted text-sm">Mode</dt><dd className="flex items-center gap-2">{a.interview.mode === "Onsite" ? <MapPin size={16} aria-hidden /> : <Video size={16} aria-hidden />} {a.interview.mode}</dd></div>
            <div className="grid sm:grid-cols-[10rem_1fr] py-3 border-b border-rule"><dt className="text-muted text-sm">{a.interview.mode === "Onsite" ? "Where" : "Link or number"}</dt><dd className="break-all">{a.interview.link}</dd></div>
            <div className="grid sm:grid-cols-[10rem_1fr] py-3 border-b border-rule"><dt className="text-muted text-sm">Panel</dt><dd>{a.interview.panel.join(", ")}</dd></div>
            <div className="grid sm:grid-cols-[10rem_1fr] py-3 border-b border-rule"><dt className="text-muted text-sm">Your response</dt><dd className="font-semibold">{a.interview.status === "Scheduled" ? "Waiting for you" : a.interview.status}</dd></div>
          </dl>
          <div className="flex flex-wrap gap-2 mt-4">
            <button className="btn btn-primary" disabled={busy || a.interview.status === "Accepted"} onClick={() => respond("Accepted")}>{a.interview.status === "Accepted" ? "Accepted" : "Accept interview"}</button>
            <button className="btn" disabled={busy || a.interview.status === "Reschedule requested"} onClick={() => respond("Reschedule requested")}>{a.interview.status === "Reschedule requested" ? "Reschedule requested" : "Request a different time"}</button>
          </div>
        </section>
      )}

      <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr] max-w-5xl">
        <section>
          <h2 className="text-2xl mb-3">What you sent</h2>
          <dl className="border-t border-ink">
            <div className="py-3 border-b border-rule"><dt className="text-sm text-muted">Cover note</dt><dd className="whitespace-pre-wrap">{a.coverNote || "No cover note."}</dd></div>
            {job.screeningQuestions.map((q) => <div key={q.id} className="py-3 border-b border-rule"><dt className="text-sm text-muted">{q.text}</dt><dd className="whitespace-pre-wrap">{a.answers[q.id] || "No answer."}</dd></div>)}
            <div className="py-3 border-b border-rule"><dt className="text-sm text-muted">Expected salary and notice</dt><dd className="num">{money(a.expectedSalary, applicant.salaryCurrency)} · {a.noticeDays} days</dd></div>
          </dl>
          <h2 className="text-2xl mt-10 mb-3">History</h2>
          <ol className="border-t border-ink">{[...a.history].reverse().map((h, i) => <li key={i} className="py-2.5 border-b border-rule text-sm flex justify-between gap-4"><span><strong>{h.stage}</strong>{h.note ? ` · ${h.note}` : ""}</span><span className="text-muted num">{formatDate(h.at)}</span></li>)}</ol>
        </section>
        <aside><RequirementsChecklist eligibility={a.eligibility} title="Requirements when you applied" /></aside>
      </div>

      <ConfirmDialog open={withdraw} onCancel={() => setWithdraw(false)} onConfirm={doWithdraw} busy={busy} title="Withdraw this application?" confirmLabel="Withdraw"
        body={`${company.name} will be told you withdrew from ${job.title}. You cannot undo this, but you can apply again while the role is open.`} />
    </>
  );
}
