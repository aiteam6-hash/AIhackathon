import type { Category, Company, Job, ScreeningQuestion } from "@/types";
import { suggestCriteria } from "@/lib/ai/engine";

export const DEMO_RECRUITER_ID = "u_rec_demo";

export const COMPANIES: Company[] = [
  { id: "c_kestrel", name: "Kestrel Labs", industry: "Developer tools", size: "150 people", city: "Bengaluru", website: "kestrellabs.example", about: "Kestrel builds the observability dashboard that about 3,000 engineering teams use to trace slow requests. Small product teams, weekly releases, and an on-call rota shared by everyone who ships." },
  { id: "c_ledgerly", name: "Ledgerly", industry: "Fintech", size: "600 people", city: "Pune", website: "ledgerly.example", about: "Ledgerly runs invoicing, payouts and reconciliation for small businesses across India. About 40,000 merchants settle through it every month." },
  { id: "c_meridian", name: "Meridian Cloud", industry: "Cloud infrastructure", size: "900 people", city: "Singapore", website: "meridiancloud.example", about: "Meridian operates managed Kubernetes and storage for banks and telecoms in South and Southeast Asia, with data centres in Mumbai, Singapore and Jakarta." },
  { id: "c_northwind", name: "Northwind Logistics", industry: "Logistics and supply chain", size: "2,000 people", city: "Mumbai", website: "northwindlogistics.example", about: "Northwind moves around 90,000 parcels a day through 14 fulfilment centres. Operations roles here are hands-on and measured weekly on dispatch accuracy." },
  { id: "c_harbour", name: "Harbour & Finch", industry: "Retail and e-commerce", size: "3,000 people", city: "London", website: "harbourfinch.example", about: "Harbour & Finch sells homeware online and through 60 UK stores. The finance and sales teams sit in the London head office near Borough Market." },
  { id: "c_oakline", name: "Oakline Health", industry: "Healthtech", size: "400 people", city: "Hyderabad", website: "oaklinehealth.example", about: "Oakline provides the booking and records platform used by 1,200 clinics. Teams work closely with doctors and front-desk staff to keep the product simple." },
];

const SCREENING: Record<Category, string[]> = {
  Engineering: ["Describe a production incident you helped resolve and what you changed afterwards.", "Which project are you proudest of, and what was your part in it?"],
  Design: ["Link or describe a project where research changed your design. What changed?", "How do you handle feedback from engineers who say a design is too costly to build?"],
  Operations: ["Describe a process you improved. Which metric moved, and by how much?", "How do you handle a dispatch backlog on a day with two supervisors absent?"],
  Sales: ["What was your quota last year and what did you achieve against it?", "Describe a deal you lost and what you would do differently."],
  Support: ["How do you handle a customer who has written in three times about the same issue?", "What was your average ticket volume per day in your last role?"],
  Finance: ["Describe a model or report you built that changed a decision.", "How do you approach a month-end reconciliation that does not tie out?"],
};
const questions = (jobId: string, cat: Category): ScreeningQuestion[] =>
  SCREENING[cat].map((text, i) => ({ id: `${jobId}_q${i + 1}`, text }));

type Row = [
  id: string, company: string, title: string, cat: Category, dept: string, loc: string,
  mode: Job["workMode"], type: Job["employmentType"], level: Job["level"], min: number, max: number,
  cur: Job["currency"], minExp: number, req: string[], pref: string[], degree: Job["requirements"]["degree"],
  notice: number, status: Job["status"], daysPosted: number, openings: number, allowInelig: boolean,
  desc: string, resp: string[],
];

