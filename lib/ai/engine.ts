/**
 * The simulated AI. Everything here is a pure, deterministic function:
 * the same inputs always produce the same scores and the same wording.
 * To use a real LLM later, replace the functions in lib/services/aiService.ts
 * with API calls that return the same shapes (see README).
 */
import type {
  Applicant, Application, Company, Criterion, CriterionKind, CriterionScore, Eligibility,
  EligibilityCheck, Feedback, Job, JobMatch, Resume, Score, Stage,
} from "@/types";
import { CURRENT_YEAR, degreeRank, experienceRange, hasSkill, norm, toINR } from "./shared";
import { money } from "@/lib/utils/format";

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
const first = (name: string) => name.split(" ")[0];
/** Turns a recruiter-facing sentence about "Priya" into applicant-facing "you". */
const toYou = (text: string, name: string) =>
  text
    .replace(new RegExp(String.raw`${first(name)} has`, "g"), "You have")
    .replace(new RegExp(String.raw`${first(name)}`, "g"), "you")
    .replace(/^you\b/, "You");
const list = (xs: string[]) =>
  xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

/* ------------------------------------------------------------------ */
/* Eligibility: hard requirements, pass/fail each                      */
/* ------------------------------------------------------------------ */
export function checkEligibility(a: Applicant, job: Job): Eligibility {
  const r = job.requirements;
  const checks: EligibilityCheck[] = [];

  checks.push({
    key: "experience",
    label: `${r.minExperience}+ years of experience`,
    pass: a.experienceYears >= r.minExperience,
    detail: `Your profile shows ${a.experienceYears} ${a.experienceYears === 1 ? "year" : "years"}; the role asks for at least ${r.minExperience}.`,
  });

  const missing = r.requiredSkills.filter((s) => !hasSkill(a.skills, s));
  checks.push({
    key: "skills",
    label: r.requiredSkills.length ? `Required skills: ${r.requiredSkills.join(", ")}` : "Required skills",
    pass: missing.length === 0,
    detail: missing.length
      ? `Missing from your profile: ${missing.join(", ")}.`
      : r.requiredSkills.length ? "You list every required skill." : "No specific skills are required.",
  });

  const cities = r.locations.length ? r.locations : [job.location];
  const inCity = cities.some((c) => norm(c) === norm(a.location));
  checks.push({
    key: "location",
    label: job.workMode === "Remote" ? "Location (remote role)" : `Based in ${cities.join(" or ")}`,
    pass: job.workMode === "Remote" || inCity || a.openToRelocate,
    detail:
      job.workMode === "Remote" ? "This role is remote, so location does not restrict you."
      : inCity ? `You are based in ${a.location}.`
      : a.openToRelocate ? `You are in ${a.location} but open to relocating.`
      : `You are in ${a.location} and not open to relocating; the role is based in ${cities.join(" or ")}.`,
  });

  checks.push({
    key: "notice",
    label: `Notice period up to ${r.maxNoticeDays} days`,
    pass: a.noticeDays <= r.maxNoticeDays,
    detail: `Your notice period is ${a.noticeDays} days; the team can wait ${r.maxNoticeDays}.`,
  });

  checks.push({
    key: "degree",
    label: r.degree === "None" ? "Degree (not required)" : `${r.degree} degree or higher`,
    pass: degreeRank(a.education.degree) >= degreeRank(r.degree),
    detail: r.degree === "None"
      ? "No degree is required."
      : `Your highest qualification is ${a.education.degree === "None" ? "none listed" : a.education.degree}; the role asks for ${r.degree}.`,
  });

  return { eligible: checks.every((c) => c.pass), checks };
}

