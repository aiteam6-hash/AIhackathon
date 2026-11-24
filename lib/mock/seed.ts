import type {
  Applicant, Application, Category, CriteriaTemplate, Notification, Resume, Stage, StageEvent, User, WorkEntry,
} from "@/types";
import {
  checkEligibility, generateRejectionFeedback, scoreApplication, summarizeApplication,
} from "@/lib/ai/engine";
import { CATEGORIES, CITIES, CURRENT_YEAR, SKILLS_BY_CATEGORY } from "@/lib/ai/shared";
import { COMPANIES, DEMO_RECRUITER_ID, seedJobs } from "./jobs";
import type { DataState } from "@/lib/store/store";
import { STORE_VERSION } from "@/lib/config";

/** Small seeded PRNG so the demo data is identical on every reset. */
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = [
  "Ananya Reddy", "Rohan Kulkarni", "Ishita Banerjee", "Vikram Chauhan", "Neha Gupta", "Arjun Nair", "Pooja Deshmukh",
  "Siddharth Rao", "Kavya Menon", "Rahul Verma", "Divya Krishnan", "Aditya Joshi", "Shreya Patel", "Manish Agarwal",
  "Tanvi Shah", "Harsh Vardhan", "Nikhil Bhatt", "Sneha Pillai", "Gaurav Malhotra", "Aishwarya Hegde", "Deepak Yadav",
  "Riya Kapoor", "Karan Singhania", "Lakshmi Narayanan", "Mohit Saxena", "Pallavi Jain", "Yash Thakur", "Zoya Khan",
  "Imran Sheikh", "Farhan Ali", "Anjali Mishra", "Sandeep Pawar", "Bhavna Rathod", "Tarun Bose", "Emily Carter",
  "Oliver Hughes", "Sofia Marino", "Lukas Brandt", "Marcus Webb", "Hannah Okonkwo", "Tomasz Nowak", "Grace Lim",
  "Wei Chen", "Priyanka Raman", "Abhishek Tiwari", "Meenal Kaul", "Rajat Sood", "Nandini Das", "Amit Choudhury",
  "Swati Bhardwaj", "Vivek Iyengar", "Charlotte Reed", "Jamal Henry", "Fatima Zahra", "Ravi Shankar", "Ekta Sinha",
  "Joseph Mathew", "Alisha D'Souza", "Kunal Mehra", "Rhea Fernandes",
];

const TITLES: Record<Category, string[]> = {
  Engineering: ["Software Engineer", "Backend Developer", "Frontend Developer", "Full Stack Developer", "Data Engineer", "DevOps Engineer"],
  Design: ["Product Designer", "UX Designer", "Visual Designer", "UX Researcher"],
  Operations: ["Operations Executive", "Logistics Coordinator", "Supply Chain Analyst", "Warehouse Supervisor"],
  Sales: ["Sales Executive", "Business Development Executive", "Account Manager", "Inside Sales Representative"],
  Support: ["Support Associate", "Customer Success Associate", "Technical Support Specialist", "Support Team Lead"],
  Finance: ["Accountant", "Financial Analyst", "Accounts Executive", "FP&A Analyst"],
};
const EMPLOYERS: Record<Category, string[]> = {
  Engineering: ["Infosys", "TCS", "Flipkart", "Zoho", "Freshworks", "Swiggy", "Postman", "Thoughtworks", "Capgemini", "Paytm", "Wipro", "Cleartax"],
  Design: ["Razorpay", "Tata Elxsi", "Myntra", "Cred", "Pixel Studio", "Fractal", "Zomato"],
  Operations: ["Delhivery", "Blue Dart", "Amazon", "Reliance Retail", "DHL Supply Chain", "Mahindra Logistics", "Tesco"],
  Sales: ["Zoho", "Salesforce", "Vodafone Idea", "Airtel Business", "Oracle", "HDFC Bank", "Orange Peel Media"],
  Support: ["Freshworks", "Amazon", "Concentrix", "Teleperformance", "Swiggy", "Practo", "Paytm"],
  Finance: ["Deloitte", "KPMG", "HDFC Bank", "Tata Capital", "Grant Thornton", "Mahindra Finance", "Barclays"],
};
const FIELDS: Record<Category, string[]> = {
  Engineering: ["Computer Science", "Information Technology", "Electronics Engineering", "Mathematics"],
  Design: ["Design", "Fine Arts", "Psychology", "Architecture"],
  Operations: ["Supply Chain Management", "Industrial Engineering", "Business Administration", "Commerce"],
  Sales: ["Business Administration", "Marketing", "Commerce", "Economics"],
  Support: ["Commerce", "English Literature", "Computer Applications", "Business Administration"],
  Finance: ["Commerce", "Accounting", "Economics", "Finance"],
};
const SCHOOLS = [
  "VIT Vellore", "PES University", "NIT Trichy", "Delhi University", "Mumbai University", "SRM Institute", "Christ University",
  "Symbiosis Pune", "Anna University", "IIT Guwahati", "BITS Pilani", "University of Leeds", "University of Warwick", "Osmania University",
];
const WINS: Record<Category, string[]> = {
  Engineering: ["Cut API p95 latency from 900 ms to 310 ms by adding a Redis cache.", "Moved a monolith's billing module into a separate service with zero downtime.", "Wrote the integration test suite that now catches about 30 regressions a quarter."],
  Design: ["Redesigned onboarding, lifting completion from 54 to 71 percent.", "Ran 18 usability sessions that changed the checkout flow.", "Built the first version of the team's component library."],
  Operations: ["Reduced mis-picks by 22 percent with a revised slotting plan.", "Brought inbound dock turnaround from 95 to 60 minutes.", "Negotiated freight rates with three vendors, saving ₹38 lakh a year."],
  Sales: ["Closed ₹1.4 crore in new business against a ₹1.1 crore quota.", "Built a prospect list of 600 accounts that produced 24 meetings.", "Improved demo-to-proposal conversion from 28 to 41 percent."],
  Support: ["Held a 94 percent satisfaction score across 60 tickets a day.", "Wrote 35 help articles that deflected about 15 percent of tickets.", "Cut first response time from 55 to 18 minutes."],
  Finance: ["Built the monthly forecast model that came within 3 percent of actuals.", "Closed month-end two days faster by automating bank reconciliations.", "Identified ₹52 lakh of duplicate vendor payments during an audit."],
};

