"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { Criterion, CriterionKind, Job } from "@/types";
import { useAsync } from "@/lib/hooks/useAsync";
import { jobsService } from "@/lib/services/jobsService";
import { aiService } from "@/lib/services/aiService";
import { applicationsService } from "@/lib/services/applicationsService";
import { uid } from "@/lib/utils/format";
import { AIBadge, Breadcrumbs, PageHeader, ProgressBar } from "@/components/ui/bits";
import { ErrorState, SkeletonBlock } from "@/components/ui/states";
import { Modal } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";

const KINDS: { kind: CriterionKind; label: string; hint: string }[] = [
  { kind: "skills", label: "Skill match", hint: "Required and preferred skills on the resume" },
  { kind: "experience", label: "Relevant experience", hint: "Years against the role's minimum and range" },
  { kind: "education", label: "Education", hint: "Degree level and field of study" },
  { kind: "stability", label: "Stability", hint: "Average tenure across roles" },
  { kind: "domain", label: "Domain background", hint: "Past roles in the same field" },
  { kind: "communication", label: "Communication from cover note", hint: "Length, specificity and figures in the note" },
  { kind: "custom", label: "Custom keyword", hint: "Looks for your own keywords in the resume" },
];

/** Rescales weights so they add up to exactly 100, fixing rounding on the largest. */
function normalise(list: Criterion[]): Criterion[] {
  const total = list.reduce((s, c) => s + c.weight, 0);
  if (total <= 0) return list;
  const out = list.map((c) => ({ ...c, weight: Math.round((c.weight / total) * 100) }));
  const diff = 100 - out.reduce((s, c) => s + c.weight, 0);
  if (diff && out.length) out[out.reduce((m, c, i) => (c.weight > out[m].weight ? i : m), 0)].weight += diff;
  return out;
}

