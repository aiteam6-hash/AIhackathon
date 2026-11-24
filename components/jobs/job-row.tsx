import Link from "next/link";
import { Check, X } from "lucide-react";
import type { JobListing } from "@/lib/services/jobsService";
import { relativeDays, salaryRange } from "@/lib/utils/format";

export function JobRow({ row }: { row: JobListing }) {
  const { job, company, match, eligibility } = row;
  return (
    <article className="py-6 border-b border-rule grid gap-4 sm:grid-cols-[1fr_auto]">
      <div>
        <h2 className="text-2xl md:text-[1.7rem]"><Link href={`/jobs/${job.id}`} className="hover:text-accent hover:underline underline-offset-4">{job.title}</Link></h2>
        <p className="text-sm text-muted mt-1">{company.name} · {job.location} · {job.workMode} · {job.employmentType} · {job.level}</p>
        {match && <p className="mt-2.5">{match.oneLine}</p>}
        {!match && <p className="mt-2.5 text-muted line-clamp-2">{job.description}</p>}
        <p className="text-sm text-muted mt-2.5 num">{salaryRange(job)} · Posted {relativeDays(job.postedAt)}</p>
      </div>
      {match && eligibility && (
        <div className="sm:text-right sm:min-w-32">
          <p className="font-display text-5xl text-accent num leading-none">{match.percent}<span className="text-2xl">%</span></p>
          <p className="text-[11px] uppercase tracking-wider text-muted mt-1">AI match</p>
          <p className="text-sm mt-2 inline-flex items-center gap-1.5">
            {eligibility.eligible ? <><Check size={14} aria-hidden /> You are eligible</> : <><X size={14} aria-hidden /> <span className="font-semibold text-accent-deep">Not eligible</span></>}
          </p>
        </div>
      )}
    </article>
  );
}