/* ------------------------------------------------------------------ */
/* Job matching for applicants                                         */
/* ------------------------------------------------------------------ */
export function matchJob(p: Applicant, job: Job): JobMatch {
  const req = job.requirements.requiredSkills;
  const pref = job.preferredSkills;
  const reqHit = req.filter((s) => hasSkill(p.skills, s));
  const prefHit = pref.filter((s) => hasSkill(p.skills, s));
  const reqCov = req.length ? reqHit.length / req.length : 1;
  const prefCov = pref.length ? prefHit.length / pref.length : reqCov;
  const skills = reqCov * 0.65 + prefCov * 0.35;

  const [, hi] = experienceRange(job.level);
  const minExp = job.requirements.minExperience;
  const exp = p.experienceYears < minExp ? p.experienceYears / Math.max(minExp, 1) : p.experienceYears > hi + 4 ? 0.85 : 1;

  const cities = job.requirements.locations.length ? job.requirements.locations : [job.location];
  const inCity = cities.some((c) => norm(c) === norm(p.location));
  const loc = job.workMode === "Remote" || inCity ? 1 : p.openToRelocate ? 0.6 : 0.2;

  const expected = toINR(p.expectedSalary, p.salaryCurrency);
  const max = toINR(job.salaryMax, job.currency);
  const sal = expected <= max ? 1 : Math.max(0, 1 - ((expected - max) / max) * 2.5);

  const percent = clamp(skills * 50 + exp * 20 + loc * 15 + sal * 15);

  const why: string[] = [];
  if (reqHit.length) why.push(`You list ${reqHit.length} of ${req.length} required skills: ${list(reqHit)}.`);
  if (prefHit.length) why.push(`Preferred skills you already have: ${list(prefHit)}.`);
  if (p.experienceYears >= minExp) why.push(`${p.experienceYears} years of experience meets the ${minExp}-year minimum.`);
  if (job.workMode === "Remote") why.push("The role is remote.");
  else if (inCity) why.push(`The role is based in ${p.location}, where you live.`);
  if (sal === 1) why.push("Your salary expectation is within the posted range.");

  const missing: string[] = [];
  const miss = req.filter((s) => !hasSkill(p.skills, s));
  if (miss.length) missing.push(`Required skills not on your profile: ${list(miss)}.`);
  const missPref = pref.filter((s) => !hasSkill(p.skills, s));
  if (missPref.length) missing.push(`Preferred skills to add: ${list(missPref.slice(0, 3))}.`);
  if (p.experienceYears < minExp) missing.push(`${(minExp - p.experienceYears).toFixed(1).replace(".0", "")} more years of experience needed.`);
  if (loc < 1) missing.push(`Based in ${cities.join(" or ")}${p.openToRelocate ? "; you are open to relocating" : ""}.`);
  if (sal < 1) missing.push(`Your expected ${money(p.expectedSalary, p.salaryCurrency)} is above the top of the range.`);

  const oneLine = miss.length
    ? `Strong on ${reqHit.length ? list(reqHit.slice(0, 2)) : "background"}, but missing ${list(miss.slice(0, 2))}.`
    : prefHit.length
      ? `You cover every required skill and ${prefHit.length} of ${pref.length} preferred ones.`
      : `You cover every required skill${job.workMode === "Remote" ? " and the role is remote" : ""}.`;

  return {
    jobId: job.id, percent, why, missing, oneLine,
    parts: [
      { label: "Skills", percent: Math.round(skills * 100) },
      { label: "Experience", percent: Math.round(exp * 100) },
      { label: "Location", percent: Math.round(loc * 100) },
      { label: "Salary", percent: Math.round(sal * 100) },
    ],
  };
}
export const matchJobs = (p: Applicant, jobs: Job[]) => jobs.map((j) => matchJob(p, j));

/* ------------------------------------------------------------------ */
/* Application scoring against recruiter criteria                      */
/* ------------------------------------------------------------------ */
const DOMAIN_WORDS: Record<string, string[]> = {
  Engineering: ["engineer", "developer", "software", "backend", "frontend", "devops", "sre", "full stack"],
  Design: ["designer", "design", "ux", "ui", "researcher", "product design"],
  Operations: ["operations", "supply", "logistics", "procurement", "warehouse", "ops", "planner"],
  Sales: ["sales", "account", "business development", "bdm", "sdr", "partnerships"],
  Support: ["support", "customer", "service", "success", "helpdesk"],
  Finance: ["finance", "accountant", "analyst", "audit", "fp&a", "accounts", "controller"],
};
const FIELD_WORDS: Record<string, string[]> = {
  Engineering: ["computer", "information technology", "software", "electronics", "engineering", "mathematics"],
  Design: ["design", "fine arts", "hci", "psychology", "architecture"],
  Operations: ["supply", "operations", "industrial", "business", "management", "logistics"],
  Sales: ["business", "marketing", "commerce", "management", "economics"],
  Support: ["business", "commerce", "arts", "computer", "communication", "english"],
  Finance: ["commerce", "finance", "accounting", "economics", "mathematics", "statistics"],
};

type Scored = { score: number; reasoning: string };

