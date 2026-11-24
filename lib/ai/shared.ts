import type { Category, Currency, Degree, Level, Stage } from "@/types";

export const CATEGORIES: Category[] = ["Engineering", "Design", "Operations", "Sales", "Support", "Finance"];
export const DEGREES: Degree[] = ["None", "Diploma", "Bachelor's", "Master's", "PhD"];
export const CURRENCIES: Currency[] = ["INR", "USD", "GBP", "EUR"];

export const SKILLS_BY_CATEGORY: Record<Category, string[]> = {
  Engineering: [
    "React", "TypeScript", "JavaScript", "Node.js", "Python", "Django", "Java", "Spring Boot", "Go",
    "PostgreSQL", "MySQL", "MongoDB", "Redis", "AWS", "Docker", "Kubernetes", "Terraform", "GraphQL",
    "REST APIs", "CI/CD", "Next.js", "SQL", "Kafka", "System Design", "Testing",
  ],
  Design: [
    "Figma", "User Research", "Prototyping", "Design Systems", "Accessibility", "Interaction Design",
    "Visual Design", "Usability Testing", "Illustration", "Motion Design", "Information Architecture",
  ],
  Operations: [
    "Supply Chain", "Inventory Management", "Logistics", "Vendor Management", "Process Improvement",
    "Lean Six Sigma", "Excel", "SQL", "ERP", "Procurement", "Forecasting", "Warehouse Operations",
  ],
  Sales: [
    "B2B Sales", "Lead Generation", "CRM", "Salesforce", "Negotiation", "Account Management",
    "Cold Outreach", "Pipeline Management", "SaaS Sales", "Forecasting",
  ],
  Support: [
    "Customer Support", "Zendesk", "Troubleshooting", "Ticket Triage", "Communication",
    "Escalation Handling", "Knowledge Base", "SQL", "Live Chat",
  ],
  Finance: [
    "Financial Modelling", "Excel", "Accounting", "Tally", "GST", "Budgeting", "FP&A", "Auditing",
    "Forecasting", "Reconciliation", "SQL", "Power BI",
  ],
};
export const ALL_SKILLS = Array.from(new Set(Object.values(SKILLS_BY_CATEGORY).flat())).sort();

export const CITIES = [
  "Bengaluru", "Mumbai", "Gurugram", "Pune", "Hyderabad", "Chennai", "Kolkata", "Ahmedabad",
  "London", "Singapore", "Dubai", "Toronto", "Berlin",
];

export const norm = (s: string) => s.trim().toLowerCase();
export const hasSkill = (skills: string[], skill: string) => skills.some((s) => norm(s) === norm(skill));

const RATES: Record<Currency, number> = { INR: 1, USD: 84, GBP: 106, EUR: 91 };
export const toINR = (amount: number, currency: Currency) => amount * RATES[currency];

export const degreeRank = (d: Degree) => DEGREES.indexOf(d);

/** Typical experience band for each seniority level, in years. */
export function experienceRange(level: Level): [number, number] {
  return { Entry: [0, 2], Mid: [2, 5], Senior: [5, 10], Lead: [8, 25] }[level] as [number, number];
}

/** The order of the visible pipeline, left to right. */
export const PIPELINE: Stage[] = ["Applied", "Screening", "Shortlisted", "Interview", "Offer", "Hired", "Rejected"];
export const TIMELINE: Stage[] = ["Applied", "Screening", "Shortlisted", "Interview", "Offer"];
export const stageIndex = (s: Stage) => TIMELINE.indexOf(s === "Hired" ? "Offer" : s);

export const CURRENT_YEAR = 2026;
