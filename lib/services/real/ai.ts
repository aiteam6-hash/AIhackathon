import type { Criterion, Job } from "@/types";
import { aiCriteria, aiJobDraft, aiParseResume, aiScreeningQuestions, AiUnavailable } from "@/lib/ai/client";
import { extractProfile, readFileText, type ParsedProfile } from "@/lib/ai/parse";
import { sleep } from "../util";

/** Claude-backed versions of the AI calls that do not touch the database. */
export const realAiMore = {
  /** Reads a TXT file with Claude; PDF and DOCX still fall back to the built-in sample until server-side text extraction exists. */
  async parseResume(file: File, onProgress?: (pct: number, label: string) => void): Promise<ParsedProfile & { usedText: boolean; text: string }> {
    onProgress?.(10, "Reading file");
    const text = await readFileText(file);
    const base = extractProfile(file.name, text);
    if (!base.usedText) {
      await sleep(600);
      onProgress?.(100, "Done");
      return { ...base.profile, usedText: false, text };
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
