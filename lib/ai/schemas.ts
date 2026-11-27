import { z } from "zod";

/** Shapes Claude must return. Shared by the server route and the browser wrappers. */
export const CRITERION_KINDS = ["skills", "experience", "education", "stability", "domain", "communication", "custom"] as const;

export const jobDraftOut = z.object({
  description: z.string(),
  responsibilities: z.array(z.string()),
  requiredSkills: z.array(z.string()),
  preferredSkills: z.array(z.string()),
  screeningQuestions: z.array(z.string()),
});
export type JobDraft = z.infer<typeof jobDraftOut>;

export const criteriaOut = z.object({
  criteria: z.array(z.object({ label: z.string(), kind: z.enum(CRITERION_KINDS), weight: z.number(), description: z.string() })),
});

export const scoreOut = z.object({
  criteria: z.array(z.object({ label: z.string(), score: z.number(), reasoning: z.string() })),
});

export const summaryOut = z.object({
  strengths: z.string(),
  concerns: z.string(),
  availability: z.string(),
  nextStep: z.string(),
});

export const feedbackOut = z.object({
  message: z.string(),
  reasons: z.array(z.string()),
  improvements: z.array(z.string()),
});

export const resumeOut = z.object({
  headline: z.string(),
  location: z.string(),
  experienceYears: z.number(),
  skills: z.array(z.string()),
  degree: z.enum(["none", "diploma", "bachelors", "masters", "phd"]),
  field: z.string(),
  institution: z.string(),
  work: z.array(z.object({ title: z.string(), employer: z.string(), startYear: z.number(), endYear: z.number().nullable() })),
  summary: z.string(),
});

export const interviewQuestionsOut = z.object({ questions: z.array(z.string()) });

export const interviewSummaryOut = z.object({
  overview: z.string(),
  strengths: z.array(z.string()),
  concerns: z.array(z.string()),
  perAnswer: z.array(z.object({ question: z.string(), note: z.string() })),
  recommendation: z.string(),
});

export const screeningQuestionsOut = z.object({ questions: z.array(z.string()) });

export const AI_TASKS = ["job_description", "criteria", "score", "summary", "feedback", "parse_resume", "interview_questions", "interview_summary", "screening_questions"] as const;
export type AiTask = (typeof AI_TASKS)[number];
