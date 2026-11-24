import type { Application, OverrideRecord, Stage } from "@/types";

const FORWARD: Stage[] = ["Shortlisted", "Interview", "Offer", "Hired"];

/** Compares a recruiter's decision with what the AI suggested; a mismatch is recorded as an override. */
export function detectOverride(app: Application, to: Stage, comment?: string): OverrideRecord | null {
  const final = app.score?.final;
  let suggested: string | null = null;
  if (FORWARD.includes(to) && !app.eligibility.eligible) suggested = "Reject (fails hard requirements)";
  else if (["Shortlisted", "Interview", "Offer"].includes(to) && final !== undefined && final < 50) suggested = `Reject (score ${final})`;
  else if (to === "Rejected" && final !== undefined && final >= 75 && app.eligibility.eligible) suggested = `Shortlist (score ${final})`;
  if (!suggested) return null;
  return {
    at: new Date().toISOString(), type: "decision", target: "Stage",
    from: `AI suggested: ${suggested}`, to: `Recruiter chose: ${to}`, comment: comment?.trim() || "No comment given.",
  };
}
