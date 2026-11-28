import Link from "next/link";
import { ArrowRight, Check, X } from "lucide-react";
import { AIBadge, ScoreBar } from "@/components/ui/bits";

const RANKED = [
  { name: "Karthik Subramanian", role: "Software Engineer, Zeta Payments", score: 86, ok: true, why: "All required skills, 5 years against a 5-year minimum." },
  { name: "Ananya Reddy", role: "Frontend Developer, Swiggy", score: 81, ok: true, why: "Strong React and testing; no GraphQL." },
  { name: "Rahul Verma", role: "Full Stack Developer, Capgemini", score: 74, ok: true, why: "Good fit; two short stints in four years." },
  { name: "Siddharth Rao", role: "Frontend Developer, Zoho", score: 52, ok: false, why: "3 years of experience; the role asks for 5." },
];

const HIRING = [
  ["Post the role", "Add requirements that are hard rules: minimum experience, must-have skills, degree, location, notice period."],
  ["Filter in one click", "Move every applicant who misses a rule to Rejected. Each one gets a message naming the rule."],
  ["Weight what matters", "Choose criteria such as skill match or stability, set the weights, and run scoring."],
  ["Read the reasons", "Each score comes with two or three sentences citing the resume. Override any of them with a comment."],
];
const LOOKING = [
  ["Upload your resume once", "We read it, you correct it. Skills, experience and location become your profile."],
  ["See roles you can get", "Every job shows a match percentage and which requirements you meet. Hide the ones you don't."],
  ["Apply in a few minutes", "Answer the recruiter's questions, set your notice period and expected salary, and review before sending."],
  ["Hear back with a reason", "If you are turned down, you see the stage it happened at and what to improve."],
];

export default function Landing() {
  return (
    <>
      <section className="container-x pt-12 md:pt-20 pb-16 grid gap-12 lg:grid-cols-[1.15fr_1fr] lg:gap-16 items-start">
        <div>
          <p className="eyebrow mb-6">Recruiting for teams hiring in volume</p>
          <h1 className="text-5xl sm:text-6xl lg:text-[5.5rem] leading-[0.98] font-medium">
            Shortlist the 12 who fit. Tell the other 412 why.
          </h1>
          <p className="mt-8 text-lg max-w-xl leading-relaxed">
            Shortlist checks every applicant against your hard requirements, scores the rest on criteria you weight yourself, and writes a short reason for each score. Applicants who are turned down see the stage where it happened and what to change.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/signup?role=recruiter" className="btn btn-primary btn-lg">I&apos;m hiring <ArrowRight size={16} aria-hidden /></Link>
            <Link href="/signup?role=applicant" className="btn btn-lg">I&apos;m looking <ArrowRight size={16} aria-hidden /></Link>
          </div>
        </div>

        <aside aria-label="Example ranked shortlist" className="border border-ink">
          <div className="px-5 py-4 border-b border-ink flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="eyebrow">Senior Frontend Engineer · Kestrel Labs</p>
              <p className="font-display text-2xl mt-1">9 applicants, ranked</p>
            </div>
            <AIBadge />
          </div>
          <ol>
            {RANKED.map((c, i) => (
              <li key={c.name} className="px-5 py-4 border-b border-rule last:border-b-0 grid grid-cols-[1.5rem_1fr_auto] gap-x-3">
                <span className="font-display text-xl text-muted num">{i + 1}</span>
                <div>
                  <p className="font-semibold leading-tight">{c.name}</p>
                  <p className="text-sm text-muted">{c.role}</p>
                  <p className="text-sm mt-1">{c.why}</p>
                </div>
                <div className="text-right">
                  <p className="font-display text-3xl num">{c.score}</p>
                  <p className="text-xs inline-flex items-center gap-1 mt-1">{c.ok ? <><Check size={12} aria-hidden /> Eligible</> : <><X size={12} aria-hidden /> Fails 1</>}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="px-5 py-3 border-t border-ink text-xs text-muted">Scored on: Skill match 30%, Relevant experience 25%, Domain 15%, Stability 10%, Education 10%, Cover note 10%.</p>
        </aside>
      </section>

      <section id="how-it-works" className="border-t border-ink scroll-mt-4">
        <div className="container-x py-16 grid gap-14 lg:grid-cols-2">
          {[{ title: "If you are hiring", id: "hiring", steps: HIRING }, { title: "If you are applying", id: "applicants", steps: LOOKING }].map((col) => (
            <div key={col.id} id={col.id}>
              <p className="eyebrow">How it works</p>
              <h2 className="text-4xl mt-2 mb-6">{col.title}</h2>
              <ol className="border-t border-ink">
                {col.steps.map(([t, d], i) => (
                  <li key={t} className="grid grid-cols-[3rem_1fr] py-5 border-b border-rule">
                    <span className="font-display text-3xl text-accent num">{i + 1}</span>
                    <div><h3 className="text-xl">{t}</h3><p className="text-muted mt-1">{d}</p></div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      <section id="example" className="border-t border-ink bg-hover scroll-mt-4">
        <div className="container-x py-16 grid gap-12 lg:grid-cols-[1fr_1.6fr]">
          <div>
            <p className="eyebrow">One candidate, scored</p>
            <h2 className="text-4xl mt-2">Karthik Subramanian: 86 out of 100</h2>
            <p className="text-muted mt-4 max-w-sm">Software Engineer at Zeta Payments, 5 years of experience, based in Bengaluru, 30-day notice. He passes all five hard requirements for the role.</p>
            <p className="mt-6 text-sm"><AIBadge /></p>
            <p className="text-xs text-muted mt-2 max-w-sm">Based on six criteria weighted by the recruiter. Any score can be overridden, and the override is logged with the reviewer&apos;s comment.</p>
          </div>
          <div className="space-y-7">
            {[
              ["Skill match", 30, 92, "Covers 2 of 2 must-have skills (React and TypeScript) and 3 of 4 preferred skills. Not listed: CI/CD. The resume names 7 skills in total."],
              ["Relevant experience", 25, 85, "Karthik has 5 years of experience against a 5-year minimum for the Senior Frontend Engineer role. Most recent role: Software Engineer at Zeta Payments (current). That comfortably covers what this role needs."],
              ["Stability", 10, 80, "3 roles over 5 years, averaging 1.7 years per role. Longest stint: 3 years at Zeta Payments. Tenure is acceptable but worth asking about in the interview."],
              ["Cover note clarity", 10, 90, "The cover note runs 54 words. It names the role and backs a claim with a number. It is specific and easy to read."],
            ].map(([l, w, s, r]) => (
              <div key={l as string}>
                <ScoreBar label={l as string} weight={w as number} value={s as number} />
                <p className="text-sm mt-2 max-w-2xl">{r}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

    </>
  );
}
