import type { Metadata } from "next";
import { CONTACT_EMAIL, PRODUCT_NAME } from "@/lib/config";

export const metadata: Metadata = { title: "About" };

const SECTIONS: { id: string; title: string; body: string[] }[] = [
  { id: "approach", title: "How we use AI", body: [
    "Scores, summaries, rejection messages, interview questions and job drafts are written by Claude, an AI model from Anthropic. Every one is labelled AI-generated, and scores list the criteria they were based on. A recruiter can override any score, and the override is saved with a required comment.",
    "Whether someone meets a hard requirement, such as minimum experience or a required skill, is decided by fixed rules, not by the AI, so the same applicant always gets the same result and the reason is shown.",
    "AI interviews are optional and approved by the recruiter first. If you answer by voice, your speech is turned into text on your own device and the audio is never recorded or uploaded. The summary looks only at what you said, not your accent, voice or fluency. You can type your answers instead.",
  ] },
  { id: "privacy", title: "Privacy", body: [
    "You sign in with Google, and we receive your name and email. Your profile, resume, applications and interview answers are stored in our database. Resume files sit in private storage, and only recruiters who received your application can see it.",
    "When Claude scores an application, your resume text and cover note are sent to Anthropic with your name, email and phone number removed. We do not use anyone's data to train models.",
    "Deleting an account from inside the app is not available yet. To have your data removed, write to the address under Contact. The demo accounts use made-up sample data kept only in your browser.",
  ] },
  { id: "terms", title: "Terms of use", body: [
    "Use real accounts for real applications and hiring decisions only. The demo accounts and their jobs, companies and people are invented, and offers made in the demo are not real.",
  ] },
  { id: "ai", title: "AI use policy", body: [
    "Scores and summaries are an aid to a person's judgement, not a decision. A recruiter decides every outcome and can reverse a filtered-out applicant. The AI is instructed to ignore names, gender, age, religion, caste, nationality and health, and AI interview summaries never assess accent or voice. AI can still make mistakes, so please read the reasoning, not only the number.",
  ] },
  { id: "contact", title: "Contact", body: [`Questions or data requests: ${CONTACT_EMAIL} (placeholder address until a real one is set).`] },
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