function scoreExperience(a: Applicant, job: Job): Scored {
  const min = job.requirements.minExperience;
  const [, hi] = experienceRange(job.level);
  const y = a.experienceYears;
  let score = y < min ? 55 * (y / Math.max(min, 1)) : 70 + (y - min) * (30 / Math.max(hi - min, 2));
  if (y > hi + 5) score -= 8; // heavily over-experienced candidates often leave quickly
  const latest = a.work[0];
  const verdict = score >= 80 ? "That comfortably covers what this role needs."
    : score >= 60 ? "That meets the bar without much margin."
    : "That is short of what the role needs.";
  return {
    score: clamp(score),
    reasoning: `${first(a.name)} has ${y} years of experience against a ${min}-year minimum for the ${job.title} role. ${latest ? `Most recent role: ${latest.title} at ${latest.employer}${latest.endYear ? "" : " (current)"}.` : ""} ${verdict}`.replace(/\s+/g, " ").trim(),
  };
}

function scoreSkills(a: Applicant, job: Job): Scored {
  const req = job.requirements.requiredSkills;
  const pref = job.preferredSkills;
  const rHit = req.filter((s) => hasSkill(a.skills, s));
  const pHit = pref.filter((s) => hasSkill(a.skills, s));
  const rCov = req.length ? rHit.length / req.length : 1;
  const pCov = pref.length ? pHit.length / pref.length : 1;
  const miss = [...req, ...pref].filter((s) => !hasSkill(a.skills, s));
  return {
    score: clamp(rCov * 70 + pCov * 30),
    reasoning: `Covers ${rHit.length} of ${req.length} must-have skills${rHit.length ? ` (${list(rHit)})` : ""} and ${pHit.length} of ${pref.length} preferred skills. ${miss.length ? `Not listed: ${list(miss.slice(0, 4))}.` : "No gaps against the skills list."} The resume names ${a.skills.length} skills in total.`,
  };
}

function scoreEducation(a: Applicant, job: Job): Scored {
  const need = job.requirements.degree;
  const have = a.education.degree;
  const fields = FIELD_WORDS[job.category] ?? [];
  const relevant = fields.some((f) => norm(a.education.field).includes(f));
  let score = degreeRank(have) >= degreeRank(need) ? 70 : 35;
  if (relevant) score += 20;
  if (degreeRank(have) > Math.max(degreeRank(need), 2)) score += 10;
  return {
    score: clamp(score),
    reasoning: `${have === "None" ? "No formal degree listed" : `${have} in ${a.education.field} from ${a.education.institution}`}. The role asks for ${need === "None" ? "no specific degree" : `a ${need} or higher`}, ${degreeRank(have) >= degreeRank(need) ? "which this meets" : "which this does not meet"}. The field of study is ${relevant ? "directly relevant to" : "only loosely related to"} ${job.category.toLowerCase()} work.`,
  };
}

function scoreStability(a: Applicant): Scored {
  if (!a.work.length) return { score: 45, reasoning: "No employment history is listed, so tenure cannot be assessed." };
  const tenures = a.work.map((w) => Math.max(0.5, (w.endYear ?? CURRENT_YEAR) - w.startYear));
  const avg = tenures.reduce((x, y) => x + y, 0) / tenures.length;
  const span = Math.max(...a.work.map((w) => w.endYear ?? CURRENT_YEAR)) - Math.min(...a.work.map((w) => w.startYear));
  let score = avg >= 3 ? 92 : avg >= 2.2 ? 80 : avg >= 1.6 ? 65 : avg >= 1 ? 50 : 38;
  if (a.work.length >= 5 && span <= 7) score -= 8;
  const longest = a.work[tenures.indexOf(Math.max(...tenures))];
  return {
    score: clamp(score),
    reasoning: `${a.work.length} ${a.work.length === 1 ? "role" : "roles"} over ${span} years, averaging ${avg.toFixed(1)} years per role. Longest stint: ${Math.max(...tenures).toFixed(0)} years at ${longest.employer}. ${score >= 75 ? "That pattern suggests the person tends to stay and grow in a role." : score >= 55 ? "Tenure is acceptable but worth asking about in the interview." : "Frequent moves are a risk for a role that needs ramp-up time."}`,
  };
}

