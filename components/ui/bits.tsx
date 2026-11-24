import Link from "next/link";
import { Check, ChevronRight, Circle, CircleCheck, CircleDashed, CircleDot, CircleX, CalendarClock, Mail, Undo2, X } from "lucide-react";
import type { Eligibility, Score, Stage } from "@/types";

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted mb-5">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((it, i) => (
          <li key={it.label} className="flex items-center gap-1">
            {it.href ? <Link href={it.href} className="hover:text-ink underline underline-offset-4 decoration-rule-strong">{it.label}</Link> : <span aria-current="page" className="text-ink">{it.label}</span>}
            {i < items.length - 1 && <ChevronRight size={14} aria-hidden />}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 mb-8 border-b border-ink">
      <div className="max-w-2xl">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-4xl md:text-5xl">{title}</h1>
        {description && <p className="text-muted mt-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 shrink-0">{actions}</div>}
    </header>
  );
}

const STAGE_ICON: Record<Stage, typeof Circle> = {
  Applied: Circle, Screening: CircleDashed, Shortlisted: CircleDot, Interview: CalendarClock,
  Offer: Mail, Hired: CircleCheck, Rejected: CircleX, Withdrawn: Undo2,
};

/** Stage shown as an icon shape plus text; weight and accent carry emphasis, not extra colours. */
export function StageMark({ stage }: { stage: Stage }) {
  const Icon = STAGE_ICON[stage];
  const strong = stage === "Offer" || stage === "Hired";
  const quiet = stage === "Rejected" || stage === "Withdrawn";
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm ${strong ? "font-semibold text-accent-deep" : quiet ? "text-muted" : ""}`}>
      <Icon size={15} aria-hidden strokeWidth={strong ? 2.4 : 1.8} />
      {stage}
    </span>
  );
}

export function EligibilityMark({ eligibility, applied }: { eligibility: Eligibility; applied?: boolean }) {
  const failed = eligibility.checks.filter((c) => !c.pass).length;
  return eligibility.eligible ? (
    <span className="inline-flex items-center gap-1.5 text-sm"><Check size={14} aria-hidden /> Eligible</span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-deep" title={eligibility.checks.filter((c) => !c.pass).map((c) => c.label).join("; ")}>
      <X size={14} aria-hidden /> Fails {failed} {applied ? "(applied anyway)" : failed === 1 ? "requirement" : "requirements"}
    </span>
  );
}

export function ScoreBar({ label, value, weight, overridden }: { label?: string; value: number; weight?: number; overridden?: boolean }) {
  return (
    <div>
      {label && (
        <div className="flex justify-between text-sm mb-1">
          <span>{label}{weight !== undefined && <span className="text-muted"> · weight {weight}%</span>}</span>
          <span className={`num font-semibold ${overridden ? "text-accent-deep" : ""}`}>{value}{overridden && <span className="text-xs font-normal"> (manual)</span>}</span>
        </div>
      )}
      <div className="h-1.5 bg-rule" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? "Score"}>
        <div className={`h-full ${overridden ? "bg-accent" : "bg-ink"}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1.5"><span>{label}</span><span className="num">{Math.round(value)}%</span></div>
      <div className="h-2 border border-ink" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full bg-ink transition-[width] duration-200" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

/** Every AI output carries this label and, where relevant, the criteria it was based on. */
export function AIBadge({ children = "AI-generated" }: { children?: React.ReactNode }) {
  return <span className="chip chip-accent text-[11px] font-semibold uppercase tracking-wider">{children}</span>;
}

export function AIBasis({ score }: { score?: Score }) {
  if (!score) return null;
  return (
    <p className="text-xs text-muted">
      <AIBadge /> <span className="ml-1">Based on: {score.basedOn.map((b) => `${b.label} ${b.weight}%`).join(", ")}. A person can override any score.</span>
    </p>
  );
}

export function Stat({ label, value, note, accent }: { label: string; value: React.ReactNode; note?: string; accent?: boolean }) {
  return (
    <div className="py-4 border-t border-ink">
      <p className="eyebrow">{label}</p>
      <p className={`font-display text-5xl mt-2 num ${accent ? "text-accent" : ""}`}>{value}</p>
      {note && <p className="text-sm text-muted mt-1">{note}</p>}
    </div>
  );
}
