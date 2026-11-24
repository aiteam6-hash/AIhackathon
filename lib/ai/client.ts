/**
 * Browser-side wrappers around /api/ai. Each one builds a trimmed, name-free input, calls Claude through
 * the server route, and converts the reply to the app's own types. If Claude is unavailable (no key,
 * rate limit, refusal, network), scoring, summaries and feedback fall back to the rules in engine.ts,
 * so the product keeps working.
 */
import type { Applicant, Application, Company, Criterion, Feedback, Job, Resume, Score, Stage } from "@/types";
import * as engine from "./engine";
import { ALL_SKILLS, hasSkill, toINR } from "./shared";
import type { JobDraft } from "./schemas";
import type { ParsedProfile } from "./parse";
import { money, uid } from "@/lib/utils/format";

export class AiUnavailable extends Error {}

interface Reply<T> { data: T; model: string }

export async function callAi<T>(task: string, input: unknown, ctx: { jobId?: string; applicationId?: string } = {}): Promise<Reply<T>> {
  let res: Response;
  try {
    res = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task, input, ...ctx }) });
  } catch {
    throw new AiUnavailable("network");
  }
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new AiUnavailable(j.error ?? `status_${res.status}`);
  }
  return res.json();
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 0)));
/** Removes the applicant's name, email and phone from text before it leaves the browser. */
function anonymise(text: string, name: string): string {
  let t = text.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]").replace(/(\+?\d[\d\s-]{8,}\d)/g, "[phone]");
  for (const part of name.split(/\s+/).filter((p) => p.length > 2)) t = t.replace(new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "the candidate");
  return t;
}

const candidateOf = (a: Applicant) => ({
  headline: a.headline, location: a.location, experienceYears: a.experienceYears,
  education: `${a.education.degree} in ${a.education.field || "not stated"}, ${a.education.institution || "not stated"}`,
  skills: a.skills,
  work: a.work.map((w) => `${w.title} at ${w.employer} (${w.startYear} to ${w.endYear ?? "present"})`),
  summary: anonymise(a.summary, a.name), noticeDays: a.noticeDays, expectedSalary: money(a.expectedSalary, a.salaryCurrency),
});

export interface Subject { application: Application; applicant: Applicant; resume?: Resume | null; job: Job; company?: Company }

/** Scores one applicant. Returns the model that did the work: a Claude id, or "rules-v1" on fallback. */
export async function aiScore(s: Subject, criteria: Criterion[]): Promise<{ score: Score; model: string }> {
  try {
    const { data, model } = await callAi<{ criteria: { label: string; score: number; reasoning: string }[] }>("score", {
      job: {
        title: s.job.title, category: s.job.category, level: s.job.level, description: s.job.description.slice(0, 3000),
        minExperience: s.job.requirements.minExperience, requiredSkills: s.job.requirements.requiredSkills,
        preferredSkills: s.job.preferredSkills, degree: s.job.requirements.degree,
      },
      criteria: criteria.map((c) => ({ label: c.label, kind: c.kind, weight: c.weight, description: c.description })),
      candidate: candidateOf(s.applicant),
      eligibility: s.application.eligibility.checks.map((c) => ({ label: c.label, pass: c.pass, detail: c.detail })),
      coverNote: anonymise(s.application.coverNote, s.applicant.name).slice(0, 3000),
      resumeText: anonymise(s.resume?.text ?? "", s.applicant.name).slice(0, 12000),
      answers: s.job.screeningQuestions.map((q) => ({ question: q.text, answer: anonymise(s.application.answers[q.id] ?? "", s.applicant.name).slice(0, 2000) })),
    }, { jobId: s.job.id, applicationId: s.application.id });

    const total = criteria.reduce((t, c) => t + c.weight, 0) || 1;
    const rows = criteria.map((c, i) => {
      const r = data.criteria.find((x) => x.label === c.label) ?? data.criteria[i];
      if (!r) throw new AiUnavailable("incomplete");
      return { criterionId: c.id, label: c.label, weight: Math.round((c.weight / total) * 100), score: clamp(r.score), reasoning: r.reasoning.trim() };
    });
    return { score: { criteria: rows, final: engine.weightedFinal(rows), ranAt: new Date().toISOString(), basedOn: rows.map((r) => ({ label: r.label, weight: r.weight })) }, model };
  } catch (e) {
    if (!(e instanceof AiUnavailable)) throw e;
    return { score: engine.scoreApplication({ application: s.application, applicant: s.applicant, resume: s.resume ?? undefined, job: s.job, company: s.company }, criteria), model: "rules-v1" };
  }
}

export async function aiSummary(s: Subject): Promise<string> {
  const a = s.applicant;
  const band = `${money(s.job.salaryMin, s.job.currency)} to ${money(s.job.salaryMax, s.job.currency)}`;
  try {
    const { data } = await callAi<{ strengths: string; concerns: string; availability: string; nextStep: string }>("summary", {
      jobTitle: s.job.title,
      candidate: { headline: a.headline, experienceYears: a.experienceYears, skills: a.skills, currentRole: a.work[0] ? `${a.work[0].title} at ${a.work[0].employer}` : "none listed", noticeDays: s.application.noticeDays, expectedSalary: money(s.application.expectedSalary, a.salaryCurrency), salaryBand: band },
      eligibility: s.application.eligibility.checks.map((c) => ({ label: c.label, pass: c.pass })),
      scores: (s.application.score?.criteria ?? []).map((c) => ({ label: c.label, score: engine.effectiveScore(c), reasoning: c.reasoning })),
      finalScore: s.application.score?.final ?? null,
    }, { jobId: s.job.id, applicationId: s.application.id });
    return `Strengths: ${data.strengths}\nConcerns: ${data.concerns}\n${data.availability}\nSuggested next step: ${data.nextStep}`;
  } catch (e) {
    if (!(e instanceof AiUnavailable)) throw e;
    return engine.summarizeApplication({ application: s.application, applicant: s.applicant, job: s.job });
  }
}

