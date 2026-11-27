"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "@/lib/hooks/useSession";
import { useAsync } from "@/lib/hooks/useAsync";
import { aiInterviewService } from "@/lib/services/aiInterviewService";
import { applicationsService } from "@/lib/services/applicationsService";
import { formatDate } from "@/lib/utils/format";
import { Breadcrumbs, PageHeader } from "@/components/ui/bits";
import { EmptyState, ErrorState, SkeletonBlock } from "@/components/ui/states";
import { AiInterviewRunner } from "@/components/applicant/ai-interview-runner";

export default function AiInterviewPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isDemo } = useSession();
  const { data, error, reload } = useAsync(async () => {
    const [bundle, interview] = await Promise.all([applicationsService.getForApplicant(id, user!.applicantId!), aiInterviewService.get(id)]);
    // computed here, not while rendering, because the current time is not stable between renders
    const expired = !!interview && interview.status !== "completed" && !!interview.expiresAt && new Date(interview.expiresAt).getTime() < Date.now();
    return { bundle, interview, expired };
  }, [id, user?.id]);

  const crumbs = (title: string) => [{ label: "My applications", href: "/applications" }, { label: title, href: `/applications/${id}` }, { label: "AI interview" }];
  if (isDemo) return <EmptyState title="AI interviews are not part of the demo" body="Sign in with a real account to take one. Demo accounts use sample data only." action={{ label: "Back to applications", href: "/applications" }} />;
  if (error) return <><Breadcrumbs items={crumbs("Application")} /><ErrorState message={error} onRetry={reload} /></>;
  if (!data) return <SkeletonBlock className="h-96" />;

  const { bundle, interview, expired } = data;
  const title = bundle.job.title;

  return (
    <>
      <Breadcrumbs items={crumbs(title)} />
      <PageHeader eyebrow={`${bundle.company.name} · ${title}`} title="AI interview"
        description={interview?.status === "approved" || interview?.status === "in_progress" ? (interview.expiresAt ? `Please finish by ${formatDate(interview.expiresAt)}.` : undefined) : undefined} />
      {!interview ? <EmptyState title="There is no AI interview for this application" body="If a recruiter approves one, you will be notified and it will appear here." action={{ label: "Back to application", href: `/applications/${id}` }} />
        : interview.status === "completed" ? (
          <div role="status" className="max-w-xl"><h2 className="text-3xl mb-2">You have already finished this interview</h2><p>You submitted your answers{interview.completedAt ? ` on ${formatDate(interview.completedAt)}` : ""}. The recruiter will review them. <Link className="link" href={`/applications/${id}`}>Back to your application</Link></p></div>
        ) : expired ? <EmptyState title="This interview link has expired" body="It was open for 7 days. If you still want to take it, ask the recruiter to set up a new one." action={{ label: "Back to application", href: `/applications/${id}` }} />
        : <AiInterviewRunner interview={interview} jobTitle={title} companyName={bundle.company.name} />}
    </>
  );
}