function scoreDomain(a: Applicant, job: Job): Scored {
  const words = [...(DOMAIN_WORDS[job.category] ?? []), ...job.title.toLowerCase().split(/\W+/).filter((w) => w.length > 4)];
  const rel = a.work.filter((w) => words.some((k) => norm(w.title).includes(k)));
  const share = a.work.length ? rel.length / a.work.length : 0;
  const mention = words.some((k) => norm(a.summary).includes(k));
  return {
    score: clamp(share * 85 + (mention ? 15 : 0)),
    reasoning: `${rel.length} of ${a.work.length} past roles are in ${job.category.toLowerCase()} work${rel.length ? ` (${list(rel.slice(0, 2).map((w) => `${w.title} at ${w.employer}`))})` : ""}. The summary ${mention ? "also speaks to this field" : "does not mention this field directly"}. ${share >= 0.7 ? "Background is closely aligned." : share >= 0.4 ? "Partly aligned; expect some ramp-up." : "This would be a career switch."}`,
  };
}

function scoreCommunication(a: Applicant, job: Job, app: Application, company?: Company): Scored {
  const note = app.coverNote.trim();
  const words = note ? note.split(/\s+/).length : 0;
  if (!words) return { score: 35, reasoning: `${first(a.name)} did not include a cover note, so there is nothing to judge written communication on beyond the resume summary. The resume summary is ${a.summary.split(/\s+/).length} words long.` };
  let score = words < 20 ? 45 : words > 250 ? 60 : 70;
  const namesRole = norm(note).includes(norm(job.title).split(" ")[0]) || (company ? norm(note).includes(norm(company.name).split(" ")[0]) : false);
  const hasNumber = /\d/.test(note);
  if (namesRole) score += 10;
  if (hasNumber) score += 10;
  if (note.split(/[.!?]/).filter((s) => s.trim()).length >= 3) score += 5;
  return {
    score: clamp(score),
    reasoning: `The cover note runs ${words} words. It ${namesRole ? "names the role or company" : "does not name the role or company"} and ${hasNumber ? "backs a claim with a number" : "offers no figures or results"}. ${score >= 80 ? "It is specific and easy to read." : score >= 60 ? "It is clear but fairly general." : "It is too thin to show how this person communicates."}`,
  };
}

function scoreCustom(a: Applicant, resume: Resume | undefined, c: Criterion): Scored {
  const kws = Array.from(new Set(`${c.label} ${c.description}`.toLowerCase().split(/\W+/).filter((w) => w.length > 3)));
  const text = norm(`${resume?.text ?? ""} ${a.summary} ${a.skills.join(" ")}`);
  const hits = kws.filter((k) => text.includes(k));
  return {
    score: clamp(35 + (kws.length ? (hits.length / kws.length) * 60 : 20)),
    reasoning: `Searched the resume for ${list(kws.slice(0, 4).map((k) => `"${k}"`)) || "the criterion's keywords"}; ${hits.length} of ${kws.length} appear${hits.length ? ` (${list(hits.slice(0, 3))})` : ""}. Treat this as a keyword signal only and read the resume to confirm.`,
  };
}

export function effectiveScore(cs: CriterionScore) {
  return cs.override ? cs.override.score : cs.score;
}
export function weightedFinal(cs: CriterionScore[]) {
  const total = cs.reduce((s, c) => s + c.weight, 0) || 1;
  return Math.round(cs.reduce((s, c) => s + effectiveScore(c) * c.weight, 0) / total);
}

export function scoreApplication(
  ctx: { application: Application; applicant: Applicant; resume?: Resume; job: Job; company?: Company },
  criteria: Criterion[],
): Score {
  const { application, applicant, resume, job, company } = ctx;
  const byKind: Record<CriterionKind, (c: Criterion) => Scored> = {
    experience: () => scoreExperience(applicant, job),
    skills: () => scoreSkills(applicant, job),
    education: () => scoreEducation(applicant, job),
    stability: () => scoreStability(applicant),
    domain: () => scoreDomain(applicant, job),
    communication: () => scoreCommunication(applicant, job, application, company),
    custom: (c) => scoreCustom(applicant, resume, c),
  };
  const total = criteria.reduce((s, c) => s + c.weight, 0) || 1;
  const rows: CriterionScore[] = criteria.map((c) => {
    const r = byKind[c.kind](c);
    return {
      criterionId: c.id, label: c.label,
      weight: Math.round((c.weight / total) * 100),
      score: r.score, reasoning: r.reasoning,
    };
  });
  return {
    criteria: rows,
    final: weightedFinal(rows),
    ranAt: new Date().toISOString(),
    basedOn: rows.map((r) => ({ label: r.label, weight: r.weight })),
  };
}

