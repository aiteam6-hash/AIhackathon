"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Role } from "@/types";
import { authService } from "@/lib/services/authService";
import { useSession } from "@/lib/hooks/useSession";
import { toast } from "@/components/ui/toaster";

function RoleTabs({ role, onChange }: { role: Role; onChange: (r: Role) => void }) {
  return (
    <div role="radiogroup" aria-label="I am a" className="grid grid-cols-2 border border-ink mb-8">
      {(["applicant", "recruiter"] as Role[]).map((r) => (
        <button key={r} type="button" role="radio" aria-checked={role === r} onClick={() => onChange(r)}
          className={`py-3 text-sm font-medium ${role === r ? "bg-ink text-bg" : "hover:bg-hover"}`}>
          {r === "applicant" ? "I'm looking for work" : "I'm hiring"}
        </button>
      ))}
    </div>
  );
}

function Inner({ mode }: { mode: "login" | "signup" }) {
  const params = useSearchParams();
  const router = useRouter();
  const { ready, user, role: signedInRole } = useSession();
  useEffect(() => {
    if (ready && user && signedInRole) router.replace(signedInRole === "recruiter" ? "/recruiter/dashboard" : "/jobs");
  }, [ready, user, signedInRole, router]);
  const [role, setRole] = useState<Role>(params.get("role") === "recruiter" ? "recruiter" : "applicant");
  const [busy, setBusy] = useState(false);
  const failed = params.get("error") === "google";

  async function google() {
    setBusy(true);
    try {
      // After Google, the callback sends people to the role page, which forwards returning users to their home.
      const next = params.get("next");
      const dest = `/choose-role?role=${role}${next && next.startsWith("/") ? `&next=${encodeURIComponent(next)}` : ""}`;
      await authService.signInWithGoogle(dest);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start Google sign-in.");
      setBusy(false);
    }
  }

  return (
    <div className="container-x py-12 md:py-20 grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-24">
      <div>
        <p className="eyebrow mb-3">{mode === "login" ? "Welcome back" : "Create an account"}</p>
        <h1 className="text-5xl md:text-6xl">{mode === "login" ? "Sign in to see where things stand." : role === "recruiter" ? "Set up your hiring workspace." : "Upload a resume once. Apply faster."}</h1>
        <p className="text-muted mt-6 max-w-md">
          {role === "recruiter"
            ? "Post roles, filter out applicants who miss the basics, and read the reasoning behind each score."
            : "See which jobs you are eligible for, and get a specific reason if an application does not go forward."}
        </p>
      </div>

      <div className="max-w-md w-full">
        <RoleTabs role={role} onChange={setRole} />
        <button className="btn btn-primary btn-lg w-full" onClick={google} disabled={busy}>
          {busy ? "Opening Google…" : mode === "login" ? "Sign in with Google" : "Continue with Google"}
        </button>
        <div aria-live="polite">
          {failed && <p role="alert" className="field-error mt-4 border-l-2 border-accent pl-3">Google sign-in did not complete. Try again.</p>}
        </div>
        <p className="text-sm mt-5 text-muted">
          {role === "recruiter"
            ? "You will name your company on the next screen after Google confirms who you are."
            : "We only receive your name and email from Google. Your resume stays in your own account."}
        </p>
        <p className="text-sm mt-3 text-muted">
          {mode === "login"
            ? <>New here? Signing in with Google creates your account.</>
            : <>Already registered? Use the same Google account and you will go straight in.</>}
        </p>
      </div>
    </div>
  );
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  return <Suspense fallback={<div className="container-x py-20" role="status">Loading…</div>}><Inner mode={mode} /></Suspense>;
}
