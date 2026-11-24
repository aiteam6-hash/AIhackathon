import type { Company, Criterion, CriteriaTemplate, Eligibility, Job, JobMatch, Stage } from "@/types";
import { checkEligibility, matchJob } from "@/lib/ai/engine";
import { toINR } from "@/lib/ai/shared";
import { mutate } from "@/lib/store/store";
import { uid } from "@/lib/utils/format";
import { latency, must, nowIso, state } from "./util";
import { dual } from "./dispatch";
import { realJobs } from "./real/jobs";

export interface JobFilters {
  q?: string;
  category?: string;
  location?: string;
  mode?: string;
  level?: string;
  type?: string;
  minSalary?: number; // INR per year
  posted?: number; // within N days
  eligibleOnly?: boolean;
  sort?: "match" | "newest" | "salary";
}

export interface JobListing {
  job: Job;
  company: Company;
  match: JobMatch | null;
  eligibility: Eligibility | null;
}

const companyOf = (id: string) => must(state().companies.find((c) => c.id === id), "Company not found.");

const mock = {
  async listOpenJobs(filters: JobFilters, applicantId?: string): Promise<JobListing[]> {
    await latency(500);
    const s = state();
    const profile = s.applicants.find((a) => a.id === applicantId);
    const hasProfile = !!profile && profile.skills.length > 0;
    const q = filters.q?.toLowerCase().trim();
    let rows: JobListing[] = s.jobs
      .filter((j) => j.status === "Open")
      .map((job) => ({
        job, company: companyOf(job.companyId),
        match: hasProfile ? matchJob(profile!, job) : null,
        eligibility: hasProfile ? checkEligibility(profile!, job) : null,
      }));
    rows = rows.filter(({ job, company }) => {
      if (q && !`${job.title} ${company.name} ${job.department} ${job.preferredSkills.join(" ")} ${job.requirements.requiredSkills.join(" ")}`.toLowerCase().includes(q)) return false;
      if (filters.category && job.category !== filters.category) return false;
      if (filters.location && job.location !== filters.location) return false;
      if (filters.mode && job.workMode !== filters.mode) return false;
      if (filters.level && job.level !== filters.level) return false;
      if (filters.type && job.employmentType !== filters.type) return false;
      if (filters.minSalary && toINR(job.salaryMax, job.currency) < filters.minSalary) return false;
      if (filters.posted && Date.now() - new Date(job.postedAt).getTime() > filters.posted * 86400000) return false;
      return true;
    });
    if (filters.eligibleOnly && hasProfile) rows = rows.filter((r) => r.eligibility?.eligible);
    const sort = filters.sort ?? (hasProfile ? "match" : "newest");
    rows.sort((a, b) =>
      sort === "match" ? (b.match?.percent ?? 0) - (a.match?.percent ?? 0)
      : sort === "salary" ? toINR(b.job.salaryMax, b.job.currency) - toINR(a.job.salaryMax, a.job.currency)
      : new Date(b.job.postedAt).getTime() - new Date(a.job.postedAt).getTime(),
    );
    return rows;
  },

  async filterOptions() {
    const open = state().jobs.filter((j) => j.status === "Open");
    return { locations: Array.from(new Set(open.map((j) => j.location))).sort() };
  },

  async getJobDetail(jobId: string, applicantId?: string) {
    await latency(400);
    const s = state();
    const job = must(s.jobs.find((j) => j.id === jobId), "This job could not be found. It may have been removed.");
    const profile = s.applicants.find((a) => a.id === applicantId);
    const hasProfile = !!profile && profile.skills.length > 0;
    return {
      job, company: companyOf(job.companyId),
      match: hasProfile ? matchJob(profile!, job) : null,
      eligibility: hasProfile ? checkEligibility(profile!, job) : null,
      existingApplicationId: s.applications.find((a) => a.jobId === jobId && a.applicantId === applicantId && a.stage !== "Withdrawn")?.id ?? null,
    };
  },

  /* ----------------------------- recruiter ----------------------------- */
  async listRecruiterJobs(userId: string) {
    await latency(450);
    const s = state();
    const user = s.users.find((u) => u.id === userId);
    const mine = s.jobs.filter((j) => user?.companyIds?.includes(j.companyId));
    return mine
      .map((job) => {
        const apps = s.applications.filter((a) => a.jobId === job.id);
        const counts = {} as Record<Stage, number>;
        for (const a of apps) counts[a.stage] = (counts[a.stage] ?? 0) + 1;
        return { job, company: companyOf(job.companyId), total: apps.length, counts };
      })
      .sort((a, b) => new Date(b.job.postedAt).getTime() - new Date(a.job.postedAt).getTime());
  },

  async getRecruiterJob(jobId: string) {
    await latency(300);
    const job = must(state().jobs.find((j) => j.id === jobId), "This role could not be found.");
    return { job, company: companyOf(job.companyId) };
  },

  async listCompaniesFor(userId: string) {
    const user = state().users.find((u) => u.id === userId);
    return state().companies.filter((c) => user?.companyIds?.includes(c.id));
  },

  async saveJob(job: Job): Promise<Job> {
    await latency(600);
    const exists = state().jobs.some((j) => j.id === job.id);
    mutate((s) => ({ jobs: exists ? s.jobs.map((j) => (j.id === job.id ? job : j)) : [job, ...s.jobs] }));
    return job;
  },

  async setStatus(jobId: string, status: Job["status"]) {
    await latency(350);
    mutate((s) => ({ jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, status, postedAt: j.status === "Draft" && status === "Open" ? nowIso() : j.postedAt } : j)) }));
  },

  async duplicate(jobId: string): Promise<Job> {
    await latency(400);
    const src = must(state().jobs.find((j) => j.id === jobId), "Role not found.");
    const id = uid("j");
    const copy: Job = {
      ...src, id, title: `${src.title} (copy)`, status: "Draft", postedAt: nowIso(),
      criteria: src.criteria.map((c) => ({ ...c, id: uid("c") })),
      screeningQuestions: src.screeningQuestions.map((q) => ({ ...q, id: uid("q") })),
    };
    mutate((s) => ({ jobs: [copy, ...s.jobs] }));
    return copy;
  },

  async saveCriteria(jobId: string, criteria: Criterion[]) {
    await latency(400);
    mutate((s) => ({ jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, criteria } : j)) }));
  },

  async listTemplates(): Promise<CriteriaTemplate[]> {
    return state().templates;
  },

  async saveTemplate(name: string, criteria: Criterion[]) {
    await latency(300);
    const t: CriteriaTemplate = { id: uid("tpl"), name, criteria: criteria.map((c) => ({ ...c, id: uid("c") })) };
    mutate((s) => ({ templates: [...s.templates, t] }));
    return t;
  },
};

export const jobsService = dual(mock, realJobs);
