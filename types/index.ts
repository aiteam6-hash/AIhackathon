export type Role = "applicant" | "recruiter";
export type Currency = "INR" | "USD" | "GBP" | "EUR";
export type WorkMode = "Remote" | "Hybrid" | "Onsite";
export type EmploymentType = "Full-time" | "Part-time" | "Contract" | "Internship";
export type JobStatus = "Draft" | "Open" | "Paused" | "Filled" | "Closed";
export type Category = "Engineering" | "Design" | "Operations" | "Sales" | "Support" | "Finance";
export type Level = "Entry" | "Mid" | "Senior" | "Lead";
export type Degree = "None" | "Diploma" | "Bachelor's" | "Master's" | "PhD";

/** Pipeline stages. Withdrawn is applicant-initiated; Hired follows Offer. */
export type Stage =
  | "Applied"
  | "Screening"
  | "Shortlisted"
  | "Interview"
  | "Offer"
  | "Hired"
  | "Rejected"
  | "Withdrawn";

export interface Company {
  id: string;
  name: string;
  industry: string;
  size: string;
  city: string;
  website: string;
  about: string;
}

export interface Requirements {
  minExperience: number;
  requiredSkills: string[];
  degree: Degree;
  /** Cities the role can be based in; ignored for remote roles. */
  locations: string[];
  maxNoticeDays: number;
}

export interface ScreeningQuestion {
  id: string;
  text: string;
}

export type CriterionKind =
  | "experience"
  | "skills"
  | "education"
  | "stability"
  | "domain"
  | "communication"
  | "custom";

export interface Criterion {
  id: string;
  label: string;
  kind: CriterionKind;
  /** Raw weight; the UI normalises the set so the total is 100. */
  weight: number;
  description: string;
}

export interface CriteriaTemplate {
  id: string;
  name: string;
  criteria: Criterion[];
}

export interface Job {
  id: string;
  companyId: string;
  recruiterId: string;
  title: string;
  category: Category;
  department: string;
  location: string;
  workMode: WorkMode;
  employmentType: EmploymentType;
  level: Level;
  salaryMin: number;
  salaryMax: number;
  currency: Currency;
  description: string;
  responsibilities: string[];
  preferredSkills: string[];
  requirements: Requirements;
  screeningQuestions: ScreeningQuestion[];
  allowIneligible: boolean;
  status: JobStatus;
  postedAt: string;
  criteria: Criterion[];
  openings: number;
}

export interface WorkEntry {
  title: string;
  employer: string;
  startYear: number;
  endYear: number | null;
}

export interface Education {
  degree: Degree;
  field: string;
  institution: string;
}

export interface Applicant {
  id: string;
  name: string;
  email: string;
  headline: string;
  location: string;
  skills: string[];
  experienceYears: number;
  education: Education;
  work: WorkEntry[];
  summary: string;
  expectedSalary: number;
  salaryCurrency: Currency;
  noticeDays: number;
  openToRelocate: boolean;
  preferences: {
    categories: Category[];
    workModes: WorkMode[];
    minSalary: number;
  };
  notifyPrefs: { statusChanges: boolean; newMatches: boolean; weeklyDigest: boolean };
  resumeId: string | null;
}

export interface Resume {
  id: string;
  applicantId: string;
  fileName: string;
  uploadedAt: string;
  text: string;
}

export interface EligibilityCheck {
  key: "experience" | "skills" | "location" | "notice" | "degree";
  label: string;
  pass: boolean;
  detail: string;
}
export interface Eligibility {
  eligible: boolean;
  checks: EligibilityCheck[];
}

export interface CriterionScore {
  criterionId: string;
  label: string;
  weight: number;
  /** The AI's own score, kept even when overridden. */
  score: number;
  reasoning: string;
  override?: { score: number; comment: string; at: string; by: string };
}
export interface Score {
  criteria: CriterionScore[];
  final: number;
  ranAt: string;
  /** Snapshot of the criteria the scores were based on. */
  basedOn: { label: string; weight: number }[];
}

export interface Feedback {
  stage: Stage;
  message: string;
  reasons: string[];
  improvements: string[];
  generatedAt: string;
  /** True when a recruiter edited the AI draft before sending. */
  edited: boolean;
}

export interface Interview {
  date: string;
  time: string;
  mode: "Video" | "Phone" | "Onsite";
  link: string;
  panel: string[];
  status: "Scheduled" | "Accepted" | "Reschedule requested";
}

export interface StageEvent {
  stage: Stage;
  at: string;
  by: "applicant" | "recruiter" | "system";
  note?: string;
}
export interface OverrideRecord {
  at: string;
  type: "score" | "decision";
  target: string;
  from: string;
  to: string;
  comment: string;
}
export interface Note {
  id: string;
  at: string;
  text: string;
}

export interface Application {
  id: string;
  jobId: string;
  applicantId: string;
  stage: Stage;
  appliedAt: string;
  coverNote: string;
  answers: Record<string, string>;
  expectedSalary: number;
  noticeDays: number;
  eligibility: Eligibility;
  score?: Score;
  summary?: string;
  overrides: OverrideRecord[];
  history: StageEvent[];
  feedback?: Feedback;
  /** Stage the application was in when it was rejected. */
  rejectedAtStage?: Stage;
  interview?: Interview;
  notes: Note[];
  appliedAnyway?: boolean;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  at: string;
  read: boolean;
  href: string;
}

export interface User {
  id: string;
  role: Role;
  name: string;
  email: string;
  /** Applicant profile id, for applicants. */
  applicantId?: string;
  /** Companies a recruiter hires for. */
  companyIds?: string[];
}

export interface Session {
  userId: string;
  role: Role;
}

export interface JobMatch {
  jobId: string;
  percent: number;
  why: string[];
  missing: string[];
  oneLine: string;
  parts: { label: string; percent: number }[];
}

export type AiInterviewStatus = "draft" | "approved" | "in_progress" | "completed" | "cancelled";
export interface AiInterviewQuestion { id: string; text: string }
export interface AiInterviewAnswer {
  questionId: string;
  questionText: string;
  answer: string;
  inputMode: "voice" | "typed";
  durationSeconds?: number;
}
export interface AiInterviewSummary {
  overview: string;
  strengths: string[];
  concerns: string[];
  perAnswer: { question: string; note: string }[];
  recommendation: string;
  model: string;
  createdAt: string;
}
export interface AiInterview {
  id: string;
  applicationId: string;
  status: AiInterviewStatus;
  questions: AiInterviewQuestion[];
  approvedAt?: string;
  expiresAt?: string;
  startedAt?: string;
  completedAt?: string;
  answers: AiInterviewAnswer[];
  /** Only recruiters receive this; row-level security hides it from applicants. */
  summary?: AiInterviewSummary;
}