/* ------------------------------------------------------------------ */
/* Recruiter summary                                                   */
/* ------------------------------------------------------------------ */
export function summarizeApplication(ctx: { application: Application; applicant: Applicant; job: Job }): string {
  const { application, applicant: a, job } = ctx;
  const failed = application.eligibility.checks.filter((c) => !c.pass);
  const lines: string[] = [];
  const s = application.score;
  if (s) {
    const sorted = [...s.criteria].sort((x, y) => effectiveScore(y) - effectiveScore(x));
    const top = sorted.slice(0, 2);
    lines.push(`Strengths: ${list(top.map((t) => `${t.label.toLowerCase()} (${effectiveScore(t)})`))}. ${a.work[0] ? `Currently ${a.work[0].title} at ${a.work[0].employer}.` : ""}`.trim());
    const low = sorted[sorted.length - 1];
    lines.push(
      failed.length ? `Concerns: fails ${list(failed.map((f) => f.label.toLowerCase()))}.`
      : effectiveScore(low) < 70 ? `Concerns: ${low.label.toLowerCase()} is the weakest area at ${effectiveScore(low)}.`
      : "Concerns: none significant against the criteria set.",
    );
  } else {
    lines.push(`Strengths: ${a.experienceYears} years of experience with ${list(a.skills.slice(0, 3))} on the resume. Not scored yet.`);
    lines.push(failed.length ? `Concerns: fails ${list(failed.map((f) => f.label.toLowerCase()))}.` : "Concerns: none against the hard requirements.");
  }
  const exp = toINR(application.expectedSalary, a.salaryCurrency);
  const max = toINR(job.salaryMax, job.currency);
  lines.push(`Expects ${money(application.expectedSalary, a.salaryCurrency)} (${exp <= max ? "within" : "above"} the band) with a ${application.noticeDays}-day notice period.`);
  const final = s?.final;
  lines.push(
    failed.length && !job.allowIneligible ? "Suggested next step: reject at screening with feedback."
    : final === undefined ? "Suggested next step: run AI scoring to rank this candidate."
    : final >= 75 ? "Suggested next step: shortlist and schedule an interview."
    : final >= 55 ? "Suggested next step: keep in screening and review the weakest criterion before deciding."
    : "Suggested next step: reject with feedback; a stronger pool is available.",
  );
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Applicant-facing rejection feedback                                 */
/* ------------------------------------------------------------------ */
export function generateRejectionFeedback(ctx: {
  application: Application; applicant: Applicant; job: Job; company?: Company; stage: Stage;
}): Feedback {
  const { application, applicant: a, job, company, stage } = ctx;
  const reasons: string[] = [];
  const improve: string[] = [];
  const failed = application.eligibility.checks.filter((c) => !c.pass);

  for (const f of failed) {
    reasons.push(f.detail.replace(/^Your profile shows/, "Your resume shows"));
    if (f.key === "experience") improve.push(`Build the missing ${(job.requirements.minExperience - a.experienceYears).toFixed(1).replace(".0", "")} years through a contract, freelance project or internship in ${job.category.toLowerCase()} work, then apply to roles with a lower minimum while you do.`);
    if (f.key === "skills") {
      const m = job.requirements.requiredSkills.filter((s) => !hasSkill(a.skills, s));
      improve.push(`Add a small project that uses ${list(m.slice(0, 2))} and link it on your resume.`);
    }
    if (f.key === "degree") improve.push(`The role asks for a ${job.requirements.degree}; a recognised certificate or part-time programme in ${a.education.field || "this field"} would help.`);
    if (f.key === "notice") improve.push(`If your employer allows it, negotiate your notice down to ${job.requirements.maxNoticeDays} days or say so in your cover note.`);
    if (f.key === "location") improve.push(`State clearly in your application that you will relocate to ${job.location}, or look at remote roles.`);
  }

  const s = application.score;
  if (s) {
    const sorted = [...s.criteria].sort((x, y) => effectiveScore(x) - effectiveScore(y));
    for (const c of sorted.slice(0, 2).filter((c) => effectiveScore(c) < 75)) {
      reasons.push(`${c.label} scored ${effectiveScore(c)} out of 100. ${toYou(c.reasoning.split(/(?<=\.)\s/)[0], a.name)}`);
      if (/skill/i.test(c.label)) improve.push(`Close the skills gap: ${list(job.preferredSkills.filter((k) => !hasSkill(a.skills, k)).slice(0, 3)) || "the preferred skills"} came up most in this role.`);
      else if (/communic|cover/i.test(c.label)) improve.push("Write a cover note that names the role and cites one measurable result from your last job.");
      else if (/stab|tenure/i.test(c.label)) improve.push("Add a line in your summary explaining your moves between roles, so a reviewer sees intent rather than churn.");
      else if (/experience/i.test(c.label)) improve.push("Lead each role on your resume with the outcome you owned, such as users served or cost saved, so seniority is visible.");
    }
    if (stage === "Interview" || stage === "Offer") reasons.push(`At the ${stage.toLowerCase()} stage you were compared with other finalists, and the closest match scored ahead of your ${s.final}.`);
  }

  const exp = toINR(application.expectedSalary, a.salaryCurrency);
  if (exp > toINR(job.salaryMax, job.currency) * 1.1) {
    reasons.push(`Your expected salary of ${money(application.expectedSalary, a.salaryCurrency)} is above the range of ${money(job.salaryMin, job.currency)} to ${money(job.salaryMax, job.currency)} for this role.`);
  }
  const prefMissing = job.preferredSkills.filter((k) => !hasSkill(a.skills, k));
  if (reasons.length < 2) reasons.push(`Other applicants showed a closer match on preferred skills; yours did not include ${list(prefMissing.slice(0, 3)) || "several of the listed extras"}.`);
  if (reasons.length < 2) reasons.push(`The pool for ${job.title} was competitive and ${job.openings === 1 ? "there is a single opening" : `there are only ${job.openings} openings`}.`);
  if (improve.length < 2 && prefMissing.length) improve.push(`Learn ${list(prefMissing.slice(0, 2))}; both are listed as preferred for ${job.title}.`);
  if (improve.length < 2) improve.push("Quantify outcomes on your resume, for example the size of the team, the volume handled or the time saved.");
  if (improve.length < 2) improve.push(`Tailor your cover note to ${company?.name ?? "the company"} and the specific problems of the ${job.title} role.`);

  return {
    stage,
    message: `Thank you for applying for ${job.title}${company ? ` at ${company.name}` : ""}. We reviewed your application at the ${stage} stage and have decided not to move forward this time. Below is what shaped that decision and what would strengthen a future application.`,
    reasons: reasons.slice(0, 4),
    improvements: Array.from(new Set(improve)).slice(0, 3),
    generatedAt: new Date().toISOString(),
    edited: false,
  };
}

/* ------------------------------------------------------------------ */
/* Criteria suggestions                                                */
/* ------------------------------------------------------------------ */
const mk = (id: string, label: string, kind: CriterionKind, weight: number, description: string): Criterion => ({ id, label, kind, weight, description });

export function suggestCriteria(job: Job): Criterion[] {
  const seed = job.id;
  const base: Record<string, Criterion[]> = {
    Engineering: [
      mk(`${seed}_c1`, "Skill match", "skills", 30, "Required and preferred technical skills on the resume."),
      mk(`${seed}_c2`, "Relevant experience", "experience", 25, "Years in comparable engineering roles."),
      mk(`${seed}_c3`, "Domain background", "domain", 15, "Past roles close to this team's work."),
      mk(`${seed}_c4`, "Stability", "stability", 10, "Average tenure across roles."),
      mk(`${seed}_c5`, "Education", "education", 10, "Degree level and field."),
      mk(`${seed}_c6`, "Cover note clarity", "communication", 10, "How clearly the applicant writes about the role."),
    ],
    Design: [
      mk(`${seed}_c1`, "Craft and tools", "skills", 30, "Design tools and methods listed."),
      mk(`${seed}_c2`, "Relevant experience", "experience", 25, "Years working on comparable products."),
      mk(`${seed}_c3`, "Communication", "communication", 20, "Cover note clarity and specificity."),
      mk(`${seed}_c4`, "Domain background", "domain", 15, "Design roles in the past."),
      mk(`${seed}_c5`, "Stability", "stability", 10, "Average tenure across roles."),
    ],
  };
  const generic: Criterion[] = [
    mk(`${seed}_c1`, "Skill match", "skills", 30, "Required and preferred skills on the resume."),
    mk(`${seed}_c2`, "Relevant experience", "experience", 25, "Years in comparable roles."),
    mk(`${seed}_c3`, "Domain background", "domain", 20, `Past roles in ${job.category.toLowerCase()}.`),
    mk(`${seed}_c4`, "Stability", "stability", 10, "Average tenure across roles."),
    mk(`${seed}_c5`, "Education", "education", 5, "Degree level and field."),
    mk(`${seed}_c6`, "Communication from cover note", "communication", 10, "Clarity and specificity of the cover note."),
  ];
  return base[job.category] ?? generic;
}
