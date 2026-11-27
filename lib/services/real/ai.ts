import type { Criterion, Job } from "@/types";
import { aiCriteria, aiJobDraft, aiParseResume, aiScreeningQuestions, AiUnavailable } from "@/lib/ai/client";
import { extractProfile, readFileText, type ParsedProfile } from "@/lib/ai/parse";
import { sleep } from "../util";

/** Claude-backed versions of the AI calls that do not touch the database. */
export const realAiMore = {
  /** Reads TXT, PDF and DOCX files (text is extracted in the browser) and asks Claude to fill in the profile. */
  async parseResume(file: File, onProgress?: (pct: number, label: string) => void): Promise<ParsedProfile & { usedText: boolean; text: string; sample?: boolean }> {
    onProgress?.(10, "Reading file");
    const text = await readFileText(file);
    const base = extractProfile(file.name, text);
    if (!base.usedText) {
      // Nothing readable (for example a scan or a photo). Never invent a profile: hand back an empty one to fill in.
      await sleep(400);
      onProgress?.(100, "Done");
      return {
        name: "", email: "", headline: "", location: "", skills: [], experienceYears: 0,
        education: { degree: "None", field: "", institution: "" }, work: [], summary: "", usedText: false, text: "", sample: false,
      };
    }
    onProgress?.(35, "Reading your resume with Claude");
    try {
      const ai = await aiParseResume(text);
      onProgress?.(100, "Done");
      return { ...base.profile, ...ai, work: ai.work.length ? ai.work : base.profile.work, skills: ai.skills.length ? ai.skills : base.profile.skills, usedText: true, text };
    } catch (e) {
      if (!(e instanceof AiUnavailable)) throw e;
      onProgress?.(100, "Done");
      return { ...base.profile, usedText: true, text }; // keyword matching, as before
    }
  },

  async suggestCriteria(job: Job): Promise<Criterion[]> {
    return aiCriteria(job);
  },

  async generateScreeningQuestions(input: Parameters<typeof aiScreeningQuestions>[0]) {
    return aiScreeningQuestions(input);
  },

  async generateJobDescription(input: Parameters<typeof aiJobDraft>[0]) {
    return aiJobDraft(input);
  },
};
