"use client";
import { useSession } from "@/lib/hooks/useSession";
import { useAsync } from "@/lib/hooks/useAsync";
import { jobsService } from "@/lib/services/jobsService";
import { Breadcrumbs, PageHeader } from "@/components/ui/bits";
import { ErrorState, SkeletonBlock } from "@/components/ui/states";
import { JobForm } from "@/components/recruiter/job-form";

export default function NewJob() {
  const { user } = useSession();
  const { data, error, reload } = useAsync(() => jobsService.listCompaniesFor(user!.id), [user?.id]);
  return (
    <>
      <Breadcrumbs items={[{ label: "Roles", href: "/recruiter/jobs" }, { label: "Post a job" }]} />
      <PageHeader eyebrow="New role" title="Post a job" description="Set the hard requirements carefully. They decide who can apply and who gets filtered out." />
      {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <SkeletonBlock className="h-96" /> : <JobForm companies={data} userId={user!.id} />}
    </>
  );
}
