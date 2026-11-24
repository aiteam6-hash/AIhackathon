"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import type { Job, JobStatus } from "@/types";
import { useSession } from "@/lib/hooks/useSession";
import { useAsync } from "@/lib/hooks/useAsync";
import { jobsService } from "@/lib/services/jobsService";
import { formatDate } from "@/lib/utils/format";
import { PageHeader } from "@/components/ui/bits";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { Menu } from "@/components/ui/menu";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";

const STATUSES: ("All" | JobStatus)[] = ["All", "Open", "Draft", "Paused", "Filled", "Closed"];
const STAGES = ["Applied", "Screening", "Shortlisted", "Interview", "Offer", "Rejected"] as const;

export default function RecruiterJobs() {
  const { user } = useSession();
  const router = useRouter();
  const { data, error, reload } = useAsync(() => jobsService.listRecruiterJobs(user!.id), [user?.id]);
  const [filter, setFilter] = useState<"All" | JobStatus>("All");
  const [closing, setClosing] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);

  async function setStatus(job: Job, status: JobStatus, msg: string) {
    try { await jobsService.setStatus(job.id, status); toast.success(msg); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not update the role."); }
  }
  async function duplicate(job: Job) {
    const copy = await jobsService.duplicate(job.id);
    toast.success("Copied as a draft. Review it before publishing.");
    router.push(`/recruiter/jobs/${copy.id}/edit`);
  }

  const rows = data?.filter((r) => filter === "All" || r.job.status === filter);

  return (
    <>
      <PageHeader eyebrow="Recruiter" title="Roles" description="Every role you hire for, with where applicants are in the pipeline." actions={<Link href="/recruiter/jobs/new" className="btn btn-primary">Post a job</Link>} />
      <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-5 mb-4 text-sm border-b border-rule">
        {STATUSES.map((s) => (
          <button key={s} role="tab" aria-selected={filter === s} onClick={() => setFilter(s)} className={`pb-2 -mb-px border-b-2 ${filter === s ? "border-accent font-semibold" : "border-transparent text-muted hover:text-ink"}`}>
            {s}{data && <span className="num text-muted"> {s === "All" ? data.length : data.filter((r) => r.job.status === s).length}</span>}
          </button>
        ))}
      </div>
      {error ? <ErrorState message={error} onRetry={reload} /> : !rows ? <SkeletonRows rows={5} label="Loading roles" />
        : rows.length === 0 ? <EmptyState title={filter === "All" ? "You have not posted a role yet" : `No ${filter.toLowerCase()} roles`} body="Post a role with hard requirements, and applicants who miss them can be filtered out in one click." action={{ label: "Post a job", href: "/recruiter/jobs/new" }} />
        : (
          <div className="overflow-x-auto">
            <table className="tbl min-w-[820px]">
              <caption className="sr-only">Your roles</caption>
              <thead><tr><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Applicants by stage</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {rows.map(({ job, company, total, counts }) => (
                  <tr key={job.id}>
                    <td>
                      <Link href={`/recruiter/jobs/${job.id}`} className="font-display text-xl hover:text-accent hover:underline underline-offset-4">{job.title}</Link>
                      <div className="text-sm text-muted">{company.name} · {job.location} · {job.workMode} · {job.status === "Draft" ? "Not published" : `Posted ${formatDate(job.postedAt)}`}</div>
                    </td>
                    <td className={`text-sm whitespace-nowrap ${job.status === "Open" ? "font-semibold" : job.status === "Draft" ? "italic" : "text-muted"}`}>{job.status === "Open" ? "● " : job.status === "Paused" ? "‖ " : ""}{job.status}</td>
                    <td className="text-sm">
                      <p className="num"><strong>{total}</strong> total</p>
                      <p className="text-muted num">{STAGES.filter((s) => counts[s]).map((s) => `${s} ${counts[s]}`).join(" · ") || "No applicants yet"}</p>
                    </td>
                    <td className="text-right">
                      <Menu label={`Actions for ${job.title}`} trigger={<MoreHorizontal size={18} />}
                        items={[
                          { label: "View applicants", href: `/recruiter/jobs/${job.id}` },
                          { label: "Edit role", href: `/recruiter/jobs/${job.id}/edit` },
                          { label: "Criteria and scoring", href: `/recruiter/jobs/${job.id}/criteria` },
                          { label: "Duplicate", onClick: () => duplicate(job) },
                          ...(job.status === "Draft" ? [{ label: "Publish", separated: true, onClick: () => setStatus(job, "Open", "Role published.") }] : []),
                          ...(job.status === "Open" ? [{ label: "Pause applications", separated: true, onClick: () => setStatus(job, "Paused", "Role paused. Applicants cannot apply until you resume it.") }] : []),
                          ...(job.status === "Paused" || job.status === "Closed" ? [{ label: "Reopen", separated: true, onClick: () => setStatus(job, "Open", "Role reopened.") }] : []),
                          ...(["Open", "Paused"].includes(job.status) ? [{ label: "Mark filled", onClick: () => setStatus(job, "Filled", "Role marked as filled.") }, { label: "Close role", onClick: () => setClosing(job) }] : []),
                        ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      <ConfirmDialog open={!!closing} onCancel={() => setClosing(null)} busy={busy} title={`Close ${closing?.title ?? "role"}?`} confirmLabel="Close role"
        onConfirm={async () => { setBusy(true); await setStatus(closing!, "Closed", "Role closed."); setBusy(false); setClosing(null); }}
        body="It stops accepting applications and disappears from the jobs list. Existing applicants stay in the pipeline, and you can reopen the role later." />
    </>
  );
}
