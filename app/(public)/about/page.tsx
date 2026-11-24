import type { Metadata } from "next";
import { CONTACT_EMAIL, PRODUCT_NAME } from "@/lib/config";

export const metadata: Metadata = { title: "About" };

const SECTIONS: { id: string; title: string; body: string[] }[] = [
  { id: "approach", title: "How we use AI", body: [
    "Every score, summary and rejection message in this product is labelled AI-generated and lists the criteria it was based on. A recruiter can override any score, and the override is saved with a required comment.",
    "In this demo the AI is simulated: fixed rules read the resume text and produce the same output every time. Nothing is sent to a model or a server.",
  ] },
  { id: "privacy", title: "Privacy", body: [
    "This is a browser-only learning project. Profiles, resumes and applications are stored in your browser's local storage and never leave your device. Deleting your account, or using Reset demo data, removes them.",
  ] },
  { id: "terms", title: "Terms of use", body: [
    "The jobs, companies and people shown here are invented. Do not enter real personal data you are not comfortable keeping in local storage. No offers made here are real.",
  ] },
  { id: "ai", title: "AI use policy", body: [
    "Scores are an aid to a person's judgement, not a decision. Hard requirements are shown as pass or fail with the reason, so a recruiter can see exactly why someone was filtered out and can reverse it.",
  ] },
  { id: "contact", title: "Contact", body: [`Questions about the project: ${CONTACT_EMAIL} (placeholder address).`] },
];

export default function About() {
  return (
    <div className="container-x py-14 md:py-20 grid gap-12 lg:grid-cols-[1fr_1.4fr]">
      <div>
        <p className="eyebrow mb-3">About</p>
        <h1 className="text-5xl md:text-6xl">Hiring decisions that can be explained to the person on the other end.</h1>
        <p className="text-muted mt-6 max-w-md">{PRODUCT_NAME} began from two frustrations: recruiters reading thousands of applications from people who miss the basics, and applicants who never hear why they were turned down.</p>
      </div>
      <div className="border-t border-ink">
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="py-7 border-b border-rule scroll-mt-6">
            <h2 className="text-2xl mb-3">{s.title}</h2>
            {s.body.map((p) => <p key={p} className="mb-3 max-w-xl leading-relaxed">{p}</p>)}
          </section>
        ))}
      </div>
    </div>
  );
}