export async function aiFeedback(s: Subject, stage: Stage): Promise<Feedback> {
  const a = s.applicant;
  const weak = [...(s.application.score?.criteria ?? [])].sort((x, y) => engine.effectiveScore(x) - engine.effectiveScore(y)).filter((c) => engine.effectiveScore(c) < 75).slice(0, 3);
  const over = toINR(s.application.expectedSalary, a.salaryCurrency) > toINR(s.job.salaryMax, s.job.currency) * 1.1;
  try {
    const { data } = await callAi<{ message: string; reasons: string[]; improvements: string[] }>("feedback", {
      stage, jobTitle: s.job.title, companyName: s.company?.name ?? "the company",
      failedChecks: s.application.eligibility.checks.filter((c) => !c.pass).map((c) => `${c.label}: ${c.detail}`),
      weakCriteria: weak.map((c) => ({ label: c.label, score: engine.effectiveScore(c), reasoning: c.reasoning })),
      missingSkills: s.job.preferredSkills.filter((k) => !hasSkill(a.skills, k)),
      experienceYears: a.experienceYears,
      salaryNote: over ? `Expected ${money(s.application.expectedSalary, a.salaryCurrency)}, above the posted range ${money(s.job.salaryMin, s.job.currency)} to ${money(s.job.salaryMax, s.job.currency)}.` : undefined,
    }, { jobId: s.job.id, applicationId: s.application.id });
    if (!data.reasons.length || !data.improvements.length) throw new AiUnavailable("incomplete");
    return { stage, message: data.message.trim(), reasons: data.reasons.slice(0, 4), improvements: data.improvements.slice(0, 3), generatedAt: new Date().toISOString(), edited: false };
  } catch (e) {
    if (!(e instanceof AiUnavailable)) throw e;
    return engine.generateRejectionFeedback({ application: s.application, applicant: a, job: s.job, company: s.company, stage });
  }
}

export async function aiCriteria(job: Job): Promise<Criterion[]> {
  try {
    const { data } = await callAi<{ criteria: { label: string; kind: Criterion["kind"]; weight: number; description: string }[] }>("criteria", {
      title: job.title, category: job.category, level: job.level, description: job.description.slice(0, 3000),
      requiredSkills: job.requirements.requiredSkills, preferredSkills: job.preferredSkills,
    }, { jobId: job.id });
    const list = data.criteria.filter((c) => c.label.trim()).slice(0, 8);
    if (list.length < 2) throw new AiUnavailable("incomplete");
    const total = list.reduce((t, c) => t + Math.max(0, c.weight), 0) || 1;
    const out = list.map((c) => ({ id: uid("c"), label: c.label.trim(), kind: c.kind, weight: Math.round((Math.max(0, c.weight) / total) * 100), description: c.description.trim() }));
    out[0].weight += 100 - out.reduce((t, c) => t + c.weight, 0); // rounding
    return out;
  } catch (e) {
    if (!(e instanceof AiUnavailable)) throw e;
    return engine.suggestCriteria(job);
  }
}

/** Unlike scoring, drafting a job post has no rules fallback: the caller shows the error. */
export async function aiJobDraft(input: { title: string; category: string; level: string; location: string; workMode: string; employmentType: string; notes?: string; requiredSkills?: string[] }): Promise<JobDraft> {
  const { data } = await callAi<JobDraft>("job_description", input);
  const canon = (names: string[]) => Array.from(new Set(names.map((n) => ALL_SKILLS.find((s) => s.toLowerCase() === n.toLowerCase())).filter((s): s is string => !!s)));
  return {
    description: data.description.trim(), responsibilities: data.responsibilities.map((r) => r.trim()).filter(Boolean).slice(0, 6),
    requiredSkills: canon(data.requiredSkills).slice(0, 3), preferredSkills: canon(data.preferredSkills).slice(0, 5),
    screeningQuestions: data.screeningQuestions.map((q) => q.trim()).filter(Boolean).slice(0, 3),
  };
}

export async function aiParseResume(text: string): Promise<Omit<ParsedProfile, "name" | "email">> {
  const { data } = await callAi<{
    headline: string; location: string; experienceYears: number; skills: string[]; degree: "none" | "diploma" | "bachelors" | "masters" | "phd";
    field: string; institution: string; work: { title: string; employer: string; startYear: number; endYear: number | null }[]; summary: string;
  }>("parse_resume", { text: text.slice(0, 20000) });
  const DEG = { none: "None", diploma: "Diploma", bachelors: "Bachelor's", masters: "Master's", phd: "PhD" } as const;
  return {
    headline: data.headline, location: data.location, experienceYears: Math.max(0, Math.round(data.experienceYears * 2) / 2),
    skills: Array.from(new Set(data.skills.map((n) => ALL_SKILLS.find((s) => s.toLowerCase() === n.toLowerCase())).filter((s): s is string => !!s))),
    education: { degree: DEG[data.degree], field: data.field, institution: data.institution },
    work: data.work.map((w) => ({ title: w.title, employer: w.employer, startYear: Math.round(w.startYear), endYear: w.endYear == null ? null : Math.round(w.endYear) })),
    summary: data.summary,
  };
}