function Builder({ job, templates, applicantCount }: { job: Job; templates: Awaited<ReturnType<typeof jobsService.listTemplates>>; applicantCount: number }) {
  const [list, setList] = useState<Criterion[]>(job.criteria);
  const [suggesting, setSuggesting] = useState(false);
  const [aiMade, setAiMade] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [finished, setFinished] = useState<number | null>(null);
  const [tplOpen, setTplOpen] = useState(false);
  const [tplName, setTplName] = useState("");

  const total = list.reduce((s, c) => s + (Number.isFinite(c.weight) ? c.weight : 0), 0);
  const pct = (c: Criterion) => (total > 0 ? Math.round((c.weight / total) * 100) : 0);
  const update = (id: string, patch: Partial<Criterion>) => setList((l) => l.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const move = (i: number, d: -1 | 1) => setList((l) => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const problems = [
    list.length === 0 && "Add at least one criterion.",
    list.some((c) => !c.label.trim()) && "Every criterion needs a name.",
    total <= 0 && list.length > 0 && "Give at least one criterion a weight above zero.",
  ].filter(Boolean) as string[];

  async function suggest() {
    setSuggesting(true);
    try { setList(await aiService.suggestCriteria(job)); setAiMade(true); toast.success("Suggested criteria loaded. Edit them freely before you run scoring."); }
    catch { toast.error("Could not generate suggestions."); }
    setSuggesting(false);
  }
  async function run() {
    if (problems.length) return;
    const final = normalise(list);
    setList(final); setFinished(null); setProgress({ done: 0, total: applicantCount });
    try {
      await jobsService.saveCriteria(job.id, final);
      const n = await aiService.runScoring(job.id, final, (done, t) => setProgress({ done, total: t }));
      setFinished(n); toast.success(`Scored ${n} applicants.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Scoring failed."); }
    setProgress(null);
  }
  async function saveTemplate() {
    if (!tplName.trim()) return;
    await jobsService.saveTemplate(tplName.trim(), normalise(list));
    toast.success(`Saved template “${tplName.trim()}”.`); setTplOpen(false); setTplName("");
  }

  return (
    <div className="grid gap-12 lg:grid-cols-[1.6fr_1fr]">
      <section aria-label="Criteria">
        <div className="flex flex-wrap gap-2 mb-5">
          <button className="btn btn-sm" onClick={suggest} disabled={suggesting || !!progress}>{suggesting ? "Thinking…" : "Suggest criteria for this role"}</button>
          <label className="sr-only" htmlFor="tpl">Load a template</label>
          <select id="tpl" className="input w-auto py-1.5 text-sm" value="" disabled={!!progress} onChange={(e) => { const t = templates.find((x) => x.id === e.target.value); if (t) { setList(t.criteria.map((c) => ({ ...c, id: uid("c") }))); setAiMade(false); toast.success(`Loaded “${t.name}”.`); } }}>
            <option value="">Load a saved template…</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button className="btn btn-sm" onClick={() => setTplOpen(true)} disabled={list.length === 0}>Save as template</button>
        </div>
        {aiMade && <p className="text-xs text-muted mb-3"><AIBadge /> <span className="ml-1">Suggested from the role&apos;s category, level and requirements. Treat it as a starting point.</span></p>}

        {list.length === 0 ? <p className="py-10 border-y border-rule text-muted">No criteria yet. Ask for suggestions, load a template, or add one below.</p> : (
          <ol className="border-t border-ink">
            {list.map((c, i) => (
              <li key={c.id} className="py-4 border-b border-rule grid gap-3 sm:grid-cols-[1fr_7rem_auto]">
                <div className="space-y-2">
                  <div>
                    <label className="sr-only" htmlFor={`l-${c.id}`}>Criterion name</label>
                    <input id={`l-${c.id}`} className="input font-semibold" value={c.label} placeholder="Criterion name" aria-invalid={!c.label.trim()} onChange={(e) => update(c.id, { label: e.target.value })} disabled={!!progress} />
                  </div>
                  <label className="sr-only" htmlFor={`d-${c.id}`}>What it looks at</label>
                  <input id={`d-${c.id}`} className="input text-sm" value={c.description} placeholder="What it looks at" onChange={(e) => update(c.id, { description: e.target.value })} disabled={!!progress} />
                  <p className="text-xs text-muted">Method: {KINDS.find((k) => k.kind === c.kind)?.hint}</p>
                </div>
                <div>
                  <label className="field-label text-xs" htmlFor={`w-${c.id}`}>Weight</label>
                  <input id={`w-${c.id}`} className="input num" type="number" min={0} max={100} value={Number.isFinite(c.weight) ? c.weight : ""} onChange={(e) => update(c.id, { weight: Math.max(0, Number(e.target.value)) })} disabled={!!progress} />
                  <p className="text-xs text-muted mt-1 num">= {pct(c)}% of score</p>
                </div>
                <div className="flex sm:flex-col gap-1 justify-start">
                  <button className="btn btn-text btn-sm" aria-label={`Move ${c.label || "criterion"} up`} disabled={i === 0 || !!progress} onClick={() => move(i, -1)}><ArrowUp size={15} /></button>
                  <button className="btn btn-text btn-sm" aria-label={`Move ${c.label || "criterion"} down`} disabled={i === list.length - 1 || !!progress} onClick={() => move(i, 1)}><ArrowDown size={15} /></button>
                  <button className="btn btn-text btn-sm" aria-label={`Remove ${c.label || "criterion"}`} disabled={!!progress} onClick={() => setList((l) => l.filter((x) => x.id !== c.id))}><Trash2 size={15} /></button>
                </div>
              </li>
            ))}
          </ol>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <label htmlFor="addk" className="text-sm font-semibold">Add a criterion:</label>
          <select id="addk" className="input w-auto py-1.5 text-sm" value="" disabled={!!progress} onChange={(e) => {
            const k = KINDS.find((x) => x.kind === e.target.value); if (!k) return;
            setList((l) => [...l, { id: uid("c"), kind: k.kind, label: k.kind === "custom" ? "" : k.label, weight: 10, description: k.kind === "custom" ? "" : k.hint }]);
          }}>
            <option value="">Choose a type…</option>{KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
          </select>
          <Plus size={14} aria-hidden className="text-muted" />
        </div>
      </section>

      <aside className="lg:border-l lg:border-rule lg:pl-10 space-y-6 self-start lg:sticky lg:top-6">
        <div>
          <p className="eyebrow">Weights</p>
          <p className="font-display text-6xl num mt-1" aria-live="polite">{total}</p>
          <p className="text-sm text-muted">{total === 100 ? "Adds up to 100." : total === 0 ? "Set at least one weight." : `Raw total. Scores use each weight as a share of ${total}, so the effective total is always 100%.`}</p>
          {total !== 100 && total > 0 && <button className="btn btn-sm mt-3" onClick={() => setList(normalise(list))} disabled={!!progress}>Normalise to 100</button>}
          <ul className="mt-4 text-sm border-t border-rule">{list.map((c) => <li key={c.id} className="flex justify-between py-1.5 border-b border-rule"><span>{c.label || "Unnamed"}</span><span className="num font-semibold">{pct(c)}%</span></li>)}</ul>
        </div>
        <div className="border-t border-ink pt-5">
          <h2 className="text-2xl mb-1">Run AI scoring</h2>
          <p className="text-sm text-muted mb-4">Scores all {applicantCount} applicants for this role on the criteria above, with reasoning for each. Manual overrides you made earlier are kept. Eligible applicants waiting at Applied move to Screening.</p>
          {problems.length > 0 && <ul role="alert" className="text-sm field-error mb-3">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          {progress ? <div aria-live="polite"><ProgressBar value={(progress.done / Math.max(progress.total, 1)) * 100} label={`Scoring ${progress.done} of ${progress.total}`} /></div>
            : <button className="btn btn-primary w-full" onClick={run} disabled={problems.length > 0 || applicantCount === 0}>{applicantCount === 0 ? "No applicants to score" : `Run AI scoring on ${applicantCount}`}</button>}
          {finished !== null && <p role="status" className="mt-4 text-sm"><strong>Done.</strong> {finished} applicants scored. <Link href={`/recruiter/jobs/${job.id}`} className="link">See the ranked list</Link></p>}
        </div>
      </aside>

      <Modal open={tplOpen} onClose={() => setTplOpen(false)} title="Save as template" description="Weights are saved normalised to 100."
        footer={<><button className="btn" onClick={() => setTplOpen(false)}>Cancel</button><button className="btn btn-primary" onClick={saveTemplate} disabled={!tplName.trim()}>Save template</button></>}>
        <label className="field-label" htmlFor="tn">Template name</label>
        <input id="tn" className="input" value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="For example: Customer-facing roles" />
      </Modal>
    </div>
  );
}

export default function CriteriaPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useAsync(async () => {
    const [j, templates, apps] = await Promise.all([jobsService.getRecruiterJob(id), jobsService.listTemplates(), applicationsService.listForJob(id)]);
    return { job: j.job, templates, count: apps.filter((a) => a.application.stage !== "Withdrawn").length };
  }, [id]);
  return (
    <>
      <Breadcrumbs items={[{ label: "Roles", href: "/recruiter/jobs" }, { label: data?.job.title ?? "Role", href: `/recruiter/jobs/${id}` }, { label: "Criteria" }]} />
      <PageHeader eyebrow="Shortlisting" title="Criteria and AI scoring" description="Choose what matters for this role and how much. Every score you see later cites these criteria." />
      {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <SkeletonBlock className="h-96" /> : <BuilderHost key={id} data={data} />}
    </>
  );
}

/** Freezes the first loaded data so later refreshes do not reset the builder's local edits. */
function BuilderHost({ data }: { data: { job: Job; templates: Awaited<ReturnType<typeof jobsService.listTemplates>>; count: number } }) {
  const [frozen] = useState(data);
  return <Builder job={frozen.job} templates={data.templates} applicantCount={data.count} />;
}
