"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import type { JobFilters } from "@/lib/services/jobsService";
import { jobsService } from "@/lib/services/jobsService";
import { CATEGORIES } from "@/lib/ai/shared";
import { useSession } from "@/lib/hooks/useSession";
import { useAsync } from "@/lib/hooks/useAsync";
import { PageHeader } from "@/components/ui/bits";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { JobRow } from "@/components/jobs/job-row";

const SALARY = [["", "Any"], ["500000", "₹5 LPA or more"], ["1000000", "₹10 LPA or more"], ["2000000", "₹20 LPA or more"], ["3000000", "₹30 LPA or more"]];
const POSTED = [["", "Any time"], ["7", "Last 7 days"], ["14", "Last 14 days"], ["30", "Last 30 days"]];

function Select({ label, value, options, onChange }: { label: string; value: string; options: (string | [string, string])[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="field-label text-xs" htmlFor={`f-${label}`}>{label}</label>
      <select id={`f-${label}`} className="input py-1.5 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return <option key={v} value={v}>{l}</option>; })}
      </select>
    </div>
  );
}

function Explorer() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useSession();
  const get = (k: string) => params.get(k) ?? "";
  const [q, setQ] = useState(get("q"));

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params.toString());
    if (v) next.set(k, v); else next.delete(k);
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };

  // Push the search box into the URL after a short pause in typing.
  useEffect(() => {
    if (q === get("q")) return;
    const t = setTimeout(() => setParam("q", q), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const filters: JobFilters = {
    q: get("q"), category: get("category"), location: get("location"), mode: get("mode"), level: get("level"), type: get("type"),
    minSalary: Number(get("minSalary")) || undefined, posted: Number(get("posted")) || undefined,
    eligibleOnly: get("eligible") === "1", sort: (get("sort") as JobFilters["sort"]) || undefined,
  };
  const key = params.toString();
  const { data, error, loading, reload } = useAsync(() => jobsService.listOpenJobs(filters, user!.applicantId), [key, user?.id]);
  const opts = useAsync(() => jobsService.filterOptions(), []);
  const hasProfile = data ? data.some((r) => r.match) : true;
  const active = Array.from(params.keys()).length > 0;

  return (
    <>
      <PageHeader eyebrow="Jobs" title="Roles you can actually get" description="Each match is calculated from your profile against the role's skills, experience range, location and pay." />
      {data && !hasProfile && (
        <p className="border-l-2 border-accent pl-3 mb-8 text-sm" role="status">
          Match percentages and eligibility need a profile. <Link className="link" href="/onboarding">Upload your resume</Link> and they will appear on every job.
        </p>
      )}
      <div className="grid gap-10 lg:grid-cols-[250px_1fr]">
        <form role="search" aria-label="Filter jobs" onSubmit={(e) => e.preventDefault()} className="space-y-4 lg:sticky lg:top-6 self-start">
          <div className="relative">
            <label htmlFor="q" className="field-label text-xs">Search</label>
            <Search size={15} className="absolute left-3 top-[34px] text-muted" aria-hidden />
            <input id="q" className="input pl-9" type="search" placeholder="Title, company or skill" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select label="Category" value={get("category")} options={[["", "All"], ...CATEGORIES.map((c): [string, string] => [c, c])]} onChange={(v) => setParam("category", v)} />
          <Select label="Location" value={get("location")} options={[["", "Anywhere"], ...(opts.data?.locations ?? []).map((c): [string, string] => [c, c])]} onChange={(v) => setParam("location", v)} />
          <Select label="Work mode" value={get("mode")} options={["", "Remote", "Hybrid", "Onsite"].map((x): [string, string] => [x, x || "Any"])} onChange={(v) => setParam("mode", v)} />
          <Select label="Experience level" value={get("level")} options={["", "Entry", "Mid", "Senior", "Lead"].map((x): [string, string] => [x, x || "Any"])} onChange={(v) => setParam("level", v)} />
          <Select label="Job type" value={get("type")} options={["", "Full-time", "Part-time", "Contract", "Internship"].map((x): [string, string] => [x, x || "Any"])} onChange={(v) => setParam("type", v)} />
          <Select label="Salary (top of range)" value={get("minSalary")} options={SALARY as [string, string][]} onChange={(v) => setParam("minSalary", v)} />
          <Select label="Posted" value={get("posted")} options={POSTED as [string, string][]} onChange={(v) => setParam("posted", v)} />
          <label className="flex items-start gap-2 text-sm border-t border-rule pt-4">
            <input type="checkbox" className="mt-1" checked={get("eligible") === "1"} onChange={(e) => setParam("eligible", e.target.checked ? "1" : "")} />
            <span><strong>Eligible for you</strong><br /><span className="text-muted">Hide jobs where you miss a hard requirement.</span></span>
          </label>
          {active && <button type="button" className="btn btn-sm" onClick={() => { setQ(""); router.replace(pathname, { scroll: false }); }}>Clear all filters</button>}
        </form>

        <section aria-label="Job results">
          <div className="flex flex-wrap items-end justify-between gap-3 pb-3 border-b border-ink">
            <p aria-live="polite" className="text-sm">{loading && !data ? "Loading jobs…" : `${data?.length ?? 0} ${data?.length === 1 ? "role" : "roles"}`}</p>
            <div className="w-44"><Select label="Sort by" value={get("sort") || (hasProfile ? "match" : "newest")} options={[["match", "Best match"], ["newest", "Newest"], ["salary", "Highest salary"]]} onChange={(v) => setParam("sort", v)} /></div>
          </div>
          {error ? <div className="mt-6"><ErrorState message={error} onRetry={reload} /></div>
            : !data ? <SkeletonRows rows={5} label="Loading jobs" />
            : data.length === 0 ? <div className="mt-8"><EmptyState title="No roles match these filters" body={filters.eligibleOnly ? "Try turning off “Eligible for you”, or widen the salary and location filters." : "Try widening the salary or location filters, or search for a different skill."} action={{ label: "Clear all filters", onClick: () => { setQ(""); router.replace(pathname, { scroll: false }); } }} /></div>
            : <div className={loading ? "opacity-60 transition-opacity" : ""}>{data.map((r) => <JobRow key={r.job.id} row={r} />)}</div>}
        </section>
      </div>
    </>
  );
}

export default function JobsPage() {
  return <Suspense fallback={<SkeletonRows rows={5} />}><Explorer /></Suspense>;
}
