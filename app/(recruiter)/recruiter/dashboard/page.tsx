"use client";
import Link from "next/link";
import { useSession } from "@/lib/hooks/useSession";
import { useAsync } from "@/lib/hooks/useAsync";
import { applicationsService } from "@/lib/services/applicationsService";
import { STALE_DAYS } from "@/lib/config";
import { formatDate } from "@/lib/utils/format";
import { PageHeader, Stat } from "@/components/ui/bits";
import { EmptyState, ErrorState, SkeletonBlock } from "@/components/ui/states";

export default function Dashboard() {
  const { user } = useSession();
  const { data, error, reload } = useAsync(() => applicationsService.dashboard(user!.id), [user?.id]);

  return (
    <>
      <PageHeader eyebrow="Recruiter" title={`Good to see you, ${user?.name.split(" ")[0]}`}
        description="Where your hiring stands today."
        actions={<Link href="/recruiter/jobs/new" className="btn btn-primary">Post a job</Link>} />
      {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <SkeletonBlock className="h-72" /> : (
        <>
          <section aria-label="Summary" className="grid gap-x-8 gap-y-2 grid-cols-2 lg:grid-cols-5 mb-14">
            <Stat label="Open roles" value={data.openRoles} />
            <Stat label="Awaiting review" value={data.awaiting} accent={data.awaiting > 0} note="Applied, not yet screened" />
            <Stat label="Shortlisted" value={data.shortlisted} />
            <Stat label="Interviews this week" value={data.interviewsThisWeek} />
            <Stat label="Roles filled" value={data.filled} />
          </section>

          <div className="grid gap-14 lg:grid-cols-2">
            <section aria-labelledby="attn">
              <h2 id="attn" className="text-3xl mb-1">Needs your attention</h2>
              <p className="text-sm text-muted mb-4">Open roles with applicants waiting {STALE_DAYS}+ days, or with applicants who miss a hard requirement.</p>
              {data.attention.length === 0 ? <EmptyState title="Nothing is waiting" body="Every open role has been reviewed recently. New applicants will appear here." action={{ label: "See all roles", href: "/recruiter/jobs" }} /> : (
                <ul className="border-t border-ink">
                  {data.attention.map(({ job, waiting, oldest, ineligible, unscored }) => (
                    <li key={job.id} className="py-4 border-b border-rule">
                      <Link href={`/recruiter/jobs/${job.id}`} className="font-display text-xl hover:text-accent hover:underline underline-offset-4">{job.title}</Link>
                      <p className="text-sm mt-1"><strong className="num">{waiting}</strong> {waiting === 1 ? "applicant" : "applicants"} waiting{oldest > 0 ? `, the oldest for ${oldest} days` : ""}.
                        {ineligible > 0 && <> <strong className="num">{ineligible}</strong> fail a hard requirement.</>}
                        {unscored > 0 && <> {unscored} not yet scored.</>}
                      </p>
                      <p className="text-sm mt-1.5 flex gap-4">
                        <Link className="link" href={`/recruiter/jobs/${job.id}`}>Review applicants</Link>
                        <Link className="link" href={`/recruiter/jobs/${job.id}/criteria`}>Score them</Link>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="iv">
              <h2 id="iv" className="text-3xl mb-1">Interviews this week</h2>
              <p className="text-sm text-muted mb-4">Scheduled for the next seven days.</p>
              {data.interviews.length === 0 ? <EmptyState title="No interviews booked" body="Shortlist a candidate and schedule an interview to see it here." action={{ label: "Review roles", href: "/recruiter/jobs" }} /> : (
                <ul className="border-t border-ink">
                  {data.interviews.map(({ application: a, applicant, job }) => (
                    <li key={a.id} className="py-4 border-b border-rule grid grid-cols-[6.5rem_1fr] gap-3">
                      <div className="num"><p className="font-semibold">{formatDate(a.interview!.date)}</p><p className="text-sm text-muted">{a.interview!.time}</p></div>
                      <div>
                        <Link href={`/recruiter/candidates/${a.id}`} className="font-semibold hover:text-accent hover:underline underline-offset-4">{applicant.name}</Link>
                        <p className="text-sm text-muted">{job.title} · {a.interview!.mode} · {a.interview!.status === "Scheduled" ? "awaiting reply" : a.interview!.status.toLowerCase()}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}
