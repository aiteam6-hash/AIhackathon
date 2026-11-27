/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Applicant, Category, Resume, WorkMode } from "@/types";
import { supabaseBrowser } from "@/lib/supabase/client";
import { buildResumeText } from "@/lib/mock/seed";
import { readFileText } from "@/lib/ai/parse";
import { bump, ServiceError } from "../util";
import { categoryDb, categoryUi, currencyUi, degreeDb, degreeUi, modeDb, modeUi } from "./mappers";

const sb = () => supabaseBrowser();
const fail = (e: { message: string } | null) => { if (e) throw new ServiceError(e.message); };

export function toResume(r: any, applicant?: Applicant): Resume {
  return {
    id: r.id, applicantId: r.applicant_id, fileName: r.file_name, uploadedAt: r.uploaded_at,
    // PDFs and DOCX cannot be read in the browser, so their text is rebuilt from the profile fields
    text: r.extracted_text ?? (applicant ? buildResumeText(applicant) : ""),
  };
}

export function toApplicant(p: any, prof: any, work: any[], skills: any[]): Applicant {
  return {
    id: p.user_id, name: prof?.full_name ?? "", email: prof?.email ?? "", headline: p.headline, location: p.location,
    skills: skills.map((s) => s.skills?.name).filter(Boolean),
    experienceYears: Number(p.experience_years),
    education: { degree: degreeUi(p.education_degree), field: p.education_field, institution: p.education_institution },
    work: work.map((w) => ({ title: w.title, employer: w.employer, startYear: w.start_year, endYear: w.end_year })),
    summary: p.summary, expectedSalary: Number(p.expected_salary), salaryCurrency: currencyUi(p.salary_currency),
    noticeDays: p.notice_days, openToRelocate: p.open_to_relocate,
    preferences: {
      categories: (p.pref_categories ?? []).map((c: string) => categoryUi(c)) as Category[],
      workModes: (p.pref_work_modes ?? []).map((m: string) => modeUi(m)) as WorkMode[],
      minSalary: Number(p.pref_min_salary),
    },
    notifyPrefs: p.notify_prefs, resumeId: p.current_resume_id,
  };
}

/** Finds skill ids by name (case-insensitive) and creates any that are new. */
export async function skillIds(names: string[]): Promise<string[]> {
  const { data, error } = await sb().from("skills").select("id,name");
  fail(error);
  const byLower = new Map<string, string>((data ?? []).map((s: any) => [s.name.toLowerCase(), s.id]));
  const missing = Array.from(new Set(names.filter((n) => !byLower.has(n.toLowerCase()))));
  if (missing.length) {
    const ins = await sb().from("skills").insert(missing.map((name) => ({ name }))).select("id,name");
    fail(ins.error);
    (ins.data ?? []).forEach((s: any) => byLower.set(s.name.toLowerCase(), s.id));
  }
  return Array.from(new Set(names.map((n) => byLower.get(n.toLowerCase())!).filter(Boolean)));
}

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
};

/** Stores the file in the private bucket under the user's own folder, then records it. */
async function storeResume(applicantId: string, file: File, text: string | null): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = file.type || MIME[ext];
  const path = `${applicantId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
  const up = await sb().storage.from("resumes").upload(path, file, { contentType: mime });
  fail(up.error);
  const { data, error } = await sb().from("resumes").insert({
    applicant_id: applicantId, file_name: file.name, storage_path: path, mime_type: mime,
    size_bytes: file.size, extracted_text: text, parse_status: text ? "parsed" : "manual",
  }).select("id").single();
  fail(error);
  const id = (data as any).id as string;
  fail((await sb().from("applicant_profiles").update({ current_resume_id: id }).eq("user_id", applicantId)).error);
  return id;
}

async function readableText(file: File): Promise<string | null> {
  const t = await readFileText(file);
  return (t.match(/[A-Za-z]{3,}/g) ?? []).length > 25 ? t : null;
}

export const realResume = {
  async getProfile(applicantId: string) {
    const [p, prof, work, skills] = await Promise.all([
      sb().from("applicant_profiles").select("*").eq("user_id", applicantId).maybeSingle(),
      sb().from("profiles").select("full_name,email").eq("id", applicantId).maybeSingle(),
      sb().from("work_experiences").select("*").eq("applicant_id", applicantId).order("position"),
      sb().from("applicant_skills").select("skills(name)").eq("applicant_id", applicantId),
    ]);
    fail(p.error); fail(work.error); fail(skills.error);
    if (!p.data) throw new ServiceError("Profile not found.");
    const applicant = toApplicant(p.data, prof.data, work.data ?? [], (skills.data as any[]) ?? []);
    let resume: Resume | null = null;
    if (applicant.resumeId) {
      const r = await sb().from("resumes").select("*").eq("id", applicant.resumeId).maybeSingle();
      if (r.data) resume = toResume(r.data, applicant);
    }
    return { applicant, resume };
  },

  async saveProfile(applicant: Applicant, upload?: { fileName: string; text: string; usedText: boolean; file?: File }): Promise<Applicant> {
    const id = applicant.id;
    fail((await sb().from("applicant_profiles").update({
      headline: applicant.headline, location: applicant.location, experience_years: applicant.experienceYears,
      summary: applicant.summary, education_degree: degreeDb(applicant.education.degree),
      education_field: applicant.education.field, education_institution: applicant.education.institution,
      expected_salary: applicant.expectedSalary, salary_currency: applicant.salaryCurrency,
      notice_days: applicant.noticeDays, open_to_relocate: applicant.openToRelocate,
      pref_categories: applicant.preferences.categories.map(categoryDb),
      pref_work_modes: applicant.preferences.workModes.map(modeDb),
      pref_min_salary: applicant.preferences.minSalary, notify_prefs: applicant.notifyPrefs,
    }).eq("user_id", id)).error);
    fail((await sb().from("profiles").update({ full_name: applicant.name }).eq("id", id)).error);

    // skills and work history are replaced as a set
    const ids = await skillIds(applicant.skills);
    fail((await sb().from("applicant_skills").delete().eq("applicant_id", id)).error);
    if (ids.length) fail((await sb().from("applicant_skills").insert(ids.map((skill_id) => ({ applicant_id: id, skill_id })))).error);

    fail((await sb().from("work_experiences").delete().eq("applicant_id", id)).error);
    if (applicant.work.length) {
      fail((await sb().from("work_experiences").insert(applicant.work.map((w, position) => ({
        applicant_id: id, title: w.title, employer: w.employer, start_year: w.startYear, end_year: w.endYear, position,
      })))).error);
    }

    if (upload?.file) await storeResume(id, upload.file, upload.usedText ? upload.text : null);
    bump();
    return (await realResume.getProfile(id)).applicant;
  },

  /** Stores a different resume file without touching the profile fields. */
  async attachResume(applicantId: string, file: File): Promise<Resume> {
    const rid = await storeResume(applicantId, file, await readableText(file));
    const { data, error } = await sb().from("resumes").select("*").eq("id", rid).single();
    fail(error);
    bump();
    return toResume(data);
  },

  async getResume(resumeId: string | null) {
    if (!resumeId) return null;
    const { data } = await sb().from("resumes").select("*").eq("id", resumeId).maybeSingle();
    return data ? toResume(data) : null;
  },
};
