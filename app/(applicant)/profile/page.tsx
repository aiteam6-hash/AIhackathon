"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import type { Applicant, Category, WorkMode } from "@/types";
import { CATEGORIES } from "@/lib/ai/shared";
import { useSession } from "@/lib/hooks/useSession";
import { useAsync } from "@/lib/hooks/useAsync";
import { resumeService } from "@/lib/services/resumeService";
import { authService } from "@/lib/services/authService";
import { formatDate } from "@/lib/utils/format";
import { PageHeader } from "@/components/ui/bits";
import { ErrorState, SkeletonBlock } from "@/components/ui/states";
import { ConfirmDialog, Modal } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { ResumeUpload, type ParsedResume } from "@/components/applicant/resume-upload";
import { ProfileForm } from "@/components/applicant/profile-form";

const MODES: WorkMode[] = ["Remote", "Hybrid", "Onsite"];

function Preferences({ applicant }: { applicant: Applicant }) {
  const [prefs, setPrefs] = useState(applicant.preferences);
  const [notify, setNotify] = useState(applicant.notifyPrefs);
  const [saving, setSaving] = useState(false);
  const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);
  async function save() {
    setSaving(true);
    await resumeService.saveProfile({ ...applicant, preferences: prefs, notifyPrefs: notify });
    setSaving(false);
    toast.success("Preferences saved.");
  }
  return (
    <div className="space-y-8 max-w-2xl">
      <fieldset>
        <legend className="field-label">Job categories you want</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {CATEGORIES.map((c: Category) => (
            <label key={c} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={prefs.categories.includes(c)} onChange={() => setPrefs({ ...prefs, categories: toggle(prefs.categories, c) })} /> {c}</label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="field-label">Work modes</legend>
        <div className="flex gap-6">
          {MODES.map((m) => <label key={m} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={prefs.workModes.includes(m)} onChange={() => setPrefs({ ...prefs, workModes: toggle(prefs.workModes, m) })} /> {m}</label>)}
        </div>
      </fieldset>
      <div className="max-w-xs">
        <label htmlFor="minsal" className="field-label">Minimum yearly salary ({applicant.salaryCurrency})</label>
        <input id="minsal" className="input" type="number" value={prefs.minSalary} onChange={(e) => setPrefs({ ...prefs, minSalary: Number(e.target.value) })} />
      </div>
      <fieldset>
        <legend className="field-label">Email notifications <span className="font-normal text-muted">(interface only; no emails are sent in this demo)</span></legend>
        <div className="space-y-2">
          {([["statusChanges", "When an application changes stage"], ["newMatches", "When a new job matches my profile"], ["weeklyDigest", "A weekly summary"]] as const).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={notify[k]} onChange={() => setNotify({ ...notify, [k]: !notify[k] })} /> {l}</label>
          ))}
        </div>
      </fieldset>
      <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save preferences"}</button>
    </div>
  );
}

export default function ProfilePage() {
  const { user } = useSession();
  const router = useRouter();
  const { data, error, reload } = useAsync(() => resumeService.getProfile(user!.applicantId!), [user?.id]);
  const [replace, setReplace] = useState(false);
  const [parsed, setParsed] = useState<ParsedResume | null>(null);
  const [version, setVersion] = useState(0);
  const [del, setDel] = useState(false);
  const [busy, setBusy] = useState(false);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <SkeletonBlock className="h-96" />;
  const { applicant, resume } = data;

  async function applyParsed(useFields: boolean) {
    if (!parsed) return;
    const next: Applicant = useFields
      ? { ...applicant, name: parsed.name || applicant.name, headline: parsed.headline, location: parsed.location, skills: parsed.skills, experienceYears: parsed.experienceYears, education: parsed.education, work: parsed.work, summary: parsed.summary }
      : applicant;
    await resumeService.saveProfile(next, { fileName: parsed.fileName, text: parsed.text, usedText: parsed.usedText, file: parsed.file });
    toast.success(useFields ? "Resume replaced and profile fields updated." : "Resume replaced. Profile fields kept as they were.");
    setParsed(null); setReplace(false); setVersion((v) => v + 1);
  }

  async function removeAccount() {
    setBusy(true);
    await authService.deleteAccount(user!.id);
    toast.success("Account deleted and local data cleared.");
    router.push("/");
  }

  return (
    <div className="max-w-4xl">
      <PageHeader eyebrow="Account" title="Profile and settings" />
      <nav aria-label="On this page" className="flex flex-wrap gap-5 text-sm mb-10">
        {[["resume", "Resume"], ["details", "Details"], ["preferences", "Preferences"], ["danger", "Delete account"]].map(([id, l]) => <a key={id} href={`#${id}`} className="link">{l}</a>)}
      </nav>

      <section id="resume" className="pb-10 mb-10 border-b border-rule scroll-mt-6">
        <h2 className="text-3xl mb-4">Resume</h2>
        {resume ? (
          <div className="flex flex-wrap items-center justify-between gap-4 border border-rule p-4">
            <div className="flex items-center gap-3"><FileText size={20} aria-hidden /><div><p className="font-semibold">{resume.fileName}</p><p className="text-sm text-muted">Uploaded {formatDate(resume.uploadedAt)}</p></div></div>
            <button className="btn btn-sm" onClick={() => setReplace(true)}>Replace resume</button>
          </div>
        ) : (
          <><p className="text-muted mb-4">You have not uploaded a resume yet. Recruiters read this file alongside your profile.</p><ResumeUpload onParsed={(p) => { setParsed(p); }} /></>
        )}
      </section>

      <section id="details" className="pb-10 mb-10 border-b border-rule scroll-mt-6">
        <h2 className="text-3xl mb-6">Details</h2>
        <ProfileForm key={`${applicant.id}-${version}`} initial={applicant} submitLabel="Save changes"
          onSave={async (a) => { await resumeService.saveProfile(a); toast.success("Profile saved."); }} />
      </section>

      <section id="preferences" className="pb-10 mb-10 border-b border-rule scroll-mt-6">
        <h2 className="text-3xl mb-6">Preferences</h2>
        <Preferences key={`p-${version}`} applicant={applicant} />
      </section>

      <section id="danger" className="scroll-mt-6">
        <h2 className="text-3xl mb-2">Delete account</h2>
        <p className="text-muted max-w-xl mb-4">Removes your profile, resume, applications and notifications from this browser. This cannot be undone.</p>
        <button className="btn" onClick={() => setDel(true)}>Delete my account</button>
      </section>

      <Modal open={replace || (!!parsed && !resume)} onClose={() => { setReplace(false); setParsed(null); }} title="Replace resume" wide>
        {!parsed ? <ResumeUpload label="Upload the new version" onParsed={setParsed} /> : (
          <div>
            <p className="text-sm mb-4"><strong>{parsed.fileName}</strong> is ready. {parsed.usedText ? "We read its text and filled in matching fields." : "We could not find readable text in it (it may be a scan), so your details cannot be updated from it."}</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary" onClick={() => applyParsed(true)} disabled={!parsed.usedText}>Replace and update my profile fields</button>
              <button className="btn" onClick={() => applyParsed(false)}>Replace the file only</button>
            </div>
            {!parsed.usedText && <p className="field-hint mt-3">Updating fields is disabled because this file could not be read as text. Your current details stay as they are.</p>}
          </div>
        )}
      </Modal>
      <ConfirmDialog open={del} onCancel={() => setDel(false)} onConfirm={removeAccount} busy={busy} title="Delete your account?" confirmLabel="Delete account"
        body="Your profile, resume, applications and notifications will be removed from this browser. You will be signed out." />
    </div>
  );
}
