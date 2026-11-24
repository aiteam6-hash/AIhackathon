"use client";
import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { effectiveScore } from "@/lib/ai/engine";
import { useAsync } from "@/lib/hooks/useAsync";
import { applicationsService, type ApplicationBundle } from "@/lib/services/applicationsService";
import { money } from "@/lib/utils/format";
import { AIBadge, AIBasis, Breadcrumbs, EligibilityMark, PageHeader, ScoreBar, StageMark } from "@/components/ui/bits";
import { EmptyState, ErrorState, SkeletonBlock } from "@/components/ui/states";

function Row({ label, data, cols, children }: { label: string; data: ApplicationBundle[]; cols: React.CSSProperties; children: (b: ApplicationBundle) => React.ReactNode }) {
  return (
    <div role="row" className="grid border-b border-rule" style={cols}>
      <div role="rowheader" className="py-3 pr-3 text-sm text-muted">{label}</div>
      {data.map((b) => <div role="cell" key={b.application.id} className="py-3 pr-4">{children(b)}</div>)}
    </div>
  );
}

function Compare() {
  const params = useSearchParams();
  const router = useRouter();
  const jobId = params.get("job");
  const ids = (params.get("ids") ?? "").split(",").filter(Boolean).slice(0, 4);
  const { data, error, reload } = useAsync(() => (ids.length >= 2 ? applicationsService.getMany(ids) : Promise.resolve([])), [ids.join(",")]);
  const back = jobId ? `/recruiter/jobs/${jobId}` : "/recruiter/jobs";

  const remove = (id: string) => router.replace(`/recruiter/compare?${jobId ? `job=${jobId}&` : ""}ids=${ids.filter((x) => x !== id).join(",")}`);

  if (ids.length < 2) return <EmptyState title="Pick at least two candidates" body="Select 2 to 4 applicants in a role's table, then choose Compare." action={{ label: "Back to roles", href: back }} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <SkeletonBlock className="h-96" />;
  if (data.length < 2) return <EmptyState title="Those candidates could not be found" body="They may have been removed. Choose them again from the role's applicant list." action={{ label: "Back to applicants", href: back }} />;

  const labels = Array.from(new Set(data.flatMap((b) => b.application.score?.criteria.map((c) => c.label) ?? [])));
  const best = (vals: (number | undefined)[]) => Math.max(...vals.map((v) => v ?? -1));
  const finals = data.map((b) => b.application.score?.final);
  const cols = { gridTemplateColumns: `10rem repeat(${data.length}, minmax(190px, 1fr))` };

  return (
    <>
      <Breadcrumbs items={[{ label: "Roles", href: "/recruiter/jobs" }, { label: data[0].job.title, href: back }, { label: "Compare" }]} />
      <PageHeader eyebrow="Side by side" title={`Comparing ${data.length} candidates`} description={`All applied for ${data[0].job.title}. The highest value in each row is underlined.`} actions={<Link href={back} className="btn btn-sm">Back to applicants</Link>} />
      <div className="overflow-x-auto">
        <div role="table" aria-label="Candidate comparison" className="min-w-[760px]">
          <div role="row" className="grid border-b border-ink" style={cols}>
            <div role="columnheader" className="py-3" />
            {data.map((b) => (
              <div role="columnheader" key={b.application.id} className="py-3 pr-4">
                <Link href={`/recruiter/candidates/${b.application.id}`} className="font-display text-2xl hover:text-accent hover:underline underline-offset-4">{b.applicant.name}</Link>
                <p className="text-sm text-muted">{b.applicant.headline}</p>
                <button className="link text-xs mt-1" onClick={() => remove(b.application.id)}>Remove from comparison</button>
              </div>
            ))}
          </div>
          <Row data={data} cols={cols} label="Final score (AI)">{(b) => b.application.score ? <span className={`font-display text-4xl num ${b.application.score.final === best(finals) ? "underline decoration-accent decoration-2 underline-offset-4" : ""}`}>{b.application.score.final}</span> : <span className="text-sm text-muted">Not scored</span>}</Row>
          <Row data={data} cols={cols} label="Stage">{(b) => <StageMark stage={b.application.stage} />}</Row>
          <Row data={data} cols={cols} label="Eligibility">{(b) => <><EligibilityMark eligibility={b.application.eligibility} />{!b.application.eligibility.eligible && <p className="text-xs text-muted mt-1">{b.application.eligibility.checks.filter((c) => !c.pass).map((c) => c.label).join("; ")}</p>}</>}</Row>
          {labels.map((l) => {
            const vals = data.map((b) => { const c = b.application.score?.criteria.find((x) => x.label === l); return c ? effectiveScore(c) : undefined; });
            return (
              <Row key={l} data={data} cols={cols} label={l}>{(b) => {
                const c = b.application.score?.criteria.find((x) => x.label === l);
                if (!c) return <span className="text-sm text-muted">—</span>;
                const v = effectiveScore(c);
                return <div><div className={v === best(vals) ? "[&_span.num]:underline [&_span.num]:decoration-accent [&_span.num]:decoration-2 [&_span.num]:underline-offset-4" : ""}><ScoreBar label={`${v}`} value={v} overridden={!!c.override} /></div><p className="text-xs text-muted mt-1.5 line-clamp-4" title={c.reasoning}>{c.reasoning}</p></div>;
              }}</Row>
            );
          })}
          <Row data={data} cols={cols} label="Experience">{(b) => <span className="num">{b.applicant.experienceYears} years</span>}</Row>
          <Row data={data} cols={cols} label="Current role">{(b) => <span className="text-sm">{b.applicant.work[0] ? `${b.applicant.work[0].title}, ${b.applicant.work[0].employer}` : "—"}</span>}</Row>
          <Row data={data} cols={cols} label="Expected pay">{(b) => <span className="num text-sm">{money(b.application.expectedSalary, b.applicant.salaryCurrency)}</span>}</Row>
          <Row data={data} cols={cols} label="Notice period">{(b) => <span className="num text-sm">{b.application.noticeDays} days</span>}</Row>
          <Row data={data} cols={cols} label="Location">{(b) => <span className="text-sm">{b.applicant.location}{b.applicant.openToRelocate ? " (open to relocate)" : ""}</span>}</Row>
        </div>
      </div>
      <div className="mt-6 space-y-1"><p className="text-xs text-muted flex items-center gap-2"><AIBadge /> Scores and reasoning are AI-generated.</p><AIBasis score={data.find((b) => b.application.score)?.application.score} /></div>
    </>
  );
}

export default function ComparePage() {
  return <Suspense fallback={<SkeletonBlock className="h-96" />}><Compare /></Suspense>;
}
