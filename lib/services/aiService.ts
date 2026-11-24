import type { Applicant, Application, Company, Criterion, Feedback, Job, Resume, Stage } from "@/types";
import * as engine from "@/lib/ai/engine";
import { extractProfile, readFileText, type ParsedProfile } from "@/lib/ai/parse";
import { mutate } from "@/lib/store/store";
import { latency, must, nowIso, sleep, state } from "./util";
import { dual } from "./dispatch";
import { realAi } from "./real/applications";

/**
 * Simulated AI. Each function is async with a short delay, then calls deterministic code in lib/ai.
 * Swap these bodies for real LLM calls and keep the signatures.
 */
const mock = {
  /** Reads a PDF/DOCX/TXT upload, reporting progress 0..100 while it "extracts". */
  async parseResume(file: File, onProgress?: (pct: number, label: string) => void): Promise<ParsedProfile & { usedText: boolean; text: string }> {
    const steps = ["Reading file", "Finding contact details", "Extracting skills", "Estimating experience", "Building profile"];
    for (let i = 0; i < steps.length; i++) {
      onProgress?.(Math.round((i / steps.length) * 100), steps[i]);
      await sleep(260);
    }
    const text = await readFileText(file);
    const { profile, usedText } = extractProfile(file.name, text);
    onProgress?.(100, "Done");
    return { ...profile, usedText, text };
  },

  async matchJobs(profile: Applicant, jobs: Job[]) {
    await latency(400);
    return engine.matchJobs(profile, jobs);
  },

  async checkEligibility(applicant: Applicant, job: Job) {
    await latency(300);
    return engine.checkEligibility(applicant, job);
  },

  async scoreApplication(application: Application, criteria: Criterion[]) {
    await latency(500);
    const s = state();
    const applicant = must(s.applicants.find((a) => a.id === application.applicantId), "Applicant not found.");
    const job = must(s.jobs.find((j) => j.id === application.jobId), "Job not found.");
    return engine.scoreApplication(
      { application, applicant, resume: s.resumes.find((r) => r.id === applicant.resumeId), job, company: s.companies.find((c) => c.id === job.companyId) },
      criteria,
    );
  },

  async summarizeApplication(application: Application) {
    await latency(500);
    const s = state();
    const applicant = must(s.applicants.find((a) => a.id === application.applicantId), "Applicant not found.");
    const job = must(s.jobs.find((j) => j.id === application.jobId), "Job not found.");
    const summary = engine.summarizeApplication({ application, applicant, job });
    mutate((st) => ({ applications: st.applications.map((a) => (a.id === application.id ? { ...a, summary } : a)) }));
    return summary;
  },

  async generateRejectionFeedback(application: Application, stage: Stage): Promise<Feedback> {
    await latency(600);
    const s = state();
    const applicant = must(s.applicants.find((a) => a.id === application.applicantId), "Applicant not found.");
    const job = must(s.jobs.find((j) => j.id === application.jobId), "Job not found.");
    return engine.generateRejectionFeedback({ application, applicant, job, stage, company: s.companies.find((c) => c.id === job.companyId) });
  },

  async suggestCriteria(job: Job): Promise<Criterion[]> {
    await latency(700);
    return engine.suggestCriteria(job);
  },

  /**
   * Scores every active application for a role against the given criteria.
   * Existing manual overrides are kept. Eligible applicants waiting at "Applied" move to Screening.
   */
  async runScoring(jobId: string, criteria: Criterion[], onProgress?: (done: number, total: number) => void) {
    const s0 = state();
    const job = must(s0.jobs.find((j) => j.id === jobId), "Job not found.");
    const company: Company | undefined = s0.companies.find((c) => c.id === job.companyId);
    const targets = s0.applications.filter((a) => a.jobId === jobId && a.stage !== "Withdrawn");
    let done = 0;
    onProgress?.(0, targets.length);
    for (const app of targets) {
      await sleep(Math.min(1200, 5000 / Math.max(targets.length, 1)));
      const s = state();
      const applicant = must(s.applicants.find((a) => a.id === app.applicantId), "Applicant not found.");
      const resume: Resume | undefined = s.resumes.find((r) => r.id === applicant.resumeId);
      const score = engine.scoreApplication({ application: app, applicant, resume, job, company }, criteria);
      // carry manual overrides across re-runs, then recompute the final score
      if (app.score) {
        for (const row of score.criteria) {
          const old = app.score.criteria.find((c) => c.criterionId === row.criterionId);
          if (old?.override) row.override = old.override;
        }
        score.final = engine.weightedFinal(score.criteria);
      }
      const moveUp = app.stage === "Applied" && app.eligibility.eligible;
      const updated: Application = {
        ...app, score,
        stage: moveUp ? "Screening" : app.stage,
        history: moveUp ? [...app.history, { stage: "Screening", at: nowIso(), by: "system", note: "Scored by AI" }] : app.history,
      };
      updated.summary = engine.summarizeApplication({ application: updated, applicant, job });
      mutate((st) => ({ applications: st.applications.map((a) => (a.id === app.id ? updated : a)) }));
      onProgress?.(++done, targets.length);
    }
    mutate((st) => ({ jobs: st.jobs.map((j) => (j.id === jobId ? { ...j, criteria } : j)) }));
    return done;
  },
};

export const aiService = dual(mock, realAi);
