/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Applicant, Application, Criterion, CriterionScore, Feedback, Interview, Resume, Score, Stage } from "@/types";
import * as engine from "@/lib/ai/engine";
import { STALE_DAYS } from "@/lib/config";
import { daysAgo } from "@/lib/utils/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { ApplicationBundle } from "../applicationsService";
import { bump, ServiceError } from "../util";
import { detectOverride } from "../overrides";
import { stageDb, stageUi } from "./mappers";
import { fetchJobs, realJobs } from "./jobs";
import { realResume, toApplicant, toResume } from "./resume";

const sb = () => supabaseBrowser();
const fail = (e: { message: string } | null) => { if (e) throw new ServiceError(e.message); };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const one = (v: any) => (Array.isArray(v) ? v[0] : v) ?? undefined;
const me = async () => {
  const { data } = await sb().auth.getUser();
  if (!data.user) throw new ServiceError("You are not signed in.");
  return data.user.id;
};

const APP_SELECT =
  "*, application_answers(question_id, question_text, answer), stage_events(to_stage, actor_type, note, at), application_notes(id, text, at), " +
  "interviews(*), application_overrides(*), rejection_feedback(*), " +
  "scoring_results(id, final_score, is_current, created_at, criterion_scores(*))";

const IV_STATUS_UI: Record<string, Interview["status"]> = { scheduled: "Scheduled", accepted: "Accepted", reschedule_requested: "Reschedule requested" };
const IV_STATUS_DB: Record<string, string> = { Accepted: "accepted", "Reschedule requested": "reschedule_requested" };
const pad = (n: number) => String(n).padStart(2, "0");

function toInterview(rows: any[]): Interview | undefined {
  if (!rows?.length) return undefined;
  const i = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const d = new Date(i.scheduled_at);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    mode: cap(i.mode) as Interview["mode"], link: i.location_or_link, panel: i.panel ?? [], status: IV_STATUS_UI[i.status] ?? "Scheduled",
  };
}

function toScore(results: any[]): Score | undefined {
  const cur = (results ?? []).find((r) => r.is_current);
  if (!cur) return undefined;
  const criteria: CriterionScore[] = [...cur.criterion_scores].sort((a: any, b: any) => a.position - b.position).map((c: any) => ({
    criterionId: c.id, label: c.label, weight: Number(c.weight), score: c.ai_score, reasoning: c.reasoning,
    override: c.override_score != null ? { score: c.override_score, comment: c.override_comment ?? "", at: c.overridden_at ?? cur.created_at, by: "Recruiter" } : undefined,
  }));
  return { criteria, final: engine.weightedFinal(criteria), ranAt: cur.created_at, basedOn: criteria.map((c) => ({ label: c.label, weight: c.weight })) };
}

function toApplication(r: any): Application {
  const fb = one(r.rejection_feedback);
  return {
    id: r.id, jobId: r.job_id, applicantId: r.applicant_id, stage: stageUi(r.stage), appliedAt: r.applied_at, coverNote: r.cover_note,
    answers: Object.fromEntries((r.application_answers ?? []).map((a: any) => [a.question_id ?? a.question_text, a.answer])),
    expectedSalary: Number(r.expected_salary), noticeDays: r.notice_days,
    eligibility: { eligible: r.eligible, checks: r.eligibility_checks ?? [] },
    score: toScore(r.scoring_results), summary: r.ai_summary ?? undefined,
    overrides: (r.application_overrides ?? []).map((o: any) => ({ at: o.at, type: o.type, target: o.target, from: o.from_value, to: o.to_value, comment: o.comment }))
      .sort((a: any, b: any) => a.at.localeCompare(b.at)),
    history: [...(r.stage_events ?? [])].sort((a: any, b: any) => a.at.localeCompare(b.at))
      .map((e: any) => ({ stage: stageUi(e.to_stage), at: e.at, by: e.actor_type, note: e.note ?? undefined })),
    feedback: fb ? { stage: stageUi(fb.stage), message: fb.message, reasons: fb.reasons, improvements: fb.improvements, generatedAt: fb.generated_at, edited: fb.edited } : undefined,
    rejectedAtStage: r.rejected_at_stage ? stageUi(r.rejected_at_stage) : undefined,
    interview: toInterview(r.interviews),
    notes: [...(r.application_notes ?? [])].sort((a: any, b: any) => b.at.localeCompare(a.at)).map((n: any) => ({ id: n.id, at: n.at, text: n.text })),
    appliedAnyway: r.applied_anyway,
  };
}

