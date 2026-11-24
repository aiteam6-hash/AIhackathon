import { Check, X } from "lucide-react";
import type { Eligibility, JobMatch } from "@/types";
import { AIBadge, ScoreBar } from "@/components/ui/bits";

/** Hard requirements with a pass/fail mark and the reason for each. */
export function RequirementsChecklist({ eligibility, title = "Requirements" }: { eligibility: Eligibility; title?: string }) {
  return (
    <section aria-label={title}>
      <h2 className="text-2xl mb-3">{title}</h2>
      <ul className="border-t border-ink">
        {eligibility.checks.map((c) => (
          <li key={c.key} className="py-3 border-b border-rule grid grid-cols-[1.4rem_1fr] gap-2">
            {c.pass ? <Check size={16} className="mt-1" aria-label="Met" /> : <X size={16} className="mt-1 text-accent" strokeWidth={2.6} aria-label="Not met" />}
            <div>
              <p className={`text-sm ${c.pass ? "" : "font-semibold"}`}>{c.label}</p>
              <p className="text-sm text-muted">{c.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MatchBreakdown({ match }: { match: JobMatch }) {
  return (
    <section aria-label="Match breakdown">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-2xl">Your match: <span className="text-accent num">{match.percent}%</span></h2>
        <AIBadge />
      </div>
      <div className="space-y-3 mb-5">{match.parts.map((p) => <ScoreBar key={p.label} label={p.label} value={p.percent} />)}</div>
      {match.why.length > 0 && (<><h3 className="text-lg mb-1">Why this matches</h3><ul className="list-disc pl-5 text-sm space-y-1 mb-4">{match.why.map((w) => <li key={w}>{w}</li>)}</ul></>)}
      {match.missing.length > 0 && (<><h3 className="text-lg mb-1">What is missing</h3><ul className="list-disc pl-5 text-sm space-y-1">{match.missing.map((w) => <li key={w}>{w}</li>)}</ul></>)}
      <p className="text-xs text-muted mt-4">Based on skill overlap (50%), experience range (20%), location (15%) and salary expectation (15%).</p>
    </section>
  );
}
