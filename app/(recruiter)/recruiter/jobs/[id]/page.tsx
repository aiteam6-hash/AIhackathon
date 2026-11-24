"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Columns3, MoreHorizontal, Search, Table2 } from "lucide-react";
import type { Application, Applicant, Stage } from "@/types";
import { PIPELINE } from "@/lib/ai/shared";
import { useAsync } from "@/lib/hooks/useAsync";
import { applicationsService } from "@/lib/services/applicationsService";
import { jobsService } from "@/lib/services/jobsService";
import { formatDate, relativeDays } from "@/lib/utils/format";
import { Breadcrumbs, EligibilityMark, PageHeader, StageMark } from "@/components/ui/bits";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Menu } from "@/components/ui/menu";
import { toast } from "@/components/ui/toaster";
import { useCandidateActions } from "@/components/recruiter/candidate-actions";

type Row = { application: Application; applicant: Applicant };
type SortKey = "score" | "name" | "applied" | "stage";

const MOVES: Stage[] = ["Screening", "Shortlisted", "Interview", "Offer", "Hired", "Rejected"];

export default function JobApplicants() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const job = useAsync(() => jobsService.getRecruiterJob(id), [id]);
  const { data, error, reload } = useAsync(() => applicationsService.listForJob(id), [id]);
  const actions = useCandidateActions();

  const [view, setView] = useState<"table" | "pipeline">("table");
  const [q, setQ] = useState("");
  const [elig, setElig] = useState<"all" | "yes" | "no">("all");
  const [stage, setStage] = useState<"all" | Stage>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "score", dir: -1 });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmAuto, setConfirmAuto] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);

  const rows = useMemo(() => {
    if (!data) return [];
    const f = data.filter(({ application: a, applicant: p }) =>
      (!q || p.name.toLowerCase().includes(q.toLowerCase()) || p.headline.toLowerCase().includes(q.toLowerCase())) &&
      (elig === "all" || (elig === "yes") === a.eligibility.eligible) &&
      (stage === "all" || a.stage === stage));
    const val = (r: Row) => sort.key === "score" ? (r.application.score?.final ?? -1) : sort.key === "name" ? r.applicant.name.toLowerCase() : sort.key === "stage" ? PIPELINE.indexOf(r.application.stage) : r.application.appliedAt;
    return [...f].sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sort.dir);
  }, [data, q, elig, stage, sort]);

  const ineligibleActive = useMemo(() => (data ?? []).filter(({ application: a }) => ["Applied", "Screening"].includes(a.stage) && !a.eligibility.eligible), [data]);
  const reasonCounts = useMemo(() => {
    const m: Record<string, number> = {};
    ineligibleActive.forEach(({ application: a }) => a.eligibility.checks.filter((c) => !c.pass).forEach((c) => (m[c.label] = (m[c.label] ?? 0) + 1)));
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [ineligibleActive]);

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (-s.dir) as 1 | -1 } : { key, dir: key === "name" ? 1 : -1 }));
  const allSelected = rows.length > 0 && rows.every((r) => sel.has(r.application.id));
  const toggleAll = () => setSel(allSelected ? new Set() : new Set(rows.map((r) => r.application.id)));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function runAuto() {
    setBusy(true);
    try { const n = await applicationsService.autoFilterIneligible(id); toast.success(`${n} ineligible ${n === 1 ? "applicant was" : "applicants were"} rejected, each with feedback naming the requirement they missed.`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not filter applicants."); }
    setBusy(false); setConfirmAuto(false);
  }
  async function bulkMove(to: Stage) {
    try { await applicationsService.moveStage([...sel], to); toast.success(`${sel.size} moved to ${to}.`); setSel(new Set()); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not move candidates."); }
  }
  async function bulkReject() {
    setBusy(true);
    await applicationsService.moveStage([...sel], "Rejected");
    toast.success(`${sel.size} rejected. Each received AI-drafted feedback for their stage.`);
    setSel(new Set()); setBusy(false); setConfirmBulk(false);
  }

  const title = job.data?.job.title ?? "Role";
  const th = (key: SortKey, label: string) => (
    <th scope="col" aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button className="inline-flex items-center gap-1 uppercase tracking-[.12em] font-semibold hover:text-ink" onClick={() => toggleSort(key)}>
        {label}{sort.key === key && (sort.dir === 1 ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />)}
      </button>
    </th>
  );

  const moveItems = (a: Application) => [
    { label: "View candidate", href: `/recruiter/candidates/${a.id}` },
    ...MOVES.filter((s) => s !== a.stage).map((s, i) => ({ label: s === "Interview" ? "Schedule interview" : s === "Hired" ? "Mark hired" : s === "Rejected" ? "Reject with feedback" : `Move to ${s}`, separated: i === 0, onClick: () => actions.move(a.id, s) })),
  ];

  return (
    <>
      <Breadcrumbs items={[{ label: "Roles", href: "/recruiter/jobs" }, { label: title }]} />
      <PageHeader eyebrow={job.data ? `${job.data.company.name} · ${job.data.job.status}` : "Role"} title={title}
        description={data && job.data ? `${data.length} ${data.length === 1 ? "applicant" : "applicants"} · ${data.filter((r) => r.application.score).length} scored on ${job.data.job.criteria.length} criteria` : undefined}
        actions={<>
          <Link href={`/recruiter/jobs/${id}/edit`} className="btn btn-sm">Edit role</Link>
          <Link href={`/recruiter/jobs/${id}/criteria`} className="btn btn-sm btn-primary">Criteria and AI scoring</Link>
        </>} />

      {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <SkeletonRows rows={6} label="Loading applicants" />
        : data.length === 0 ? <EmptyState title="No applicants yet" body="Applications will appear here as people apply. Make sure the role is open and the requirements are right." action={{ label: "Review the role", href: `/recruiter/jobs/${id}/edit` }} />
        : (
          <>
            <div className="border border-ink p-4 mb-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-semibold">Auto-filter ineligible applicants</p>
                <p className="text-sm text-muted">{ineligibleActive.length > 0 ? `${ineligibleActive.length} waiting applicant${ineligibleActive.length === 1 ? " misses" : "s miss"} at least one hard requirement.` : "Nobody waiting at Applied or Screening misses a hard requirement."}</p>
              </div>
              <button className="btn" disabled={ineligibleActive.length === 0} onClick={() => setConfirmAuto(true)}>Auto-filter ineligible ({ineligibleActive.length})</button>
            </div>

            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div className="relative flex-1 min-w-52 max-w-sm">
                <label htmlFor="aq" className="sr-only">Search applicants</label>
                <Search size={15} className="absolute left-3 top-3 text-muted" aria-hidden />
                <input id="aq" type="search" className="input pl-9" placeholder="Search name or headline" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <div><label htmlFor="ae" className="sr-only">Eligibility</label><select id="ae" className="input" value={elig} onChange={(e) => setElig(e.target.value as typeof elig)}><option value="all">All eligibility</option><option value="yes">Eligible</option><option value="no">Not eligible</option></select></div>
              <div><label htmlFor="as" className="sr-only">Stage</label><select id="as" className="input" value={stage} onChange={(e) => setStage(e.target.value as typeof stage)}><option value="all">All stages</option>{[...PIPELINE, "Withdrawn"].map((s) => <option key={s}>{s}</option>)}</select></div>
              <div role="group" aria-label="View" className="flex border border-ink ml-auto">
                <button className={`btn btn-sm border-0 ${view === "table" ? "bg-ink text-bg hover:bg-ink" : ""}`} aria-pressed={view === "table"} onClick={() => setView("table")}><Table2 size={14} aria-hidden /> Table</button>
                <button className={`btn btn-sm border-0 ${view === "pipeline" ? "bg-ink text-bg hover:bg-ink" : ""}`} aria-pressed={view === "pipeline"} onClick={() => setView("pipeline")}><Columns3 size={14} aria-hidden /> Pipeline</button>
              </div>
            </div>

            {sel.size > 0 && (
              <div role="region" aria-label="Bulk actions" className="flex flex-wrap items-center gap-3 bg-hover border border-rule-strong px-4 py-2.5 mb-4 text-sm">
                <strong className="num">{sel.size} selected</strong>
                <Menu label="Move selected" triggerClassName="btn btn-sm" align="left" trigger={<>Move to…</>} items={[{ label: "Screening", onClick: () => bulkMove("Screening") }, { label: "Shortlisted", onClick: () => bulkMove("Shortlisted") }, { label: "Offer", onClick: () => bulkMove("Offer") }]} />
                <button className="btn btn-sm" onClick={() => setConfirmBulk(true)}>Reject selected</button>
                <button className="btn btn-sm" disabled={sel.size < 2 || sel.size > 4} title="Select 2 to 4 candidates" onClick={() => router.push(`/recruiter/compare?job=${id}&ids=${[...sel].join(",")}`)}>Compare{sel.size >= 2 && sel.size <= 4 ? ` (${sel.size})` : " (pick 2–4)"}</button>
                <button className="link ml-auto" onClick={() => setSel(new Set())}>Clear selection</button>
              </div>
            )}

            <p aria-live="polite" className="text-sm text-muted mb-2">{rows.length} of {data.length} shown</p>

            {rows.length === 0 ? <EmptyState title="No applicants match" body="Change the search or filters to see more." action={{ label: "Clear filters", onClick: () => { setQ(""); setElig("all"); setStage("all"); } }} />
              : view === "table" ? (
                <div className="overflow-x-auto">
                  <table className="tbl min-w-[860px]">
                    <caption className="sr-only">Applicants for {title}</caption>
                    <thead><tr>
                      <th scope="col" className="w-8"><input type="checkbox" aria-label="Select all shown" checked={allSelected} onChange={toggleAll} /></th>
                      {th("name", "Candidate")}{th("score", "AI score")}<th scope="col">Eligibility</th>{th("stage", "Stage")}{th("applied", "Applied")}<th scope="col"><span className="sr-only">Actions</span></th>
                    </tr></thead>
                    <tbody>
                      {rows.map(({ application: a, applicant: p }) => (
                        <tr key={a.id} className={sel.has(a.id) ? "bg-accent-tint" : ""}>
                          <td><input type="checkbox" aria-label={`Select ${p.name}`} checked={sel.has(a.id)} onChange={() => toggle(a.id)} /></td>
                          <td><Link href={`/recruiter/candidates/${a.id}`} className="font-semibold hover:text-accent hover:underline underline-offset-4">{p.name}</Link><div className="text-sm text-muted">{p.headline} · {p.experienceYears} yrs · {p.location}</div></td>
                          <td className="num">{a.score ? <><span className="font-display text-2xl">{a.score.final}</span>{a.score.criteria.some((c) => c.override) && <span className="text-xs text-accent-deep"> manual</span>}</> : <span className="text-muted text-sm">Not scored</span>}</td>
                          <td><EligibilityMark eligibility={a.eligibility} applied={a.appliedAnyway} /></td>
                          <td><StageMark stage={a.stage} />{a.stage === "Rejected" && a.rejectedAtStage && <div className="text-xs text-muted pl-6">at {a.rejectedAtStage}</div>}</td>
                          <td className="text-sm num whitespace-nowrap">{formatDate(a.appliedAt)}<div className="text-xs text-muted">{relativeDays(a.appliedAt)}</div></td>
                          <td className="text-right"><Menu label={`Actions for ${p.name}`} trigger={<MoreHorizontal size={17} />} items={moveItems(a)} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="overflow-x-auto pb-4">
                  <div className="grid grid-flow-col auto-cols-[minmax(230px,1fr)] gap-4 min-w-[1500px]">
                    {PIPELINE.map((s) => {
                      const col = rows.filter((r) => r.application.stage === s).sort((a, b) => (b.application.score?.final ?? -1) - (a.application.score?.final ?? -1));
                      return (
                        <section key={s} aria-label={`${s} column`} onDragOver={(e) => { e.preventDefault(); setOver(s); }} onDragLeave={() => setOver((o) => (o === s ? null : o))}
                          onDrop={(e) => { e.preventDefault(); setOver(null); const cid = dragId ?? e.dataTransfer.getData("text/plain"); const cur = data.find((r) => r.application.id === cid); setDragId(null); if (cid && cur && cur.application.stage !== s) actions.move(cid, s); }}
                          className={`border-t-2 border-ink min-h-48 ${over === s ? "bg-accent-tint" : ""}`}>
                          <h3 className="flex justify-between items-baseline py-2 px-1 font-sans text-sm font-semibold"><StageMark stage={s} /><span className="num text-muted">{col.length}</span></h3>
                          <ul className="space-y-2 px-1 pb-2">
                            {col.map(({ application: a, applicant: p }) => (
                              <li key={a.id} draggable onDragStart={(e) => { setDragId(a.id); e.dataTransfer.setData("text/plain", a.id); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { setDragId(null); setOver(null); }}
                                className={`border border-rule-strong bg-bg p-3 cursor-grab active:cursor-grabbing ${dragId === a.id ? "opacity-40" : ""}`}>
                                <div className="flex justify-between gap-2">
                                  <Link href={`/recruiter/candidates/${a.id}`} className="font-semibold text-sm hover:text-accent hover:underline leading-tight">{p.name}</Link>
                                  <Menu label={`Move ${p.name}`} trigger={<MoreHorizontal size={15} />} items={moveItems(a)} triggerClassName="btn btn-text btn-sm !p-0.5" />
                                </div>
                                <p className="text-xs text-muted mt-0.5">{p.headline}</p>
                                <div className="flex justify-between items-center mt-2 text-xs"><EligibilityMark eligibility={a.eligibility} /><span className="num font-display text-lg">{a.score?.final ?? "—"}</span></div>
                              </li>
                            ))}
                            {col.length === 0 && <li className="text-xs text-muted px-1 py-3">Drop a candidate here</li>}
                          </ul>
                        </section>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted mt-2">Drag a card to another column, or use the menu on each card. Moving to Interview, Hired or Rejected asks for the details first.</p>
                </div>
              )}
          </>
        )}

      <ConfirmDialog open={confirmAuto} onCancel={() => setConfirmAuto(false)} onConfirm={runAuto} busy={busy} title={`Reject ${ineligibleActive.length} ineligible applicants?`} confirmLabel={`Reject ${ineligibleActive.length}`}
        body={<div className="space-y-3"><p>These applicants fail at least one hard requirement. Each will be moved to Rejected and sent AI-drafted feedback that names the stage and the requirement they missed. You can still open any of them and reverse the decision.</p>
          <ul className="border-t border-rule">{reasonCounts.map(([l, n]) => <li key={l} className="flex justify-between py-1.5 border-b border-rule"><span>{l}</span><strong className="num">{n}</strong></li>)}</ul></div>} />
      <ConfirmDialog open={confirmBulk} onCancel={() => setConfirmBulk(false)} onConfirm={bulkReject} busy={busy} title={`Reject ${sel.size} candidates?`} confirmLabel="Reject and send feedback"
        body="Each candidate gets AI-drafted feedback naming the stage where they were rejected. To edit the wording, reject candidates one at a time from their page." />
      {actions.dialogs}
    </>
  );
}
