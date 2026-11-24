"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check } from "lucide-react";
import { useSession } from "@/lib/hooks/useSession";
import { useAsync } from "@/lib/hooks/useAsync";
import { jobsService } from "@/lib/services/jobsService";
import { resumeService } from "@/lib/services/resumeService";
import { applicationsService } from "@/lib/services/applicationsService";
import { money } from "@/lib/utils/format";
import { Breadcrumbs, PageHeader } from "@/components/ui/bits";
import { EmptyState, ErrorState, SkeletonBlock } from "@/components/ui/states";
import { Field } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";

const schema = z.object({
  resumeChoice: z.enum(["current", "new"]),
  coverNote: z.string().max(1200, "Keep the cover note under 1,200 characters."),
  answers: z.record(z.string(), z.string().min(10, "Answer in at least a sentence (10 characters).")),
  expectedSalary: z.number({ error: "Enter your expected yearly salary." }).positive("Enter your expected yearly salary."),
  noticeDays: z.number({ error: "Enter your notice period in days." }).min(0, "Cannot be negative.").max(180, "Enter 180 days or fewer."),
});
type Values = z.infer<typeof schema>;

export default function ApplyPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useSession();
  const { data, error, reload } = useAsync(async () => {
    const [detail, profile] = await Promise.all([jobsService.getJobDetail(id, user!.applicantId), resumeService.getProfile(user!.applicantId!)]);
    return { ...detail, ...profile };
  }, [id, user?.id]);
  const [step, setStep] = useState<"form" | "review" | "done">("form");
  const [file, setFile] = useState<File | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [appId, setAppId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: data ? { resumeChoice: "current", coverNote: "", answers: Object.fromEntries(data.job.screeningQuestions.map((q) => [q.id, ""])), expectedSalary: data.applicant.expectedSalary || 0, noticeDays: data.applicant.noticeDays } : undefined,
    resetOptions: { keepDirtyValues: true },
  });
  const { register, handleSubmit, getValues, control, formState: { errors } } = form;
  const choice = useWatch({ control, name: "resumeChoice" });

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <SkeletonBlock className="h-[28rem]" />;
  const { job, company, applicant, resume, eligibility, existingApplicationId } = data;
  const crumbs = [{ label: "Jobs", href: "/jobs" }, { label: job.title, href: `/jobs/${job.id}` }, { label: "Apply" }];

  if (existingApplicationId && step !== "done") return <><Breadcrumbs items={crumbs} /><EmptyState title="You have already applied" body="Each role takes one application. You can follow its progress or withdraw it from your applications." action={{ label: "View application", href: `/applications/${existingApplicationId}` }} /></>;
  if (!eligibility) return <><Breadcrumbs items={crumbs} /><EmptyState title="Add your resume first" body="We check the role's hard requirements against your profile before you apply." action={{ label: "Upload resume", href: "/onboarding" }} /></>;
  if (job.status !== "Open") return <><Breadcrumbs items={crumbs} /><EmptyState title="This role is closed" body="It is no longer accepting applications. Browse other roles that fit your profile." action={{ label: "Browse jobs", href: "/jobs" }} /></>;
  if (!eligibility.eligible && !job.allowIneligible) return <><Breadcrumbs items={crumbs} /><EmptyState title="You cannot apply to this role" body={`The recruiter requires every hard requirement. Not met: ${eligibility.checks.filter((c) => !c.pass).map((c) => c.label).join("; ")}.`} action={{ label: "See requirements", href: `/jobs/${job.id}` }} /></>;

  async function submit() {
    setSubmitting(true); setSubmitError(null);
    const v = getValues();
    try {
      if (v.resumeChoice === "new" && file) await resumeService.attachResume(applicant.id, file);
      const app = await applicationsService.apply({ jobId: job.id, applicantId: applicant.id, coverNote: v.coverNote, answers: v.answers, expectedSalary: v.expectedSalary, noticeDays: v.noticeDays });
      setAppId(app.id); setStep("done");
      toast.success(`Application sent to ${company.name}.`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Could not submit your application.");
    } finally { setSubmitting(false); }
  }

  const steps = ["Details", "Review", "Sent"];
  const stepIdx = step === "form" ? 0 : step === "review" ? 1 : 2;

  return (
    <div className="max-w-3xl">
      <Breadcrumbs items={crumbs} />
      <PageHeader eyebrow={`${company.name} · ${job.location}`} title={step === "done" ? "Application sent" : `Apply: ${job.title}`} />
      <ol className="flex gap-6 text-sm mb-8" aria-label="Progress">
        {steps.map((s, i) => <li key={s} aria-current={i === stepIdx ? "step" : undefined} className={`pb-1 border-b-2 ${i === stepIdx ? "border-accent font-semibold" : "border-transparent text-muted"}`}>{i + 1}. {s}</li>)}
      </ol>

      {!eligibility.eligible && step !== "done" && (
        <p role="note" className="border-l-2 border-accent pl-3 mb-8 text-sm"><strong>You are applying without meeting every requirement.</strong> The recruiter will see which ones: {eligibility.checks.filter((c) => !c.pass).map((c) => c.label).join("; ")}.</p>
      )}

      {step === "form" && (
        <form onSubmit={handleSubmit(() => setStep("review"))} noValidate className="space-y-8">
          <fieldset>
            <legend className="field-label">Resume</legend>
            <div className="space-y-2 text-sm">
              <label className="flex items-start gap-2"><input type="radio" className="mt-1" value="current" {...register("resumeChoice")} /> <span>Use my saved resume: <strong>{resume?.fileName ?? "none saved"}</strong></span></label>
              <label className="flex items-start gap-2"><input type="radio" className="mt-1" value="new" {...register("resumeChoice")} /> <span>Upload a different file for this application (it becomes your saved resume)</span></label>
              {choice === "new" && <div className="pl-6"><input type="file" accept=".pdf,.docx,.txt" aria-label="Choose resume file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />{!file && <p className="field-error">Choose a file, or switch back to your saved resume.</p>}</div>}
            </div>
          </fieldset>
          <Field label="Cover note" hint="Optional, but recruiters score it. Name the role and give one result." error={errors.coverNote}>{(p) => <textarea className="input min-h-36" {...p} {...register("coverNote")} />}</Field>
          {job.screeningQuestions.length > 0 && (
            <fieldset className="space-y-5">
              <legend className="field-label">Questions from the recruiter</legend>
              {job.screeningQuestions.map((q) => (
                <Field key={q.id} label={q.text} required error={errors.answers?.[q.id]}>{(p) => <textarea className="input" {...p} {...register(`answers.${q.id}`)} />}</Field>
              ))}
            </fieldset>
          )}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={`Expected yearly salary (${applicant.salaryCurrency})`} required error={errors.expectedSalary} hint={`Posted range: ${money(job.salaryMin, job.currency)} to ${money(job.salaryMax, job.currency)}`}>{(p) => <input className="input" type="number" {...p} {...register("expectedSalary", { valueAsNumber: true })} />}</Field>
            <Field label="Notice period (days)" required error={errors.noticeDays} hint={`The team can wait up to ${job.requirements.maxNoticeDays} days.`}>{(p) => <input className="input" type="number" {...p} {...register("noticeDays", { valueAsNumber: true })} />}</Field>
          </div>
          <button className="btn btn-primary btn-lg" disabled={choice === "new" && !file}>Review application</button>
        </form>
      )}

      {step === "review" && (() => {
        const v = getValues();
        return (
          <div>
            <dl className="border-t border-ink">
              {[
                ["Resume", v.resumeChoice === "new" && file ? file.name : resume?.fileName ?? "None"],
                ["Cover note", v.coverNote || "No cover note"],
                ...job.screeningQuestions.map((q) => [q.text, v.answers[q.id]] as [string, string]),
                ["Expected salary", money(v.expectedSalary, applicant.salaryCurrency)],
                ["Notice period", `${v.noticeDays} days`],
              ].map(([k, val]) => (
                <div key={k} className="grid sm:grid-cols-[14rem_1fr] gap-1 sm:gap-6 py-3 border-b border-rule"><dt className="text-sm text-muted">{k}</dt><dd className="whitespace-pre-wrap">{val}</dd></div>
              ))}
            </dl>
            <div aria-live="polite">{submitError && <p role="alert" className="field-error mt-4">{submitError}</p>}</div>
            <div className="flex gap-3 mt-6">
              <button className="btn" onClick={() => setStep("form")} disabled={submitting}>Edit</button>
              <button className="btn btn-primary btn-lg" onClick={submit} disabled={submitting}>{submitting ? "Sending…" : "Submit application"}</button>
            </div>
          </div>
        );
      })()}

      {step === "done" && (
        <div role="status">
          <p className="flex items-center gap-2 text-xl"><Check aria-hidden /> {company.name} has your application for {job.title}.</p>
          <ol className="mt-6 border-t border-ink max-w-lg">
            {["Your requirements are checked automatically.", "The recruiter scores applicants against their criteria.", "You are notified when your stage changes, and if you are not taken forward you will see why."].map((t, i) => <li key={t} className="py-3 border-b border-rule grid grid-cols-[2rem_1fr]"><span className="font-display text-accent">{i + 1}</span>{t}</li>)}
          </ol>
          <div className="flex gap-3 mt-8"><Link href={`/applications/${appId}`} className="btn btn-primary">Track this application</Link><Link href="/jobs" className="btn">Keep browsing</Link></div>
        </div>
      )}
    </div>
  );
}
