/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Company, Criterion, CriteriaTemplate, Job } from "@/types";
import { checkEligibility, matchJob } from "@/lib/ai/engine";
import { toINR } from "@/lib/ai/shared";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { JobFilters, JobListing } from "../jobsService";
import { bump, ServiceError } from "../util";
import { categoryDb, categoryUi, currencyUi, degreeDb, degreeUi, levelDb, levelUi, modeDb, modeUi, typeDb, typeUi } from "./mappers";
import { realResume, skillIds } from "./resume";

const sb = () => supabaseBrowser();
const fail = (e: { message: string } | null) => { if (e) throw new ServiceError(e.message); };
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A job with everything the screens need, in one request. Applicants never receive criteria (row-level security hides them). */
const JOB_SELECT =
  "*, job_skills(kind, skills(name)), job_questions(id, text, position), job_criteria(id, label, kind, weight, description, position), " +
  "recruiter_profiles(user_id, company_name, industry, company_size, city, website, about)";

export function toCompany(r: any): Company {
  return {
    id: r.user_id, name: r.company_name, industry: r.industry ?? "", size: r.company_size ?? "",
    city: r.city ?? "", website: r.website ?? "", about: r.about ?? "",
  };
}

function toJob(r: any): Job {
  const names = (kind: string): string[] => (r.job_skills ?? []).filter((s: any) => s.kind === kind).map((s: any) => s.skills?.name).filter(Boolean);
  const byPos = (a: any, b: any) => a.position - b.position;
  return {
    id: r.id, companyId: r.recruiter_id, recruiterId: r.recruiter_id, title: r.title, category: categoryUi(r.category),
    department: r.department, location: r.location, workMode: modeUi(r.work_mode), employmentType: typeUi(r.employment_type),
    level: levelUi(r.level), salaryMin: Number(r.salary_min), salaryMax: Number(r.salary_max), currency: currencyUi(r.currency),
    description: r.description, responsibilities: r.responsibilities ?? [], preferredSkills: names("preferred"),
    requirements: {
      minExperience: Number(r.min_experience), requiredSkills: names("required"), degree: degreeUi(r.degree_required),
      locations: r.allowed_locations ?? [], maxNoticeDays: r.max_notice_days,
    },
    screeningQuestions: [...(r.job_questions ?? [])].sort(byPos).map((q: any) => ({ id: q.id, text: q.text })),
    allowIneligible: r.allow_ineligible, status: cap(r.status) as Job["status"], postedAt: r.posted_at ?? r.created_at,
    criteria: [...(r.job_criteria ?? [])].sort(byPos).map((c: any) => ({ id: c.id, label: c.label, kind: c.kind, weight: Number(c.weight), description: c.description })),
    openings: r.openings,
  };
}

export async function fetchJobs(build: (q: any) => any): Promise<{ job: Job; company: Company }[]> {
  const { data, error } = await build(sb().from("jobs").select(JOB_SELECT));
  fail(error);
  return (data ?? []).map((r: any) => ({ job: toJob(r), company: toCompany(r.recruiter_profiles) }));
}

async function fetchJob(id: string) {
  const rows = await fetchJobs((q) => q.eq("id", id).limit(1));
  if (!rows[0]) throw new ServiceError("This job could not be found. It may have been removed.");
  return rows[0];
}

/** Same search, filter and sort rules as the demo version. */
function applyFilters(rows: JobListing[], f: JobFilters, hasProfile: boolean): JobListing[] {
  const q = f.q?.toLowerCase().trim();
  let out = rows.filter(({ job, company }) => {
    if (q && !`${job.title} ${company.name} ${job.department} ${job.preferredSkills.join(" ")} ${job.requirements.requiredSkills.join(" ")}`.toLowerCase().includes(q)) return false;
    if (f.category && job.category !== f.category) return false;
    if (f.location && job.location !== f.location) return false;
    if (f.mode && job.workMode !== f.mode) return false;
    if (f.level && job.level !== f.level) return false;
    if (f.type && job.employmentType !== f.type) return false;
    if (f.minSalary && toINR(job.salaryMax, job.currency) < f.minSalary) return false;
    if (f.posted && Date.now() - new Date(job.postedAt).getTime() > f.posted * 86400000) return false;
    return true;
  });
  if (f.eligibleOnly && hasProfile) out = out.filter((r) => r.eligibility?.eligible);
  const sort = f.sort ?? (hasProfile ? "match" : "newest");
  out.sort((a, b) =>
    sort === "match" ? (b.match?.percent ?? 0) - (a.match?.percent ?? 0)
    : sort === "salary" ? toINR(b.job.salaryMax, b.job.currency) - toINR(a.job.salaryMax, a.job.currency)
    : new Date(b.job.postedAt).getTime() - new Date(a.job.postedAt).getTime());
  return out;
}

