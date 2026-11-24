"use client";
import Link from "next/link";
import { useSession } from "@/lib/hooks/useSession";
import { useAsync } from "@/lib/hooks/useAsync";
import { applicationsService } from "@/lib/services/applicationsService";
import { formatDate } from "@/lib/utils/format";
import { PageHeader, StageMark } from "@/components/ui/bits";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";

export default function ApplicationsPage() {
  const { user } = useSession();
  const { data, error, reload } = useAsync(() => applicationsService.listForApplicant(user!.applicantId!), [user?.id]);

  return (
    <>
      <PageHeader eyebrow="Applications" title="Where each application stands" description="Open an application to see its timeline and, if it was not taken forward, the stage and the reasons." />
      {error ? <ErrorState message={error} onRetry={reload} />
        : !data ? <SkeletonRows rows={4} label="Loading applications" />
        : data.length === 0 ? <EmptyState title="No applications yet" body="Roles that fit your profile are waiting on the jobs page. Applying takes a few minutes." action={{ label: "Browse jobs", href: "/jobs" }} />
        : (
          <div className="overflow-x-auto">
            <table className="tbl min-w-[640px]">
              <caption className="sr-only">Your applications</caption>
              <thead><tr><th scope="col">Role</th><th scope="col">Stage</th><th scope="col">Applied</th><th scope="col"><span className="sr-only">Open</span></th></tr></thead>
              <tbody>
                {data.map(({ application: a, job, company }) => (
                  <tr key={a.id}>
                    <td><Link href={`/applications/${a.id}`} className="font-display text-xl hover:text-accent hover:underline underline-offset-4">{job.title}</Link><div className="text-sm text-muted">{company.name} · {job.location}</div></td>
                    <td className="whitespace-nowrap"><StageMark stage={a.stage} />{a.stage === "Rejected" && a.rejectedAtStage && <div className="text-xs text-muted pl-6">at {a.rejectedAtStage}</div>}{a.stage === "Interview" && a.interview && <div className="text-xs text-muted pl-6 num">{formatDate(a.interview.date)}, {a.interview.time}</div>}</td>
                    <td className="num text-sm whitespace-nowrap">{formatDate(a.appliedAt)}</td>
                    <td className="text-right"><Link href={`/applications/${a.id}`} className="link text-sm">View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </>
  );
}