const iso = (now: number, daysAgo: number, hour = 10) => {
  const d = new Date(now - daysAgo * 86400000);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

export function buildResumeText(a: Applicant): string {
  const cat = (CATEGORIES.find((c) => a.skills.some((s) => SKILLS_BY_CATEGORY[c].includes(s))) ?? "Engineering") as Category;
  const wins = WINS[cat];
  const lines = [
    a.name, `${a.headline} | ${a.location} | ${a.email}`, "", "SUMMARY", a.summary, "", "SKILLS", a.skills.join(", "), "", "EXPERIENCE",
  ];
  a.work.forEach((w, i) => {
    lines.push(`${w.title}, ${w.employer} (${w.startYear} - ${w.endYear ?? "Present"})`);
    lines.push(`- ${wins[i % wins.length]}`);
  });
  lines.push("", "EDUCATION", `${a.education.degree === "None" ? "Coursework" : a.education.degree} in ${a.education.field}, ${a.education.institution}`);
  return lines.join("\n");
}

export function createSeed(): DataState {
  const now = Date.now();
  const r = rng(2026);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const jobs = seedJobs(now);
  const companies = COMPANIES;
  const indianCities = CITIES.slice(0, 8);

  /* ---------- applicants ---------- */
  const catPlan: Category[] = [
    ...Array(21).fill("Engineering"), ...Array(9).fill("Design"), ...Array(10).fill("Operations"),
    ...Array(8).fill("Sales"), ...Array(7).fill("Support"), ...Array(8).fill("Finance"),
  ];
  const applicants: Applicant[] = [];
  const resumes: Resume[] = [];
  const pairs: { applicantId: string; jobId: string }[] = [];

  const jobsByCat = (c: Category) => jobs.filter((j) => j.category === c && j.status !== "Draft");

  NAMES.forEach((name, i) => {
    const cat = catPlan[i % catPlan.length];
    const pool = jobsByCat(cat);
    const primary = pool[i % pool.length];
    const secondary = r() < 0.45 ? pool[(i + 1) % pool.length] : null;
    const req = primary.requirements;
    const years = Math.max(0, req.minExperience + pick([-2, -1, 0, 0, 1, 1, 2, 3, 4, 6]));
    const cpool = SKILLS_BY_CATEGORY[cat];
    const skills = new Set<string>();
    if (r() < 0.72) req.requiredSkills.forEach((s) => skills.add(s));
    else req.requiredSkills.slice(0, Math.max(0, req.requiredSkills.length - 1)).forEach((s) => skills.add(s));
    primary.preferredSkills.forEach((s) => r() < 0.5 && skills.add(s));
    for (let k = 0; k < 2 + Math.floor(r() * 3); k++) skills.add(pick(cpool));
    if (secondary && r() < 0.8) secondary.requirements.requiredSkills.forEach((s) => skills.add(s));

    // work history, most recent first, built backwards from this year
    const n = years <= 1 ? 1 : years <= 3 ? 2 : years <= 7 ? 3 : 4;
    const entries: WorkEntry[] = [];
    let end: number | null = null;
    let remaining = Math.max(years, 1);
    for (let k = 0; k < n; k++) {
      const share = k === n - 1 ? remaining : Math.max(1, Math.round(remaining * (0.35 + r() * 0.3)));
      const endYear: number | null = end;
      const start: number = (endYear ?? CURRENT_YEAR) - share;
      entries.push({ title: pick(TITLES[cat]), employer: pick(EMPLOYERS[cat]), startYear: start, endYear });
      end = start;
      remaining = Math.max(1, remaining - share);
    }
    const degree = cat === "Support" || cat === "Sales" ? pick(["Bachelor's", "Bachelor's", "Diploma"] as const) : pick(["Bachelor's", "Bachelor's", "Master's", "PhD"] as const);
    const international = primary.currency !== "INR";
    const location = r() < 0.72 ? primary.location : international && r() < 0.5 ? pick(["London", "Toronto", "Berlin", "Dubai"]) : pick(indianCities);
    const mid = (primary.salaryMin + primary.salaryMax) / 2;
    const expected = Math.round((mid * (0.82 + r() * 0.5)) / (primary.currency === "INR" ? 50000 : 1000)) * (primary.currency === "INR" ? 50000 : 1000);
    const first = name.split(" ")[0];
    const headline = entries[0].title;
    const id = `ap_${String(i + 1).padStart(3, "0")}`;
    const a: Applicant = {
      id, name, email: `${first.toLowerCase()}.${name.split(" ").slice(-1)[0].toLowerCase().replace(/[^a-z]/g, "")}@example.com`,
      headline, location, skills: Array.from(skills), experienceYears: years,
      education: { degree, field: pick(FIELDS[cat]), institution: pick(SCHOOLS) },
      work: entries,
      summary: `${headline} with ${years} ${years === 1 ? "year" : "years"} in ${cat.toLowerCase()}. ${WINS[cat][i % 3]}`,
      expectedSalary: expected, salaryCurrency: primary.currency,
      noticeDays: pick([0, 15, 30, 30, 45, 60, 60, 90]), openToRelocate: r() < 0.35,
      preferences: { categories: [cat], workModes: ["Hybrid", "Remote"], minSalary: Math.round(expected * 0.9) },
      notifyPrefs: { statusChanges: true, newMatches: true, weeklyDigest: false },
      resumeId: `rs_${id}`,
    };
    applicants.push(a);
    resumes.push({ id: `rs_${id}`, applicantId: id, fileName: `${name.replace(/\s/g, "_")}_Resume.pdf`, uploadedAt: iso(now, 30 + (i % 20)), text: buildResumeText(a) });
    pairs.push({ applicantId: id, jobId: primary.id });
    if (secondary) pairs.push({ applicantId: id, jobId: secondary.id });
  });

  /* ---------- demo applicant ---------- */
  const demo: Applicant = {
    id: "ap_demo", name: "Aarav Mehta", email: "aarav.mehta@example.com", headline: "Frontend Engineer", location: "Bengaluru",
    skills: ["React", "TypeScript", "JavaScript", "Node.js", "REST APIs", "Testing", "SQL", "Next.js", "Python", "Docker"],
    experienceYears: 5,
    education: { degree: "Bachelor's", field: "Computer Science", institution: "PES University" },
    work: [
      { title: "Frontend Engineer", employer: "Freshworks", startYear: 2022, endYear: null },
      { title: "Software Engineer", employer: "Zoho", startYear: 2020, endYear: 2022 },
      { title: "Associate Engineer", employer: "Infosys", startYear: 2021 - 1, endYear: 2020 },
    ],
    summary: "Frontend engineer with five years building dashboards and design-system components. Cut a reporting page's load time from 6 seconds to 1.8 by virtualising long tables.",
    expectedSalary: 3000000, salaryCurrency: "INR", noticeDays: 30, openToRelocate: false,
    preferences: { categories: ["Engineering"], workModes: ["Hybrid", "Remote"], minSalary: 2600000 },
    notifyPrefs: { statusChanges: true, newMatches: true, weeklyDigest: false },
    resumeId: "rs_ap_demo",
  };
  demo.work[2] = { title: "Associate Engineer", employer: "Infosys", startYear: 2019, endYear: 2020 };
  applicants.push(demo);
  resumes.push({ id: "rs_ap_demo", applicantId: "ap_demo", fileName: "Aarav_Mehta_Resume.pdf", uploadedAt: iso(now, 40), text: buildResumeText(demo) });

  /* ---------- applications ---------- */
  const cycle: Stage[] = ["Applied", "Screening", "Shortlisted", "Applied", "Interview", "Rejected", "Screening", "Offer", "Applied", "Rejected", "Shortlisted", "Screening"];
  const counters: Record<string, number> = {};
  const applications: Application[] = [];
  const byId = (id: string) => applicants.find((x) => x.id === id)!;
  const company = (id: string) => companies.find((c) => c.id === id);

  const make = (applicantId: string, jobId: string, stage: Stage, daysOld: number, rejectedAt?: Stage): Application => {
    const a = byId(applicantId);
    const job = jobs.find((j) => j.id === jobId)!;
    const idx = applications.length;
    const cover = idx % 3 === 0 ? "" : `I have ${a.experienceYears} years in ${job.category.toLowerCase()} and your ${job.title} role matches what I have been doing at ${a.work[0]?.employer ?? "my last company"}. ${WINS[job.category][idx % 3]} I would like to bring that to ${company(job.companyId)?.name}.`;
    const mid = (job.salaryMin + job.salaryMax) / 2;
    const app: Application = {
      id: `app_${String(idx + 1).padStart(3, "0")}`, jobId, applicantId, stage: "Applied",
      appliedAt: iso(now, daysOld), coverNote: cover,
      answers: Object.fromEntries(job.screeningQuestions.map((q, k) => [q.id, k === 0 ? WINS[job.category][(idx + 1) % 3] : `In my last role at ${a.work[0]?.employer ?? "my previous company"} I handled this by documenting the steps and agreeing priorities with the team first.`])),
      expectedSalary: a.salaryCurrency === job.currency ? a.expectedSalary : Math.round(mid), noticeDays: a.noticeDays,
      eligibility: checkEligibility(a, job), overrides: [], notes: [],
      history: [{ stage: "Applied", at: iso(now, daysOld), by: "applicant" }],
    };
    const scoredStages: Stage[] = ["Screening", "Shortlisted", "Interview", "Offer", "Hired"];
    const reach = rejectedAt ?? stage;
    if (scoredStages.includes(reach)) app.score = scoreApplication({ application: app, applicant: a, resume: resumes.find((x) => x.id === a.resumeId), job, company: company(job.companyId) }, job.criteria);
    // history: walk the path to the stage
    const path: Stage[] = ["Applied", "Screening", "Shortlisted", "Interview", "Offer", "Hired"];
    const upTo = path.indexOf(reach === "Rejected" ? "Applied" : reach);
    for (let k = 1; k <= upTo; k++) {
      app.history.push({ stage: path[k], at: iso(now, Math.max(0, daysOld - k), 11), by: path[k] === "Screening" ? "system" : "recruiter" } as StageEvent);
    }
    app.stage = reach === "Rejected" ? "Rejected" : reach;
    if (stage === "Rejected") {
      app.stage = "Rejected";
      app.rejectedAtStage = rejectedAt ?? "Screening";
      app.feedback = generateRejectionFeedback({ application: app, applicant: a, job, company: company(job.companyId), stage: app.rejectedAtStage });
      app.history.push({ stage: "Rejected", at: iso(now, Math.max(0, daysOld - 4), 15), by: "recruiter", note: "Feedback sent to applicant." });
    }
    if (app.stage === "Interview") {
      const d = new Date(now + ((idx % 6) + 1) * 86400000);
      app.interview = { date: d.toISOString().slice(0, 10), time: idx % 2 ? "11:00" : "15:30", mode: idx % 3 === 0 ? "Onsite" : "Video", link: idx % 3 === 0 ? `${company(job.companyId)?.city} office, 3rd floor` : `https://meet.example.com/${job.id}-${idx}`, panel: ["Priya Nair (HR)", "Hiring manager"], status: idx % 4 === 0 ? "Accepted" : "Scheduled" };
    }
    if (app.score) app.summary = summarizeApplication({ application: app, applicant: a, job });
    return app;
  };

  for (const p of pairs) {
    const job = jobs.find((j) => j.id === p.jobId)!;
    const a = byId(p.applicantId);
    const k = (counters[job.id] = (counters[job.id] ?? -1) + 1);
    const elig = checkEligibility(a, job);
    const days = 2 + ((k * 3 + a.experienceYears) % 24);
    let stage: Stage = cycle[(k + job.title.length) % cycle.length];
    let rejectedAt: Stage | undefined;
    if (!elig.eligible && !job.allowIneligible) stage = k % 3 === 0 ? "Rejected" : "Applied";
    else if (stage === "Rejected") rejectedAt = (["Screening", "Shortlisted", "Interview"] as Stage[])[k % 3];
    if (job.status === "Closed" && stage !== "Rejected") stage = k % 2 ? "Rejected" : stage;
    if (stage === "Rejected" && !rejectedAt) rejectedAt = "Screening";
    if (job.status === "Filled" && stage === "Offer") stage = "Hired";
    applications.push(make(p.applicantId, p.jobId, stage, days, rejectedAt));
  }
  // The filled role has exactly one hire; anyone left at Offer there is rejected at that stage.
  for (const app of applications.filter((x) => x.jobId === "j_harbour_acct" && x.stage === "Offer")) app.stage = "Hired";

  // the demo applicant's own applications, one at each interesting stage
  applications.push(make("ap_demo", "j_kestrel_fe", "Interview", 12));
  applications.push(make("ap_demo", "j_kestrel_be", "Rejected", 20, "Shortlisted"));
  applications.push(make("ap_demo", "j_ledgerly_data", "Screening", 5));
  // ensure unique ids after pushes
  applications.forEach((x, i) => (x.id = `app_${String(i + 1).padStart(3, "0")}`));

  /* ---------- users, notifications, templates ---------- */
  const users: User[] = [
    { id: "u_app_demo", role: "applicant", name: demo.name, email: demo.email, applicantId: "ap_demo" },
    { id: DEMO_RECRUITER_ID, role: "recruiter", name: "Priya Nair", email: "priya.nair@shortlist.example", companyIds: companies.map((c) => c.id) },
    ...applicants.filter((a) => a.id !== "ap_demo").map((a): User => ({ id: `u_${a.id}`, role: "applicant", name: a.name, email: a.email, applicantId: a.id })),
  ];
  const demoApps = applications.filter((x) => x.applicantId === "ap_demo");
  const notifications: Notification[] = [
    { id: "n1", userId: "u_app_demo", title: "Interview scheduled", body: "Kestrel Labs would like to meet you for Senior Frontend Engineer.", at: iso(now, 1, 16), read: false, href: `/applications/${demoApps[0].id}` },
    { id: "n2", userId: "u_app_demo", title: "Update on Backend Engineer, Ingestion", body: "Your application was not taken forward. Read the feedback.", at: iso(now, 3, 12), read: false, href: `/applications/${demoApps[1].id}` },
    { id: "n3", userId: "u_app_demo", title: "Application moved to Screening", body: "Ledgerly is reviewing your application for Data Platform Engineer.", at: iso(now, 4, 9), read: true, href: `/applications/${demoApps[2].id}` },
    { id: "n4", userId: DEMO_RECRUITER_ID, title: "New applicants waiting", body: `${applications.filter((x) => x.stage === "Applied").length} applications are waiting for review across your roles.`, at: iso(now, 0, 8), read: false, href: "/recruiter/dashboard" },
  ];
  const t = (id: string, name: string, kinds: [string, "skills" | "experience" | "education" | "stability" | "domain" | "communication", number][]): CriteriaTemplate => ({
    id, name, criteria: kinds.map(([label, kind, weight], i) => ({ id: `${id}_${i}`, label, kind, weight, description: `${label} as evidenced on the resume.` })),
  });
  const templates: CriteriaTemplate[] = [
    t("tpl1", "Engineering, balanced", [["Skill match", "skills", 30], ["Relevant experience", "experience", 25], ["Domain background", "domain", 15], ["Stability", "stability", 10], ["Education", "education", 10], ["Cover note clarity", "communication", 10]]),
    t("tpl2", "Customer-facing roles", [["Communication from cover note", "communication", 35], ["Relevant experience", "experience", 25], ["Skill match", "skills", 20], ["Stability", "stability", 20]]),
    t("tpl3", "Entry level", [["Skill match", "skills", 40], ["Education", "education", 25], ["Communication from cover note", "communication", 25], ["Domain background", "domain", 10]]),
  ];

  return { version: STORE_VERSION, companies, jobs, applicants, resumes, applications, notifications, users, templates, session: null };
}