async function fetchApps(build: (q: any) => any): Promise<Application[]> {
  const { data, error } = await build(sb().from("applications").select(APP_SELECT));
  fail(error);
  return (data ?? []).map(toApplication);
}

/** Applicant profiles for many people in four requests, instead of four per person. */
async function applicantsMap(ids: string[]): Promise<Map<string, Applicant>> {
  const out = new Map<string, Applicant>();
  if (!ids.length) return out;
  const [p, prof, work, skills] = await Promise.all([
    sb().from("applicant_profiles").select("*").in("user_id", ids),
    sb().from("profiles").select("id, full_name, email").in("id", ids),
    sb().from("work_experiences").select("*").in("applicant_id", ids).order("position"),
    sb().from("applicant_skills").select("applicant_id, skills(name)").in("applicant_id", ids),
  ]);
  fail(p.error); fail(prof.error); fail(work.error); fail(skills.error);
  for (const row of (p.data ?? []) as any[]) {
    out.set(row.user_id, toApplicant(
      row, (prof.data ?? []).find((x: any) => x.id === row.user_id),
      (work.data ?? []).filter((w: any) => w.applicant_id === row.user_id),
      (skills.data ?? []).filter((s: any) => s.applicant_id === row.user_id),
    ));
  }
  return out;
}

async function bundles(apps: Application[]): Promise<ApplicationBundle[]> {
  if (!apps.length) return [];
  const jobIds = Array.from(new Set(apps.map((a) => a.jobId)));
  const jobs = new Map((await fetchJobs((q) => q.in("id", jobIds))).map((r) => [r.job.id, r]));
  const people = await applicantsMap(Array.from(new Set(apps.map((a) => a.applicantId))));
  const { data: rs } = await sb().from("resumes").select("*").in("applicant_id", Array.from(people.keys()));
  return apps.map((application) => {
    const j = jobs.get(application.jobId);
    const applicant = people.get(application.applicantId);
    if (!j || !applicant) throw new ServiceError("This application is missing its job or applicant.");
    const mine = ((rs ?? []) as any[]).filter((r) => r.applicant_id === applicant.id);
    const row = mine.find((r) => r.id === applicant.resumeId) ?? mine[0];
    const resume: Resume | null = row ? toResume(row, applicant) : null;
    return { application, applicant, resume, job: j.job, company: j.company };
  });
}

async function bundleOf(id: string): Promise<ApplicationBundle> {
  const apps = await fetchApps((q) => q.eq("id", id).limit(1));
  if (!apps[0]) throw new ServiceError("This application could not be found.");
  return (await bundles(apps))[0];
}

/* ----------------------------- stage changes ----------------------------- */
async function upsertFeedback(id: string, fb: Feedback) {
  fail((await sb().from("rejection_feedback").upsert({
    application_id: id, stage: stageDb(fb.stage), message: fb.message, reasons: fb.reasons, improvements: fb.improvements,
    edited: fb.edited, model: "rules-v1", generated_at: fb.generatedAt, sent_at: new Date().toISOString(),
  })).error);
}

