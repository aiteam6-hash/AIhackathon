import type {
  Applicant, Application, Company, Feedback, Interview, Job, OverrideRecord, Resume, Stage,
} from "@/types";
import * as engine from "@/lib/ai/engine";
import { checkEligibility } from "@/lib/ai/engine";
import { mutate } from "@/lib/store/store";
import { STALE_DAYS } from "@/lib/config";
import { daysAgo, uid } from "@/lib/utils/format";
import { latency, must, notify, nowIso, patchApplication, ServiceError, stageEvent, state, userIdOfApplicant } from "./util";

export interface ApplicationBundle {
  application: Application;
  applicant: Applicant;
  resume: Resume | null;
  job: Job;
  company: Company;
}

function bundle(app: Application): ApplicationBundle {
  const s = state();
  const job = must(s.jobs.find((j) => j.id === app.jobId), "The role for this application no longer exists.");
  return {
    application: app,
    applicant: must(s.applicants.find((a) => a.id === app.applicantId), "Applicant not found."),
    resume: s.resumes.find((r) => r.id === s.applicants.find((a) => a.id === app.applicantId)?.resumeId) ?? null,
    job,
    company: must(s.companies.find((c) => c.id === job.companyId), "Company not found."),
  };
}

const FORWARD: Stage[] = ["Shortlisted", "Interview", "Offer", "Hired"];

/** Compare a recruiter's decision with what the AI suggested; a mismatch is recorded as an override. */
function detectOverride(app: Application, to: Stage, comment?: string): OverrideRecord | null {
  const final = app.score?.final;
  let suggested: string | null = null;
  if (FORWARD.includes(to) && !app.eligibility.eligible) suggested = "Reject (fails hard requirements)";
  else if (["Shortlisted", "Interview", "Offer"].includes(to) && final !== undefined && final < 50) suggested = `Reject (score ${final})`;
  else if (to === "Rejected" && final !== undefined && final >= 75 && app.eligibility.eligible) suggested = `Shortlist (score ${final})`;
  if (!suggested) return null;
  return { at: nowIso(), type: "decision", target: "Stage", from: `AI suggested: ${suggested}`, to: `Recruiter chose: ${to}`, comment: comment?.trim() || "No comment given." };
}

function applyMove(id: string, to: Stage, opts: { note?: string; feedback?: Feedback } = {}) {
  const app = must(state().applications.find((a) => a.id === id), "Application not found.");
  if (app.stage === to) return;
  const b = bundle(app);
  const override = detectOverride(app, to, opts.note);
  let feedback = app.feedback;
  let rejectedAtStage = app.rejectedAtStage;
  if (to === "Rejected") {
    rejectedAtStage = app.stage;
    feedback = opts.feedback ?? engine.generateRejectionFeedback({ application: app, applicant: b.applicant, job: b.job, company: b.company, stage: app.stage });
  } else if (app.stage === "Rejected") {
    feedback = undefined; rejectedAtStage = undefined;
  }
  patchApplication(id, (a) => ({
    ...a, stage: to, feedback, rejectedAtStage,
    history: [...a.history, stageEvent(to, "recruiter", opts.note)],
    overrides: override ? [...a.overrides, override] : a.overrides,
  }));
  const uidA = userIdOfApplicant(app.applicantId);
  if (to === "Rejected") notify(uidA, `Update on ${b.job.title}`, `Your application was not taken forward at the ${rejectedAtStage?.toLowerCase()} stage. Read the feedback.`, `/applications/${id}`);
  else if (to === "Offer") notify(uidA, `Offer for ${b.job.title}`, `${b.company.name} would like to make you an offer.`, `/applications/${id}`);
  else if (to === "Hired") notify(uidA, `Welcome to ${b.company.name}`, `You have been marked as hired for ${b.job.title}.`, `/applications/${id}`);
  else notify(uidA, `Application moved to ${to}`, `${b.company.name} moved your ${b.job.title} application to ${to}.`, `/applications/${id}`);
}

