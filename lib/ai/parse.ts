import type { Applicant, Degree } from "@/types";
import { ALL_SKILLS, CITIES, DEGREES } from "./shared";
import { extractResumeText } from "./extract";

export type ParsedProfile = Pick<
  Applicant,
  "name" | "email" | "headline" | "location" | "skills" | "experienceYears" | "education" | "work" | "summary"
>;

/** Believable fallback profiles for files whose text can't be read (most PDFs and DOCX in a browser-only demo). */
const MOCK_PROFILES: ParsedProfile[] = [
  {
    name: "Karthik Subramanian", email: "karthik.s@example.com", headline: "Full-stack developer",
    location: "Bengaluru", skills: ["React", "TypeScript", "Node.js", "PostgreSQL", "Docker", "REST APIs", "Testing"],
    experienceYears: 4, education: { degree: "Bachelor's", field: "Computer Science", institution: "PES University" },
    work: [
      { title: "Software Engineer", employer: "Zeta Payments", startYear: 2022, endYear: null },
      { title: "Associate Engineer", employer: "Infosys", startYear: 2020, endYear: 2022 },
    ],
    summary: "Full-stack developer with four years building payment and onboarding flows. Comfortable owning a feature from schema to UI.",
  },
  {
    name: "Meera Iyer", email: "meera.iyer@example.com", headline: "Product designer",
    location: "Pune", skills: ["Figma", "User Research", "Prototyping", "Design Systems", "Accessibility"],
    experienceYears: 5, education: { degree: "Bachelor's", field: "Design", institution: "MIT Institute of Design" },
    work: [
      { title: "Product Designer", employer: "Razorpay", startYear: 2021, endYear: null },
      { title: "UX Designer", employer: "Tata Elxsi", startYear: 2019, endYear: 2021 },
    ],
    summary: "Product designer with five years across fintech and automotive interfaces. Runs research sessions and maintains a component library.",
  },
  {
    name: "Daniel Okafor", email: "daniel.okafor@example.com", headline: "Operations analyst",
    location: "London", skills: ["Supply Chain", "Excel", "SQL", "Forecasting", "Vendor Management", "Process Improvement"],
    experienceYears: 6, education: { degree: "Master's", field: "Supply Chain Management", institution: "University of Warwick" },
    work: [
      { title: "Operations Analyst", employer: "DHL Supply Chain", startYear: 2020, endYear: null },
      { title: "Logistics Coordinator", employer: "Tesco", startYear: 2018, endYear: 2020 },
    ],
    summary: "Operations analyst who cut warehouse picking errors by 18 percent with a revised slotting plan. Strong in Excel and SQL reporting.",
  },
  {
    name: "Sana Qureshi", email: "sana.q@example.com", headline: "Customer support specialist",
    location: "Hyderabad", skills: ["Customer Support", "Zendesk", "Ticket Triage", "Communication", "Escalation Handling"],
    experienceYears: 3, education: { degree: "Bachelor's", field: "Commerce", institution: "Osmania University" },
    work: [
      { title: "Support Specialist", employer: "Freshworks", startYear: 2022, endYear: null },
      { title: "Support Associate", employer: "Amazon", startYear: 2021, endYear: 2022 },
    ],
    summary: "Support specialist handling about 60 tickets a day with a 94 percent satisfaction score. Writes help-centre articles for recurring issues.",
  },
];

export const hashString = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

/** True when the decoded text looks like real prose rather than binary noise. */
function readable(text: string) {
  const words = text.match(/[A-Za-z]{3,}/g) ?? [];
  const printable = text.replace(/[^\x20-\x7E\n]/g, "").length;
  return words.length >= 25 && printable / Math.max(text.length, 1) > 0.9;
}

export async function readFileText(file: File): Promise<string> {
  try {
    return await extractResumeText(file);
  } catch {
    return "";
  }
}

/**
 * Keyword matching over the file's text. Anything that can't be found falls back to
 * the mock profile picked by hashing the file name, so the same file always parses the same way.
 */
export function extractProfile(fileName: string, text: string): { profile: ParsedProfile; usedText: boolean } {
  const fallback = MOCK_PROFILES[hashString(fileName) % MOCK_PROFILES.length];
  if (!readable(text)) return { profile: fallback, usedText: false };

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const lower = text.toLowerCase();

  const nameLine = lines.find((l) => /^[A-Z][a-z]+(\s[A-Z][a-z.]+){1,3}$/.test(l));
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? fallback.email;
  const skills = ALL_SKILLS.filter((s) => lower.includes(s.toLowerCase()));
  const years = text.match(/(\d{1,2})\+?\s*(?:years|yrs)/i);
  const location = CITIES.find((c) => lower.includes(c.toLowerCase())) ?? fallback.location;

  let degree: Degree = "None";
  if (/ph\.?d|doctorate/i.test(text)) degree = "PhD";
  else if (/master|m\.tech|m\.sc|mba|m\.s\b/i.test(text)) degree = "Master's";
  else if (/bachelor|b\.tech|b\.e\b|b\.sc|b\.com|bca/i.test(text)) degree = "Bachelor's";
  else if (/diploma/i.test(text)) degree = "Diploma";

  const summaryLine = lines.find((l) => l.split(" ").length > 12);
  return {
    usedText: true,
    profile: {
      name: nameLine ?? fallback.name,
      email,
      headline: lines.find((l) => /engineer|designer|analyst|manager|specialist|developer|executive|accountant/i.test(l) && l.split(" ").length < 8) ?? fallback.headline,
      location,
      skills: skills.length ? skills : fallback.skills,
      experienceYears: years ? Number(years[1]) : fallback.experienceYears,
      education: degree === "None" ? fallback.education : { degree, field: fallback.education.field, institution: fallback.education.institution },
      work: fallback.work,
      summary: summaryLine ?? fallback.summary,
    },
  };
}

export const ACCEPTED_TYPES = [".pdf", ".docx", ".txt"];
export const DEGREE_OPTIONS = DEGREES;