async function moveOne(id: string, to: Stage, opts: { note?: string; feedback?: Feedback } = {}) {
  const b = await bundleOf(id);
  const app = b.application;
  if (app.stage === to) return;
  const override = detectOverride(app, to, opts.note);
  let feedback: Feedback | undefined;
  if (to === "Rejected") {
    feedback = opts.feedback ?? engine.generateRejectionFeedback({ application: app, applicant: b.applicant, job: b.job, company: b.company, stage: app.stage });
  }
  // the database trigger records the stage history, the rejected-at stage and the notification
  fail((await sb().from("applications").update({ stage: stageDb(to) }).eq("id", id)).error);
  if (to === "Rejected" && feedback) await upsertFeedback(id, { ...feedback, stage: app.stage });
  else if (app.stage === "Rejected") fail((await sb().from("rejection_feedback").delete().eq("application_id", id)).error);
  if (override) {
    fail((await sb().from("application_overrides").insert({
      application_id: id, type: override.type, target: override.target, from_value: override.from, to_value: override.to,
      comment: override.comment, by_user: await me(),
    })).error);
  }
}

/* -------------------------------- scoring -------------------------------- */
async function persistScore(runId: string, app: Application, score: Score, summary: string) {
  const prev = await sb().from("scoring_results").select("id, criterion_scores(label, override_score, override_comment, overridden_by, overridden_at)")
    .eq("application_id", app.id).eq("is_current", true).maybeSingle();
  fail(prev.error);
  const old: any[] = (prev.data as any)?.criterion_scores ?? [];
  const rows = score.criteria.map((c, position) => {
    const o = old.find((x) => x.label === c.label && x.override_score != null);
    return { ...c, o, position };
  });
  // carry earlier manual overrides across a re-run, then recompute the final score
  const final = engine.weightedFinal(rows.map((r) => ({ ...r, override: r.o ? { score: r.o.override_score, comment: "", at: "", by: "" } : undefined })));
  if (prev.data) fail((await sb().from("scoring_results").update({ is_current: false }).eq("id", (prev.data as any).id)).error);
  const res = await sb().from("scoring_results").insert({ run_id: runId, application_id: app.id, final_score: final, is_current: true }).select("id").single();
  fail(res.error);
  fail((await sb().from("criterion_scores").insert(rows.map((r) => ({
    result_id: (res.data as any).id, position: r.position, label: r.label, weight: r.weight, ai_score: r.score, reasoning: r.reasoning,
    override_score: r.o?.override_score ?? null, override_comment: r.o?.override_comment ?? null,
    overridden_by: r.o?.overridden_by ?? null, overridden_at: r.o?.overridden_at ?? null,
  })))).error);
  const moveUp = app.stage === "Applied" && app.eligibility.eligible;
  fail((await sb().from("applications").update({ final_score: final, ai_summary: summary, ...(moveUp ? { stage: "screening" } : {}) }).eq("id", app.id)).error);
}

async function newRun(jobId: string, criteria: Criterion[]): Promise<string> {
  const { data, error } = await sb().from("scoring_runs").insert({
    job_id: jobId, started_by: await me(), model: "rules-v1",
    criteria_snapshot: criteria.map((c) => ({ label: c.label, kind: c.kind, weight: c.weight, description: c.description })),
  }).select("id").single();
  fail(error);
  return (data as any).id;
}

/** Recomputes the stored final score after an override is added or removed. */
async function refreshFinal(applicationId: string) {
  const [app] = await fetchApps((q) => q.eq("id", applicationId).limit(1));
  const cur = await sb().from("scoring_results").select("id").eq("application_id", applicationId).eq("is_current", true).maybeSingle();
  if (!app?.score || !cur.data) return;
  fail((await sb().from("scoring_results").update({ final_score: app.score.final }).eq("id", (cur.data as any).id)).error);
  fail((await sb().from("applications").update({ final_score: app.score.final }).eq("id", applicationId)).error);
}