export const applicationsService = {
  /* ------------------------------ applicant ------------------------------ */
  async apply(input: { jobId: string; applicantId: string; coverNote: string; answers: Record<string, string>; expectedSalary: number; noticeDays: number; anyway?: boolean }) {
    await latency(900);
    const s = state();
    const job = must(s.jobs.find((j) => j.id === input.jobId), "This job is no longer available.");
    if (job.status !== "Open") throw new ServiceError("This role is not accepting applications right now.");
    const applicant = must(s.applicants.find((a) => a.id === input.applicantId), "Profile not found.");
    if (s.applications.some((a) => a.jobId === job.id && a.applicantId === applicant.id && a.stage !== "Withdrawn")) {
      throw new ServiceError("You have already applied to this role.");
    }
    const eligibility = checkEligibility({ ...applicant, noticeDays: input.noticeDays }, job);
    if (!eligibility.eligible && !job.allowIneligible) throw new ServiceError("You do not meet the hard requirements for this role.");
    const app: Application = {
      id: uid("app"), jobId: job.id, applicantId: applicant.id, stage: "Applied", appliedAt: nowIso(),
      coverNote: input.coverNote, answers: input.answers, expectedSalary: input.expectedSalary, noticeDays: input.noticeDays,
      eligibility, overrides: [], notes: [], history: [stageEvent("Applied", "applicant")],
      appliedAnyway: !eligibility.eligible,
    };
    mutate((st) => ({ applications: [app, ...st.applications] }));
    notify(job.recruiterId, "New application", `${applicant.name} applied for ${job.title}.`, `/recruiter/candidates/${app.id}`);
    return app;
  },

  async listForApplicant(applicantId: string) {
    await latency(450);
    return state().applications
      .filter((a) => a.applicantId === applicantId)
      .sort((a, b) => b.appliedAt.localeCompare(a.appliedAt))
      .map((a) => {
        const job = must(state().jobs.find((j) => j.id === a.jobId), "Job missing.");
        return { application: a, job, company: must(state().companies.find((c) => c.id === job.companyId), "Company missing.") };
      });
  },

  async getForApplicant(id: string, applicantId: string) {
    await latency(400);
    const app = must(state().applications.find((a) => a.id === id && a.applicantId === applicantId), "This application could not be found.");
    return bundle(app);
  },

  async withdraw(id: string) {
    await latency(500);
    const app = must(state().applications.find((a) => a.id === id), "Application not found.");
    const b = bundle(app);
    patchApplication(id, (a) => ({ ...a, stage: "Withdrawn", history: [...a.history, stageEvent("Withdrawn", "applicant")] }));
    notify(b.job.recruiterId, "Application withdrawn", `${b.applicant.name} withdrew from ${b.job.title}.`, `/recruiter/jobs/${b.job.id}`);
  },

  async respondToInterview(id: string, response: "Accepted" | "Reschedule requested") {
    await latency(500);
    const app = must(state().applications.find((a) => a.id === id), "Application not found.");
    if (!app.interview) throw new ServiceError("There is no interview scheduled for this application.");
    const b = bundle(app);
    patchApplication(id, (a) => ({ ...a, interview: { ...a.interview!, status: response } }));
    notify(b.job.recruiterId, response === "Accepted" ? "Interview accepted" : "Reschedule requested", `${b.applicant.name} ${response === "Accepted" ? "accepted" : "asked to reschedule"} the interview for ${b.job.title}.`, `/recruiter/candidates/${id}`);
  },

  /* ------------------------------ recruiter ------------------------------ */
  async listForJob(jobId: string) {
    await latency(500);
    const s = state();
    return s.applications
      .filter((a) => a.jobId === jobId)
      .map((a) => ({ application: a, applicant: must(s.applicants.find((x) => x.id === a.applicantId), "Applicant missing.") }));
  },

  async getCandidate(id: string): Promise<ApplicationBundle> {
    await latency(450);
    return bundle(must(state().applications.find((a) => a.id === id), "This candidate could not be found."));
  },

  async getMany(ids: string[]): Promise<ApplicationBundle[]> {
    await latency(400);
    return ids.map((id) => state().applications.find((a) => a.id === id)).filter((a): a is Application => !!a).map(bundle);
  },

  async moveStage(ids: string[], to: Stage, opts?: { note?: string; feedback?: Feedback }) {
    await latency(450);
    ids.forEach((id) => applyMove(id, to, opts));
  },

  async reject(id: string, feedback: Feedback) {
    await latency(500);
    applyMove(id, "Rejected", { feedback, note: "Rejected with feedback." });
  },

  /** How many active applicants fail a hard requirement. Used by the confirmation dialog. */
  async previewAutoFilter(jobId: string) {
    const targets = state().applications.filter((a) => a.jobId === jobId && ["Applied", "Screening"].includes(a.stage) && !a.eligibility.eligible);
    return { count: targets.length, ids: targets.map((a) => a.id) };
  },

  async autoFilterIneligible(jobId: string): Promise<number> {
    await latency(900);
    const { ids } = await this.previewAutoFilter(jobId);
    ids.forEach((id) => applyMove(id, "Rejected", { note: "Auto-filtered: did not meet hard requirements." }));
    return ids.length;
  },

  async scheduleInterview(id: string, interview: Omit<Interview, "status">) {
    await latency(600);
    const app = must(state().applications.find((a) => a.id === id), "Application not found.");
    const b = bundle(app);
    const rescheduled = !!app.interview;
    patchApplication(id, (a) => ({
      ...a, stage: "Interview", interview: { ...interview, status: "Scheduled" },
      history: a.stage === "Interview" ? a.history : [...a.history, stageEvent("Interview", "recruiter", "Interview scheduled")],
    }));
    notify(userIdOfApplicant(app.applicantId), rescheduled ? "Interview rescheduled" : "Interview scheduled", `${b.company.name} would like to meet you for ${b.job.title} on ${interview.date} at ${interview.time}.`, `/applications/${id}`);
  },

  /** A manual score change. A comment is required and the change is logged on the application. */
  async overrideScore(id: string, criterionId: string, score: number, comment: string) {
    await latency(400);
    if (!comment.trim()) throw new ServiceError("A comment is required for a manual override.");
    const app = must(state().applications.find((a) => a.id === id), "Application not found.");
    if (!app.score) throw new ServiceError("Run AI scoring before overriding a score.");
    const row = must(app.score.criteria.find((c) => c.criterionId === criterionId), "Criterion not found.");
    const record: OverrideRecord = { at: nowIso(), type: "score", target: row.label, from: String(row.override?.score ?? row.score), to: String(score), comment: comment.trim() };
    patchApplication(id, (a) => {
      const criteria = a.score!.criteria.map((c) => (c.criterionId === criterionId ? { ...c, override: { score, comment: comment.trim(), at: nowIso(), by: "Recruiter" } } : c));
      return { ...a, score: { ...a.score!, criteria, final: engine.weightedFinal(criteria) }, overrides: [...a.overrides, record] };
    });
  },

  async clearOverride(id: string, criterionId: string) {
    await latency(300);
    patchApplication(id, (a) => {
      const criteria = a.score!.criteria.map((c) => (c.criterionId === criterionId ? { ...c, override: undefined } : c));
      return { ...a, score: { ...a.score!, criteria, final: engine.weightedFinal(criteria) } };
    });
  },

  async addNote(id: string, text: string) {
    await latency(250);
    patchApplication(id, (a) => ({ ...a, notes: [{ id: uid("note"), at: nowIso(), text }, ...a.notes] }));
  },

  /** Marks a hire; optionally closes the role and sends feedback to everyone still in the pipeline. */
  async markHired(id: string, opts: { markFilled: boolean; feedbackToRest: boolean }) {
    await latency(800);
    const app = must(state().applications.find((a) => a.id === id), "Application not found.");
    applyMove(id, "Hired", { note: "Marked as hired." });
    let notified = 0;
    if (opts.feedbackToRest) {
      const rest = state().applications.filter((a) => a.jobId === app.jobId && a.id !== id && ["Applied", "Screening", "Shortlisted", "Interview", "Offer"].includes(a.stage));
      rest.forEach((a) => applyMove(a.id, "Rejected", { note: "Role filled; feedback sent to remaining applicants." }));
      notified = rest.length;
    }
    if (opts.markFilled) mutate((s) => ({ jobs: s.jobs.map((j) => (j.id === app.jobId ? { ...j, status: "Filled" } : j)) }));
    return { notified };
  },

  /** Rewords the feedback after a recruiter edits it, marking it as human-edited. */
  async saveFeedback(id: string, feedback: Feedback) {
    await latency(300);
    patchApplication(id, (a) => ({ ...a, feedback: { ...feedback, edited: true } }));
  },

  /** Scores a single candidate with the role's saved criteria. */
  async scoreOne(id: string) {
    await latency(700);
    const app = must(state().applications.find((a) => a.id === id), "Application not found.");
    const b = bundle(app);
    const score = engine.scoreApplication({ application: app, applicant: b.applicant, resume: b.resume ?? undefined, job: b.job, company: b.company }, b.job.criteria);
    const moveUp = app.stage === "Applied" && app.eligibility.eligible;
    const next: Application = {
      ...app, score, stage: moveUp ? "Screening" : app.stage,
      history: moveUp ? [...app.history, stageEvent("Screening", "system", "Scored by AI")] : app.history,
    };
    next.summary = engine.summarizeApplication({ application: next, applicant: b.applicant, job: b.job });
    patchApplication(id, () => next);
  },

  /** Applicants still in play at a role, other than the one being hired. */
  async remainingCount(jobId: string, exceptId: string) {
    return state().applications.filter((a) => a.jobId === jobId && a.id !== exceptId && ["Applied", "Screening", "Shortlisted", "Interview", "Offer"].includes(a.stage)).length;
  },

  async dashboard(userId: string) {
    await latency(500);
    const s = state();
    const user = s.users.find((u) => u.id === userId);
    const jobs = s.jobs.filter((j) => user?.companyIds?.includes(j.companyId));
    const ids = new Set(jobs.map((j) => j.id));
    const apps = s.applications.filter((a) => ids.has(a.jobId));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weekEnd = today.getTime() + 8 * 86400000;
    const interviews = apps
      .filter((a) => a.stage === "Interview" && a.interview)
      .filter((a) => { const t = new Date(a.interview!.date).getTime(); return t >= today.getTime() && t < weekEnd; })
      .sort((a, b) => a.interview!.date.localeCompare(b.interview!.date));
    const attention = jobs
      .filter((j) => j.status === "Open")
      .map((job) => {
        const waiting = apps.filter((a) => a.jobId === job.id && a.stage === "Applied");
        const oldest = waiting.reduce((m, a) => Math.max(m, daysAgo(a.appliedAt)), 0);
        const unscored = apps.filter((a) => a.jobId === job.id && !a.score && ["Applied", "Screening"].includes(a.stage)).length;
        const ineligible = waiting.filter((a) => !a.eligibility.eligible).length;
        return { job, waiting: waiting.length, oldest, unscored, ineligible };
      })
      .filter((r) => r.waiting > 0 && (r.oldest >= STALE_DAYS || r.ineligible > 0))
      .sort((a, b) => b.oldest - a.oldest);
    return {
      openRoles: jobs.filter((j) => j.status === "Open").length,
      awaiting: apps.filter((a) => a.stage === "Applied").length,
      shortlisted: apps.filter((a) => a.stage === "Shortlisted").length,
      interviewsThisWeek: interviews.length,
      filled: jobs.filter((j) => j.status === "Filled").length,
      attention,
      interviews: interviews.map((a) => ({ application: a, applicant: s.applicants.find((x) => x.id === a.applicantId)!, job: s.jobs.find((j) => j.id === a.jobId)! })),
    };
  },
};