const ROWS: Row[] = [
  ["j_kestrel_fe", "c_kestrel", "Senior Frontend Engineer", "Engineering", "Product Engineering", "Bengaluru", "Hybrid", "Full-time", "Senior", 2800000, 4200000, "INR", 5, ["React", "TypeScript"], ["Next.js", "Testing", "GraphQL", "CI/CD"], "Bachelor's", 60, "Open", 9, 2, false,
    "Own the trace explorer, the screen where engineers spend most of their day in Kestrel. You will rebuild the flame graph for traces with 50,000 spans and keep it responsive.",
    ["Ship the new trace explorer in React and TypeScript, working with two designers and a backend pair.", "Set performance budgets for the dashboard and fix regressions before release.", "Mentor two mid-level engineers through code review."]],
  ["j_kestrel_be", "c_kestrel", "Backend Engineer, Ingestion", "Engineering", "Platform", "Bengaluru", "Remote", "Full-time", "Mid", 1800000, 3000000, "INR", 3, ["Node.js", "SQL"], ["PostgreSQL", "Redis", "Docker", "AWS"], "Bachelor's", 60, "Open", 14, 1, false,
    "The ingestion service accepts about 2 billion events a day. You will make it cheaper to run and easier to debug when a customer's data goes missing.",
    ["Maintain and extend the Node.js ingestion pipeline and its Postgres storage.", "Cut per-event processing cost by tuning batching and queue depth.", "Join the weekly on-call rotation and write post-incident reviews."]],
  ["j_ledgerly_data", "c_ledgerly", "Data Platform Engineer", "Engineering", "Data", "Pune", "Hybrid", "Full-time", "Senior", 2400000, 3800000, "INR", 4, ["Python", "SQL"], ["Kafka", "AWS", "Docker", "Terraform"], "Bachelor's", 60, "Open", 6, 1, true,
    "Settlement reports for 40,000 merchants are built on the data platform you will own. The current nightly batch takes six hours; the target is under one.",
    ["Move nightly settlement jobs to incremental pipelines on Kafka and Python.", "Define data quality checks that catch mismatches before merchants see them.", "Document table ownership so analysts know whom to ask."]],
  ["j_meridian_sre", "c_meridian", "Site Reliability Engineer", "Engineering", "Infrastructure", "Singapore", "Onsite", "Full-time", "Senior", 70000, 95000, "USD", 4, ["Kubernetes", "AWS"], ["Terraform", "Go", "CI/CD", "Docker"], "Bachelor's", 45, "Open", 21, 2, false,
    "Meridian's managed Kubernetes clusters host banking workloads with a 99.95 percent uptime commitment. You will be the person who keeps that number true.",
    ["Run and improve the cluster upgrade process across three regions.", "Write Terraform modules the product teams use to launch new clusters.", "Lead incident response during your on-call weeks and publish reviews within five days."]],
  ["j_kestrel_design", "c_kestrel", "Product Designer", "Design", "Design", "Bengaluru", "Hybrid", "Full-time", "Mid", 1600000, 2600000, "INR", 3, ["Figma", "Prototyping"], ["Design Systems", "User Research", "Accessibility"], "Bachelor's", 60, "Open", 11, 1, true,
    "Design the alerting experience, from the first rule a new user writes to the 3 a.m. notification on a phone. You will work with an engineer and a researcher on one squad.",
    ["Design alert creation and triage flows, from sketch to prototype to shipped.", "Contribute components to the shared design system.", "Run five or six usability sessions a quarter with customers."]],
  ["j_oakline_ux", "c_oakline", "UX Researcher", "Design", "Design", "Hyderabad", "Hybrid", "Full-time", "Mid", 1200000, 2000000, "INR", 2, ["User Research", "Usability Testing"], ["Information Architecture", "Figma"], "Bachelor's", 45, "Paused", 30, 1, true,
    "Front-desk staff at 1,200 clinics use Oakline all day. You will spend time in clinics, watching how bookings actually happen, and bring that back to the product team.",
    ["Plan and run field visits to clinics in Hyderabad and Vijayawada.", "Synthesise findings into a short report the product team reads within a week.", "Maintain the participant panel and consent records."]],
  ["j_northwind_ops", "c_northwind", "Operations Manager, Fulfilment", "Operations", "Fulfilment", "Mumbai", "Onsite", "Full-time", "Senior", 2000000, 3200000, "INR", 6, ["Logistics", "Warehouse Operations"], ["Process Improvement", "Lean Six Sigma", "ERP"], "Bachelor's", 60, "Open", 8, 1, false,
    "Run the Bhiwandi fulfilment centre, which dispatches about 12,000 parcels a day across three shifts. Dispatch accuracy is currently 98.1 percent and the goal is 99.5.",
    ["Lead 4 shift supervisors and about 180 associates.", "Own the weekly dispatch accuracy and cost per parcel reports.", "Run root-cause reviews for every mis-shipment and track fixes to completion."]],
  ["j_northwind_supply", "c_northwind", "Supply Chain Planner", "Operations", "Planning", "Pune", "Hybrid", "Full-time", "Mid", 800000, 1400000, "INR", 2, ["Supply Chain", "Excel"], ["Forecasting", "SQL", "Procurement"], "Bachelor's", 45, "Closed", 45, 1, true,
    "Plan inbound stock for 14 centres so shelves are filled without tying up cash. The planning team meets each Monday to agree the week's purchase orders.",
    ["Build weekly demand forecasts in Excel and SQL for 600 fast-moving SKUs.", "Agree purchase orders with vendors and track delivery against promise.", "Flag stock-out risks to centre managers two weeks ahead."]],
  ["j_meridian_sales", "c_meridian", "Account Executive, Enterprise", "Sales", "Sales", "Gurugram", "Hybrid", "Full-time", "Senior", 2200000, 3600000, "INR", 4, ["B2B Sales", "Negotiation"], ["Salesforce", "SaaS Sales", "Pipeline Management"], "Bachelor's", 60, "Open", 12, 2, false,
    "Sell managed Kubernetes to banks and insurers in North India. Deals take 6 to 9 months and involve security, procurement and a CTO. Variable pay is about 40 percent of the total.",
    ["Own a quota of ₹6 crore in annual recurring revenue.", "Run multi-threaded deals with security reviewers and procurement.", "Keep forecasts in Salesforce accurate within 10 percent."]],
  ["j_harbour_sdr", "c_harbour", "Sales Development Representative", "Sales", "Wholesale", "London", "Hybrid", "Full-time", "Entry", 28000, 34000, "GBP", 1, ["Lead Generation", "Cold Outreach"], ["CRM", "Pipeline Management"], "Bachelor's", 30, "Open", 5, 3, true,
    "Open doors for the wholesale team with independent retailers and hotels. You will make 40 outbound contacts a day and book meetings for two senior account managers.",
    ["Research and contact 40 prospects a day by phone and email.", "Book at least 12 qualified meetings a month.", "Log every conversation accurately in the CRM."]],
  ["j_ledgerly_support", "c_ledgerly", "Customer Support Lead", "Support", "Merchant Success", "Pune", "Remote", "Full-time", "Mid", 1000000, 1600000, "INR", 3, ["Customer Support", "Escalation Handling"], ["Zendesk", "Knowledge Base", "Ticket Triage"], "Bachelor's", 45, "Open", 7, 1, true,
    "Lead a team of 8 agents who answer merchants about failed payouts. Median first response today is 47 minutes, and you will take it under 20.",
    ["Manage the daily queue and assign tickets by priority.", "Coach agents using weekly reviews of five tickets each.", "Turn recurring issues into help-centre articles and product bug reports."]],
  ["j_oakline_support", "c_oakline", "Support Specialist, Clinic Platform", "Support", "Customer Care", "Hyderabad", "Onsite", "Full-time", "Entry", 450000, 700000, "INR", 1, ["Customer Support", "Communication"], ["Zendesk", "Ticket Triage"], "Bachelor's", 30, "Open", 4, 4, true,
    "Help clinic receptionists when the booking screen misbehaves, mostly by phone and chat. You will learn the product deeply and often be the first to spot a bug.",
    ["Answer about 50 contacts a day by chat and phone from clinic staff.", "Reproduce issues and write clear bug reports for engineers.", "Update the knowledge base after each new question."]],
  ["j_ledgerly_fpa", "c_ledgerly", "Senior FP&A Analyst", "Finance", "Finance", "Pune", "Hybrid", "Full-time", "Senior", 2200000, 3400000, "INR", 5, ["Financial Modelling", "Excel"], ["FP&A", "Power BI", "SQL", "Budgeting"], "Bachelor's", 60, "Open", 10, 1, false,
    "Build the annual budget and the monthly forecast for a company processing ₹9,000 crore a year. You will present variances to the CFO on the fifth working day of each month.",
    ["Maintain the three-statement model and the monthly rolling forecast.", "Explain variances by product line to business heads.", "Build Power BI dashboards for the leadership team."]],
  ["j_harbour_acct", "c_harbour", "Accounts Payable Accountant", "Finance", "Finance Operations", "London", "Onsite", "Full-time", "Mid", 38000, 46000, "GBP", 3, ["Accounting", "Reconciliation"], ["Excel", "Auditing"], "Bachelor's", 30, "Filled", 60, 1, false,
    "Process and reconcile around 1,800 supplier invoices a month for the London head office.",
    ["Match invoices to purchase orders and goods receipts.", "Run the weekly payment batch and resolve supplier queries.", "Support month-end close and the annual audit."]],
  ["j_kestrel_ml", "c_kestrel", "Machine Learning Engineer, Anomaly Detection", "Engineering", "Platform", "Bengaluru", "Hybrid", "Full-time", "Senior", 3000000, 4500000, "INR", 5, ["Python", "SQL"], ["Docker", "AWS", "Kafka"], "Master's", 60, "Draft", 0, 1, false,
    "Draft: build the model that flags unusual latency before customers notice. Requirements are still being agreed with the platform team.",
    ["Train and evaluate anomaly detection models on production traces.", "Deploy models to the streaming pipeline.", "Define evaluation metrics with product."]],
];

export function seedJobs(now: number): Job[] {
  return ROWS.map((r) => {
    const [id, companyId, title, category, department, location, workMode, employmentType, level, salaryMin, salaryMax, currency, minExperience, requiredSkills, preferredSkills, degree, maxNoticeDays, status, daysPosted, openings, allowIneligible, description, responsibilities] = r;
    const job: Job = {
      id, companyId, recruiterId: DEMO_RECRUITER_ID, title, category, department, location, workMode, employmentType, level,
      salaryMin, salaryMax, currency, description, responsibilities, preferredSkills,
      requirements: { minExperience, requiredSkills, degree, locations: workMode === "Remote" ? [] : [location], maxNoticeDays },
      screeningQuestions: questions(id, category),
      allowIneligible, status, openings,
      postedAt: new Date(now - daysPosted * 86400000).toISOString(),
      criteria: [],
    };
    job.criteria = suggestCriteria(job);
    return job;
  });
}
