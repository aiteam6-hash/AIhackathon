"use client";
import Link from "next/link";
import { CONTACT_EMAIL, PRODUCT_DESCRIPTION, PRODUCT_NAME } from "@/lib/config";

const COLUMNS: { title: string; links: [string, string][] }[] = [
  { title: "Product", links: [["How it works", "/#how-it-works"], ["Example scoring", "/#example"]] },
  { title: "For applicants", links: [["Browse jobs", "/jobs"], ["Create a profile", "/signup?role=applicant"], ["Applicant sign in", "/login?role=applicant"]] },
  { title: "For recruiters", links: [["Post a job", "/recruiter/jobs/new"], ["Recruiter dashboard", "/recruiter/dashboard"], ["Recruiter sign up", "/signup?role=recruiter"]] },
  { title: "Company", links: [["About", "/about"], ["Our approach to AI", "/about#approach"], ["Contact", "/about#contact"]] },
  { title: "Legal", links: [["Privacy", "/about#privacy"], ["Terms of use", "/about#terms"], ["AI use policy", "/about#ai"]] },
];

export function Footer({ compact }: { compact?: boolean }) {
  const year = new Date().getFullYear();
  if (compact) {
    return (
      <footer className="border-t border-rule mt-16 py-5 text-xs text-muted">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p>© {year} {PRODUCT_NAME}.</p>
          <p className="flex gap-4">
            <Link href="/about#ai" className="hover:text-ink underline">AI use</Link>
            <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-ink underline">{CONTACT_EMAIL}</a>
          </p>
        </div>
      </footer>
    );
  }
  return (
    <footer className="border-t border-ink mt-24 bg-bg">
      <div className="container-x py-14 grid gap-10 lg:grid-cols-[1.3fr_3fr]">
        <div>
          <p className="font-display text-3xl">{PRODUCT_NAME}</p>
          <p className="text-muted mt-3 max-w-xs text-sm">{PRODUCT_DESCRIPTION}</p>
          <p className="text-sm mt-5">Write to us: <a className="link" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-8">
          {COLUMNS.map((c) => (
            <div key={c.title}>
              <h2 className="eyebrow mb-3 font-sans">{c.title}</h2>
              <ul className="space-y-2 text-sm">
                {c.links.map(([label, href]) => (
                  <li key={label}><Link href={href} className="hover:text-accent hover:underline">{label}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="border-t border-rule">
        <div className="container-x py-5 flex flex-wrap justify-between gap-3 text-xs text-muted">
          <p>© {year} {PRODUCT_NAME}.</p>
        </div>
      </div>
    </footer>
  );
}