async function writeCriteria(jobId: string, criteria: Criterion[]) {
  fail((await sb().from("job_criteria").delete().eq("job_id", jobId)).error);
  if (criteria.length) {
    fail((await sb().from("job_criteria").insert(criteria.map((c, position) => ({
      job_id: jobId, label: c.label, kind: c.kind, weight: c.weight, description: c.description, position,
    })))).error);
  }
}

export const realJobs = {
  async listOpenJobs(filters: JobFilters, applicantId?: string): Promise<JobListing[]> {
    const open = await fetchJobs((q) => q.eq("status", "open"));
    let profile = null;
    if (applicantId) profile = (await realResume.getProfile(applicantId).catch(() => null))?.applicant ?? null;
    const hasProfile = !!profile && profile.skills.length > 0;
    const rows: JobListing[] = open.map(({ job, company }) => ({
      job, company, match: hasProfile ? matchJob(profile!, job) : null, eligibility: hasProfile ? checkEligibility(profile!, job) : null,
    }));
    return applyFilters(rows, filters, hasProfile);
  },

  async filterOptions() {
    const { data, error } = await sb().from("jobs").select("location").eq("status", "open");
    fail(error);
    return { locations: (Array.from(new Set((data ?? []).map((j: any) => j.location as string).filter(Boolean))) as string[]).sort() };
  },

  async getJobDetail(jobId: string, applicantId?: string) {
    const { job, company } = await fetchJob(jobId);
    let profile = null;
    let existing: string | null = null;
    if (applicantId) {
      profile = (await realResume.getProfile(applicantId).catch(() => null))?.applicant ?? null;
      const { data } = await sb().from("applications").select("id").eq("job_id", jobId).eq("applicant_id", applicantId).neq("stage", "withdrawn").maybeSingle();
      existing = data?.id ?? null;
    }
    const hasProfile = !!profile && profile.skills.length > 0;
    return {
      job, company, existingApplicationId: existing,
      match: hasProfile ? matchJob(profile!, job) : null, eligibility: hasProfile ? checkEligibility(profile!, job) : null,
    };
  },

  /* ------------------------------ recruiter ------------------------------ */
  async listRecruiterJobs(userId: string) {
    const rows = await fetchJobs((q) => q.eq("recruiter_id", userId).order("created_at", { ascending: false }));
    const ids = rows.map((r) => r.job.id);
    const counts: Record<string, Record<string, number>> = {};
    if (ids.length) {
      const { data, error } = await sb().from("job_stage_counts").select("job_id, stage, total").in("job_id", ids);
      fail(error);
      (data ?? []).forEach((c: any) => { (counts[c.job_id] ??= {})[cap(c.stage)] = c.total; });
    }
    return rows.map(({ job, company }) => {
      const c = (counts[job.id] ?? {}) as Record<any, number>;
      return { job, company, total: Object.values(c).reduce((a: number, b: number) => a + b, 0), counts: c };
    });
  },

  async getRecruiterJob(jobId: string) {
    return fetchJob(jobId);
  },

  async listCompaniesFor(userId: string) {
    const { data, error } = await sb().from("recruiter_profiles").select("*").eq("user_id", userId);
    fail(error);
    return (data ?? []).map(toCompany);
  },

  /** Creates the job when its id is not a database id yet (new jobs are built in the browser), otherwise updates it. */
  async saveJob(job: Job): Promise<Job> {
    const isNew = !isUuid(job.id);
    const row = {
      recruiter_id: job.recruiterId, title: job.title, category: categoryDb(job.category), department: job.department,
      location: job.location, work_mode: modeDb(job.workMode), employment_type: typeDb(job.employmentType), level: levelDb(job.level),
      salary_min: job.salaryMin, salary_max: job.salaryMax, currency: job.currency, description: job.description,
      responsibilities: job.responsibilities, openings: job.openings, allow_ineligible: job.allowIneligible,
      status: job.status.toLowerCase(), min_experience: job.requirements.minExperience,
      degree_required: degreeDb(job.requirements.degree), max_notice_days: job.requirements.maxNoticeDays,
      allowed_locations: job.requirements.locations,
      ...(job.status === "Open" ? { posted_at: job.postedAt } : {}),
    };

    let id = job.id;
    if (isNew) {
      const { data, error } = await sb().from("jobs").insert(row).select("id").single();
      fail(error);
      id = (data as any).id;
    } else {
      fail((await sb().from("jobs").update(row).eq("id", id)).error);
    }

    // skills: a skill listed as required wins over the same skill listed as preferred
    const req = job.requirements.requiredSkills;
    const pref = job.preferredSkills.filter((s) => !req.some((r) => r.toLowerCase() === s.toLowerCase()));
    const reqIds = await skillIds(req);
    const prefIds = await skillIds(pref);
    fail((await sb().from("job_skills").delete().eq("job_id", id)).error);
    const skillRows = [...reqIds.map((skill_id) => ({ job_id: id, skill_id, kind: "required" })), ...prefIds.filter((s) => !reqIds.includes(s)).map((skill_id) => ({ job_id: id, skill_id, kind: "preferred" }))];
    if (skillRows.length) fail((await sb().from("job_skills").insert(skillRows)).error);

    // questions keep their ids when they already exist, so earlier answers stay linked
    const existing = await sb().from("job_questions").select("id").eq("job_id", id);
    fail(existing.error);
    const keep = new Set(job.screeningQuestions.filter((q) => isUuid(q.id)).map((q) => q.id));
    const drop = (existing.data ?? []).map((q: any) => q.id as string).filter((qid: string) => !keep.has(qid));
    if (drop.length) fail((await sb().from("job_questions").delete().in("id", drop)).error);
    for (const [position, q] of job.screeningQuestions.entries()) {
      if (isUuid(q.id)) fail((await sb().from("job_questions").update({ text: q.text, position }).eq("id", q.id)).error);
      else fail((await sb().from("job_questions").insert({ job_id: id, text: q.text, position })).error);
    }

    if (isNew || job.criteria.length) await writeCriteria(id, job.criteria);
    bump();
    return (await fetchJob(id)).job;
  },

  async setStatus(jobId: string, status: Job["status"]) {
    const patch: Record<string, unknown> = { status: status.toLowerCase() };
    if (status === "Open") {
      const cur = await sb().from("jobs").select("posted_at").eq("id", jobId).maybeSingle();
      if (!cur.data?.posted_at) patch.posted_at = new Date().toISOString();
    }
    fail((await sb().from("jobs").update(patch).eq("id", jobId)).error);
    bump();
  },

  async duplicate(jobId: string): Promise<Job> {
    const { job } = await fetchJob(jobId);
    return realJobs.saveJob({
      ...job, id: "new", title: `${job.title} (copy)`, status: "Draft", postedAt: new Date().toISOString(),
      screeningQuestions: job.screeningQuestions.map((q) => ({ ...q, id: "new" })),
    });
  },

  async saveCriteria(jobId: string, criteria: Criterion[]) {
    await writeCriteria(jobId, criteria);
    bump();
  },

  async listTemplates(): Promise<CriteriaTemplate[]> {
    const { data, error } = await sb().from("criteria_templates").select("id, name, criteria_template_items(id, label, kind, weight, description, position)").order("created_at");
    fail(error);
    return (data ?? []).map((t: any) => ({
      id: t.id, name: t.name,
      criteria: [...t.criteria_template_items].sort((a: any, b: any) => a.position - b.position)
        .map((c: any) => ({ id: c.id, label: c.label, kind: c.kind, weight: Number(c.weight), description: c.description })),
    }));
  },

  async saveTemplate(name: string, criteria: Criterion[]) {
    const { data: auth } = await sb().auth.getUser();
    const { data, error } = await sb().from("criteria_templates").insert({ recruiter_id: auth.user!.id, name }).select("id").single();
    fail(error);
    const id = (data as any).id as string;
    if (criteria.length) {
      fail((await sb().from("criteria_template_items").insert(criteria.map((c, position) => ({
        template_id: id, label: c.label, kind: c.kind, weight: c.weight, description: c.description, position,
      })))).error);
    }
    bump();
    return { id, name, criteria };
  },
};
