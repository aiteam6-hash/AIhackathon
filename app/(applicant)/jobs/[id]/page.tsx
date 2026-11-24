"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "@/lib/hooks/useSession";
import { useAsync } from "@/lib/hooks/useAsync";
import { jobsService } from "@/lib/services/jobsService";
import { salaryRange, relativeDays } from "@/lib/utils/format";
import { Breadcrumbs } from "@/components/ui/bits";
import { ErrorState, SkeletonBlock } from "@/components/ui/states";
import { MatchBreakdown, RequirementsChecklist } from "@/components/jobs/job-parts";

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useSession();
  const { data, error, reload } = useAsync(() => jobsService.getJobDetail(id, user!.applicantId), [id, user?.id]);

  if (error) return <><Breadcrumbs items={[{ label: "Jobs", href: "/jobs" }, { label: "Job" }]} /><ErrorState message={error} onRetry={reload} /></>;
  if (!data) return <SkeletonBlock className="h-[32rem]" />;
  const { job, company, match, eligibility, existingApplicationId } = data;
  const failed = eligibility?.checks.filter((c) => !c.pass) ?? [];

  let action: React.ReactNode;
  if (existingApplicationId) action = <Link href={`/applications/${existingApplicationId}`} className="btn btn-lg">You applied. View application</Link>;
  else if (job.status !== "Open") action = <><button className="btn btn-lg" disabled aria-describedby="apply-note">Apply</button><p id="apply-note" className="text-sm text-muted mt-2 max-w-xs">This role is {job.status.toLowerCase()} and not accepting applications.</p></>;
  else if (!eligibility) action = <><Link href="/onboarding" className="btn btn-primary btn-lg">Add your resume to apply</Link><p className="text-sm text-muted mt-2 max-w-xs">We need your profile to check the requirements.</p></>;
  else if (eligibility.eligible) action = <Link href={`/apply/${job.id}`} className="btn btn-primary btn-lg">Apply for this role</Link>;
  else if (job.allowIneligible) action = <><Link href={`/apply/${job.id}`} className="btn btn-lg">Apply anyway</Link><p className="text-sm text-muted mt-2 max-w-xs">You miss {failed.length} {failed.length === 1 ? "requirement" : "requirements"}, but this recruiter accepts applications from people who do not meet them all.</p></>;
  else action = <><button className="btn btn-lg" disabled aria-describedby="apply-note">Apply for this role</button><p id="apply-note" className="text-sm mt-2 max-w-xs"><strong>You cannot apply.</strong> {failed.map((f) => f.label).join("; ")} {failed.length === 1 ? "is" : "are"} not met, and the recruiter requires all of them.</p></>;

  return (
    <article>
      <Breadcrumbs items={[{ label: "Jobs", href: "/jobs" }, { label: job.title }]} />
      <header className="pb-8 mb-8 border-b border-ink grid gap-6 md:grid-cols-[1fr_auto] items-end">
        <div>
          <p className="eyebrow mb-2">{company.name} · {job.department}</p>
          <h1 className="text-4xl md:text-6xl">{job.title}</h1>
          <p className="mt-4 text-muted">{job.location} · {job.workMode} · {job.employmentType} · {job.level} level</p>
          <p className="mt-1 num"><strong>{salaryRange(job)}</strong> <span className="text-muted">· Posted {relativeDays(job.postedAt)} · {job.openings} {job.openings === 1 ? "opening" : "openings"}</span></p>
        </div>
        <div className="md:text-right">{action}</div>
      </header>

      <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-10">
          <section><h2 className="text-2xl mb-3">About the role</h2><p className="leading-relaxed max-w-prose">{job.description}</p></section>
          <section>
            <h2 className="text-2xl mb-3">What you will do</h2>
            <ul className="border-t border-rule">{job.responsibilities.map((r) => <li key={r} className="py-3 border-b border-rule max-w-prose">{r}</li>)}</ul>
          </section>
          <section>
            <h2 className="text-2xl mb-3">Skills</h2>
            <p className="text-sm text-muted mb-2">Required</p>
            <div className="flex flex-wrap gap-2 mb-4">{job.requirements.requiredSkills.map((s) => <span key={s} className="chip chip-accent">{s}</span>)}</div>
            <p className="text-sm text-muted mb-2">Preferred</p>
            <div className="flex flex-wrap gap-2">{job.preferredSkills.map((s) => <span key={s} className="chip">{s}</span>)}</div>
          </section>
          <section>
            <h2 className="text-2xl mb-3">About {company.name}</h2>
            <p className="max-w-prose leading-relaxed">{company.about}</p>
            <p className="text-sm text-muted mt-2">{company.industry} · {company.size} · {company.city} · {company.website}</p>
          </section>
        </div>

        <aside className="space-y-10 lg:border-l lg:border-rule lg:pl-10">
          {eligibility ? <RequirementsChecklist eligibility={eligibility} title="Requirements and you" /> : (
            <section><h2 className="text-2xl mb-3">Requirements</h2>
              <ul className="list-disc pl-5 text-sm space-y-1">
                <li>{job.requirements.minExperience}+ years of experience</li>
                <li>Skills: {job.requirements.requiredSkills.join(", ")}</li>
                <li>{job.requirements.degree === "None" ? "No degree required" : `${job.requirements.degree} or higher`}</li>
                <li>Notice period up to {job.requirements.maxNoticeDays} days</li>
              </ul>
              <p className="text-sm text-muted mt-3"><Link className="link" href="/onboarding">Upload a resume</Link> to see which of these you meet.</p>
            </section>
          )}
          {match && <MatchBreakdown match={match} />}
        </aside>
      </div>
    </article>
  );
}
