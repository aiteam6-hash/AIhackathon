"use client";
import { useParams } from "next/navigation";
import { useSession } from "@/lib/hooks/useSession";
import { useAsync } from "@/lib/hooks/useAsync";
import { jobsService } from "@/lib/services/jobsService";
import { Breadcrumbs, PageHeader } from "@/components/ui/bits";
import { ErrorState, SkeletonBlock } from "@/components/ui/states";
import { JobForm } from "@/components/recruiter/job-form";

export default function EditJob() {
  const { id } = useParams<{ id: string }>();
  const { user } = useSession();
  const { data, error, reload } = useAsync(async () => ({ ...(await jobsService.getRecruiterJob(id)), companies: await jobsService.listCompaniesFor(user!.id) }), [id, user?.id]);
  return (
    <>
      <Breadcrumbs items={[{ label: "Roles", href: "/recruiter/jobs" }, { label: data?.job.title ?? "Role", href: `/recruiter/jobs/${id}` }, { label: "Edit" }]} />
      <PageHeader eyebrow={data?.job.status ?? ""} title="Edit role" />
      {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <SkeletonBlock className="h-96" /> : <JobForm key={data.job.id} initial={data.job} companies={data.companies} userId={user!.id} />}
    </>
  );
}