export const realApplications = {
  /* ------------------------------ applicant ------------------------------ */
  async apply(input: { jobId: string; applicantId: string; coverNote: string; answers: Record<string, string>; expectedSalary: number; noticeDays: number }) {
    const [{ applicant }, detail] = await Promise.all([realResume.getProfile(input.applicantId), realJobs.getJobDetail(input.jobId, input.applicantId)]);
    const { job } = detail;
    if (job.status !== "Open") throw new ServiceError("This role is not accepting applications right now.");
    if (detail.existingApplicationId) throw new ServiceError("You have already applied to this role.");
    // NOTE: eligibility is computed in the browser for now; it must move server-side before launch.
    const eligibility = engine.checkEligibility({ ...applicant, noticeDays: input.noticeDays }, job);
    if (!eligibility.eligible && !job.allowIneligible) throw new ServiceError("You do not meet the hard requirements for this role.");

    const { data, error } = await sb().from("applications").insert({
      job_id: job.id, applicant_id: input.applicantId, resume_id: applicant.resumeId, cover_note: input.coverNote,
      expected_salary: input.expectedSalary, notice_days: input.noticeDays, applied_anyway: !eligibility.eligible,
      eligible: eligibility.eligible, eligibility_checks: eligibility.checks,
    }).select("id").single();
    if (error) throw new ServiceError(error.code === "23505" ? "You have already applied to this role." : error.message);
    const id = (data as any).id as string;
    if (job.screeningQuestions.length) {
      fail((await sb().from("application_answers").insert(job.screeningQuestions.map((q) => ({
        application_id: id, question_id: q.id, question_text: q.text, answer: input.answers[q.id] ?? "",
      })))).error);
    }
    bump();
    return (await bundleOf(id)).application;
  },

  async listForApplicant(applicantId: string) {
    const apps = await fetchApps((q) => q.eq("applicant_id", applicantId).order("applied_at", { ascending: false }));
    if (!apps.length) return [];
    const jobs = new Map((await fetchJobs((q) => q.in("id", apps.map((a) => a.jobId)))).map((r) => [r.job.id, r]));
    return apps.flatMap((application) => { const j = jobs.get(application.jobId); return j ? [{ application, job: j.job, company: j.company }] : []; });
  },

  async getForApplicant(id: string, applicantId: string) {
    const b = await bundleOf(id);
    if (b.application.applicantId !== applicantId) throw new ServiceError("This application could not be found.");
    return b;
  },

  async withdraw(id: string) {
    fail((await sb().rpc("withdraw_application", { p_app_id: id })).error);
    bump();
  },

  async respondToInterview(id: string, response: "Accepted" | "Reschedule requested") {
    const { data, error } = await sb().from("interviews").select("id").eq("application_id", id).order("created_at", { ascending: false }).limit(1);
    fail(error);
    if (!data?.length) throw new ServiceError("There is no interview scheduled for this application.");
    fail((await sb().rpc("respond_to_interview", { p_interview_id: (data[0] as any).id, p_status: IV_STATUS_DB[response] })).error);
    bump();
  },

  /* ------------------------------ recruiter ------------------------------ */
  async listForJob(jobId: string) {
    const apps = await fetchApps((q) => q.eq("job_id", jobId));
    const people = await applicantsMap(Array.from(new Set(apps.map((a) => a.applicantId))));
    return apps.flatMap((application) => { const applicant = people.get(application.applicantId); return applicant ? [{ application, applicant }] : []; });
  },

  async getCandidate(id: string) {
    return bundleOf(id);
  },

  async getMany(ids: string[]) {
    return bundles(await fetchApps((q) => q.in("id", ids)));
  },

  async moveStage(ids: string[], to: Stage, opts?: { note?: string; feedback?: Feedback }) {
    for (const id of ids) await moveOne(id, to, opts);
    bump();
  },

  async reject(id: string, feedback: Feedback) {
    await moveOne(id, "Rejected", { feedback, note: "Rejected with feedback." });
    bump();
  },

  async previewAutoFilter(jobId: string) {
    const { data, error } = await sb().from("applications").select("id").eq("job_id", jobId).in("stage", ["applied", "screening"]).eq("eligible", false);
    fail(error);
    const ids = (data ?? []).map((r: any) => r.id as string);
    return { count: ids.length, ids };
  },

  async autoFilterIneligible(jobId: string): Promise<number> {
    const { data, error } = await sb().rpc("auto_filter_ineligible", { p_job_id: jobId });
    fail(error);
    const ids = (data ?? []) as string[];
    if (ids.length) {
      for (const b of await bundles(await fetchApps((q) => q.in("id", ids)))) {
        const stage = b.application.rejectedAtStage ?? "Screening";
        await upsertFeedback(b.application.id, engine.generateRejectionFeedback({ application: b.application, applicant: b.applicant, job: b.job, company: b.company, stage }));
      }
    }
    bump();
    return ids.length;
  },

  async scheduleInterview(id: string, interview: Omit<Interview, "status">) {
    const app = (await fetchApps((q) => q.eq("id", id).limit(1)))[0];
    if (!app) throw new ServiceError("Application not found.");
    fail((await sb().from("interviews").insert({
      application_id: id, scheduled_at: new Date(`${interview.date}T${interview.time}`).toISOString(), mode: interview.mode.toLowerCase(),
      location_or_link: interview.link, panel: interview.panel, created_by: await me(),
    })).error);
    if (app.stage !== "Interview") fail((await sb().from("applications").update({ stage: "interview" }).eq("id", id)).error);
    bump();
  },

  async overrideScore(id: string, criterionId: string, score: number, comment: string) {
    if (!comment.trim()) throw new ServiceError("A comment is required for a manual override.");
    const row = await sb().from("criterion_scores").select("label, ai_score, override_score").eq("id", criterionId).maybeSingle();
    fail(row.error);
    if (!row.data) throw new ServiceError("Criterion not found.");
    const uid = await me();
    fail((await sb().from("criterion_scores").update({ override_score: score, override_comment: comment.trim(), overridden_by: uid, overridden_at: new Date().toISOString() }).eq("id", criterionId)).error);
    const r: any = row.data;
    fail((await sb().from("application_overrides").insert({
      application_id: id, type: "score", target: r.label, from_value: String(r.override_score ?? r.ai_score), to_value: String(score), comment: comment.trim(), by_user: uid,
    })).error);
    await refreshFinal(id);
    bump();
  },

  async clearOverride(id: string, criterionId: string) {
    fail((await sb().from("criterion_scores").update({ override_score: null, override_comment: null, overridden_by: null, overridden_at: null }).eq("id", criterionId)).error);
    await refreshFinal(id);
    bump();
  },

  async addNote(id: string, text: string) {
    fail((await sb().from("application_notes").insert({ application_id: id, author_id: await me(), text })).error);
    bump();
  },

  async markHired(id: string, opts: { markFilled: boolean; feedbackToRest: boolean }) {
    const app = (await fetchApps((q) => q.eq("id", id).limit(1)))[0];
    if (!app) throw new ServiceError("Application not found.");
    await moveOne(id, "Hired", { note: "Marked as hired." });
    let notified = 0;
    if (opts.feedbackToRest) {
      const rest = await fetchApps((q) => q.eq("job_id", app.jobId).neq("id", id).in("stage", ["applied", "screening", "shortlisted", "interview", "offer"]));
      for (const a of rest) await moveOne(a.id, "Rejected", { note: "Role filled; feedback sent to remaining applicants." });
      notified = rest.length;
    }
    if (opts.markFilled) fail((await sb().from("jobs").update({ status: "filled" }).eq("id", app.jobId)).error);
    bump();
    return { notified };
  },

  async saveFeedback(id: string, feedback: Feedback) {
    await upsertFeedback(id, { ...feedback, edited: true });
    bump();
  },

  async scoreOne(id: string) {
    const b = await bundleOf(id);
    if (!b.job.criteria.length) throw new ServiceError("Add scoring criteria for this role first.");
    const score = engine.scoreApplication({ application: b.application, applicant: b.applicant, resume: b.resume ?? undefined, job: b.job, company: b.company }, b.job.criteria);
    const summary = engine.summarizeApplication({ application: { ...b.application, score }, applicant: b.applicant, job: b.job });
    await persistScore(await newRun(b.job.id, b.job.criteria), b.application, score, summary);
    bump();
  },

  async remainingCount(jobId: string, exceptId: string) {
    const { count } = await sb().from("applications").select("id", { count: "exact", head: true })
      .eq("job_id", jobId).neq("id", exceptId).in("stage", ["applied", "screening", "shortlisted", "interview", "offer"]);
    return count ?? 0;
  },

  async dashboard(userId: string) {
    const jobRows = await fetchJobs((q) => q.eq("recruiter_id", userId));
    const jobs = jobRows.map((r) => r.job);
    const apps = jobs.length ? await fetchApps((q) => q.in("job_id", jobs.map((j) => j.id))) : [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weekEnd = today.getTime() + 8 * 86400000;
    const interviews = apps.filter((a) => a.stage === "Interview" && a.interview)
      .filter((a) => { const t = new Date(a.interview!.date).getTime(); return t >= today.getTime() && t < weekEnd; })
      .sort((a, b) => a.interview!.date.localeCompare(b.interview!.date));
    const people = await applicantsMap(interviews.map((a) => a.applicantId));
    const attention = jobs.filter((j) => j.status === "Open").map((job) => {
      const waiting = apps.filter((a) => a.jobId === job.id && a.stage === "Applied");
      const oldest = waiting.reduce((m, a) => Math.max(m, daysAgo(a.appliedAt)), 0);
      return {
        job, waiting: waiting.length, oldest, ineligible: waiting.filter((a) => !a.eligibility.eligible).length,
        unscored: apps.filter((a) => a.jobId === job.id && !a.score && ["Applied", "Screening"].includes(a.stage)).length,
      };
    }).filter((r) => r.waiting > 0 && (r.oldest >= STALE_DAYS || r.ineligible > 0)).sort((a, b) => b.oldest - a.oldest);
    return {
      openRoles: jobs.filter((j) => j.status === "Open").length,
      awaiting: apps.filter((a) => a.stage === "Applied").length,
      shortlisted: apps.filter((a) => a.stage === "Shortlisted").length,
      interviewsThisWeek: interviews.length,
      filled: jobs.filter((j) => j.status === "Filled").length,
      attention,
      interviews: interviews.flatMap((application) => {
        const applicant = people.get(application.applicantId);
        const job = jobs.find((j) => j.id === application.jobId);
        return applicant && job ? [{ application, applicant, job }] : [];
      }),
    };
  },
};

/* ------------------------- AI-service counterparts ------------------------- */
export const realAi = {
  async summarizeApplication(application: Application) {
    const b = await bundleOf(application.id);
    const summary = engine.summarizeApplication({ application: b.application, applicant: b.applicant, job: b.job });
    fail((await sb().from("applications").update({ ai_summary: summary }).eq("id", application.id)).error);
    bump();
    return summary;
  },

  async generateRejectionFeedback(application: Application, stage: Stage): Promise<Feedback> {
    const b = await bundleOf(application.id);
    return engine.generateRejectionFeedback({ application: b.application, applicant: b.applicant, job: b.job, company: b.company, stage });
  },

  /** Scores every active applicant for a role under one run. Earlier manual overrides are kept. */
  async runScoring(jobId: string, criteria: Criterion[], onProgress?: (done: number, total: number) => void) {
    const apps = (await fetchApps((q) => q.eq("job_id", jobId).neq("stage", "withdrawn")));
    const list = await bundles(apps);
    const runId = await newRun(jobId, criteria);
    onProgress?.(0, list.length);
    let done = 0;
    for (const b of list) {
      const score = engine.scoreApplication({ application: b.application, applicant: b.applicant, resume: b.resume ?? undefined, job: b.job, company: b.company }, criteria);
      const summary = engine.summarizeApplication({ application: { ...b.application, score }, applicant: b.applicant, job: b.job });
      await persistScore(runId, b.application, score, summary);
      onProgress?.(++done, list.length);
    }
    bump();
    return done;
  },
};
