import type { Applicant, Resume } from "@/types";
import { mutate } from "@/lib/store/store";
import { buildResumeText } from "@/lib/mock/seed";
import { readFileText } from "@/lib/ai/parse";
import { uid } from "@/lib/utils/format";
import { latency, must, nowIso, state } from "./util";
import { dual } from "./dispatch";
import { realResume } from "./real/resume";

const mock = {
  async getProfile(applicantId: string): Promise<{ applicant: Applicant; resume: Resume | null }> {
    await latency(350);
    const s = state();
    const applicant = must(s.applicants.find((a) => a.id === applicantId), "Profile not found.");
    return { applicant, resume: s.resumes.find((r) => r.id === applicant.resumeId) ?? null };
  },

  /** Stores the edited profile and, when a file was uploaded, the resume record that goes with it. */
  async saveProfile(applicant: Applicant, upload?: { fileName: string; text: string; usedText: boolean; file?: File }): Promise<Applicant> {
    await latency(600);
    let resumeId = applicant.resumeId;
    let resume: Resume | undefined;
    if (upload) {
      resumeId = uid("rs");
      resume = {
        id: resumeId, applicantId: applicant.id, fileName: upload.fileName, uploadedAt: nowIso(),
        // Readable text is kept as-is; for PDFs and DOCX the "extracted" text is rebuilt from the parsed fields.
        text: upload.usedText ? upload.text : buildResumeText(applicant),
      };
    }
    const next = { ...applicant, resumeId };
    mutate((s) => ({
      applicants: s.applicants.map((a) => (a.id === applicant.id ? next : a)),
      resumes: resume ? [...s.resumes.filter((r) => r.applicantId !== applicant.id), resume] : s.resumes,
      users: s.users.map((u) => (u.applicantId === applicant.id ? { ...u, name: applicant.name } : u)),
    }));
    return next;
  },

  /** Stores a different resume file without touching the profile fields. */
  async attachResume(applicantId: string, file: File): Promise<Resume> {
    await latency(600);
    const s = state();
    const applicant = must(s.applicants.find((a) => a.id === applicantId), "Profile not found.");
    const raw = await readFileText(file);
    const readable = (raw.match(/[A-Za-z]{3,}/g) ?? []).length > 25;
    const resume: Resume = { id: uid("rs"), applicantId, fileName: file.name, uploadedAt: nowIso(), text: readable ? raw : buildResumeText(applicant) };
    mutate((st) => ({
      resumes: [...st.resumes.filter((r) => r.applicantId !== applicantId), resume],
      applicants: st.applicants.map((a) => (a.id === applicantId ? { ...a, resumeId: resume.id } : a)),
    }));
    return resume;
  },

  async getResume(resumeId: string | null) {
    if (!resumeId) return null;
    return state().resumes.find((r) => r.id === resumeId) ?? null;
  },
};

export const resumeService = dual(mock, realResume);
