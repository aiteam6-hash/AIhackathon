import { Check, X } from "lucide-react";
import type { Application } from "@/types";
import { TIMELINE, stageIndex } from "@/lib/ai/shared";
import { formatDate } from "@/lib/utils/format";

/**
 * Applied → Screening → Shortlisted → Interview → Offer.
 * Completed steps are filled, the current step is outlined in the accent colour,
 * and a rejection marks the exact stage where it happened.
 */
export function StageTimeline({ application }: { application: Application }) {
  const { stage, rejectedAtStage, history } = application;
  const rejected = stage === "Rejected";
  const withdrawn = stage === "Withdrawn";
  const lastIdx = rejected && rejectedAtStage ? stageIndex(rejectedAtStage) : withdrawn ? stageIndex(history[history.length - 2]?.stage ?? "Applied") : stageIndex(stage);
  const hired = stage === "Hired";

  return (
    <ol className="grid gap-0 md:grid-cols-5" aria-label="Application stages">
      {TIMELINE.map((s, i) => {
        const done = i < lastIdx || (i === lastIdx && hired);
        const here = i === lastIdx;
        const failedHere = here && rejected;
        const event = history.find((h) => h.stage === s || (s === "Offer" && h.stage === "Hired"));
        const label = s === "Offer" && hired ? "Hired" : s;
        const upcoming = i > lastIdx;
        return (
          <li key={s} aria-current={here && !rejected && !withdrawn ? "step" : undefined} className="relative flex md:block gap-4 pb-6 md:pb-0 md:pr-4">
            <div className="flex md:flex-row items-center md:mb-3 md:w-full">
              <span className={`grid place-items-center w-8 h-8 shrink-0 rounded-full border-2 ${
                failedHere ? "border-ink bg-ink text-bg"
                : here && !withdrawn ? "border-accent bg-accent-tint text-accent-deep"
                : done ? "border-ink bg-ink text-bg" : "border-rule-strong text-muted"}`}>
                {failedHere ? <X size={16} aria-label="Rejected here" /> : done || (here && hired) ? <Check size={16} aria-label="Completed" /> : <span className="text-xs num">{i + 1}</span>}
              </span>
              {i < TIMELINE.length - 1 && <span aria-hidden className={`hidden md:block flex-1 h-px ml-2 ${upcoming || failedHere || (here && !hired) ? "bg-rule-strong" : "bg-ink"}`} />}
            </div>
            <div>
              <p className={`text-sm ${here ? "font-semibold" : upcoming ? "text-muted" : ""} ${here && !rejected && !withdrawn ? "text-accent-deep" : ""}`}>{label}</p>
              {failedHere && <p className="text-xs font-semibold">Not taken forward here</p>}
              {here && !rejected && !withdrawn && !hired && <p className="text-xs text-muted">Current stage</p>}
              {event && !upcoming && <p className="text-xs text-muted num">{formatDate(event.at)}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
