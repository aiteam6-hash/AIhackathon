"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Applicant } from "@/types";
import { useSession } from "@/lib/hooks/useSession";
import { useAsync } from "@/lib/hooks/useAsync";
import { resumeService } from "@/lib/services/resumeService";
import { PageHeader } from "@/components/ui/bits";
import { ErrorState, SkeletonBlock } from "@/components/ui/states";
import { toast } from "@/components/ui/toaster";
import { ResumeUpload, type ParsedResume } from "@/components/applicant/resume-upload";
import { ProfileForm } from "@/components/applicant/profile-form";

export default function Onboarding() {
  const { user } = useSession();
  const router = useRouter();
  const { data, error, reload } = useAsync(() => resumeService.getProfile(user!.applicantId!), [user?.id]);
  const [parsed, setParsed] = useState<ParsedResume | null>(null);
  const [manual, setManual] = useState(false);
  const [version, setVersion] = useState(0);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <SkeletonBlock className="h-96" />;

  const applicant = data.applicant;
  const draft: Applicant = parsed
    ? { ...applicant, name: parsed.name || applicant.name, headline: parsed.headline, location: parsed.location, skills: parsed.skills, experienceYears: parsed.experienceYears, education: parsed.education, work: parsed.work, summary: parsed.summary }
    : applicant;
  const reviewing = !!parsed || manual;

  async function save(a: Applicant) {
    await resumeService.saveProfile(a, parsed ? { fileName: parsed.fileName, text: parsed.text, usedText: parsed.usedText, file: parsed.file } : undefined);
    toast.success("Profile saved. Here are the jobs that fit you.");
    router.push("/jobs");
  }

  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow={reviewing ? "Step 2 of 2" : "Step 1 of 2"} title={reviewing ? "Check what we found" : "Start with your resume"}
        description={reviewing ? "Everything below is editable. Matches and eligibility are calculated from these fields, so correct anything that is off." : "Upload it once and we will fill in your profile. You can edit every field afterwards."} />
      {!reviewing ? (
        <>
          <ResumeUpload onParsed={(p) => { setParsed(p); setVersion((v) => v + 1); }} />
          <p className="text-sm text-muted mt-6">No file handy? <button className="link" onClick={() => setManual(true)}>Enter your details by hand</button>.</p>
        </>
      ) : (
        <>
          {parsed && (
            <p role="status" className="border-l-2 border-accent pl-3 mb-8 text-sm">
              <strong>{parsed.fileName}</strong>{" "}
              {parsed.usedText
                ? "was read and the fields below were filled in from its text. Check each one before saving."
                : parsed.sample
                  ? "has no readable text, so the fields below were filled with sample details. Please correct every field before saving."
                  : "has no readable text. It may be a scan or a picture of a document, so the form below is empty. Fill it in by hand, or upload a PDF or DOCX that has selectable text."}{" "}
              <button className="link" onClick={() => { setParsed(null); setManual(false); }}>Upload a different file</button>
            </p>
          )}
          <ProfileForm key={version} initial={draft} submitLabel="Save and find jobs" onSave={save} />
        </>
      )}
    </div>
  );
}
