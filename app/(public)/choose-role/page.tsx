"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Role } from "@/types";
import { useRealAuth, useSession } from "@/lib/hooks/useSession";
import { authService } from "@/lib/services/authService";
import { Field } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/states";
import { toast } from "@/components/ui/toaster";

function Inner() {
  const router = useRouter();
  const params = useSearchParams();
  const { ready, user, role: existing, needsRole } = useSession();
  const [role, setRole] = useState<Role>(params.get("role") === "recruiter" ? "recruiter" : "applicant");
  const [company, setCompany] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const next = params.get("next");
  const home = (r: Role) => (r === "recruiter" ? "/recruiter/dashboard" : "/jobs");
  // a remembered page is only used when it belongs to this account's own side of the site
  const sameSide = (path: string, r: Role) => (r === "recruiter" ? path.startsWith("/recruiter") : !path.startsWith("/recruiter"));

  // Returning users skip this screen; people who are not signed in go to the login page.
  useEffect(() => {
    if (!ready) return;
    if (user && existing) router.replace(next && next.startsWith("/") && sameSide(next, existing) ? next : home(existing));
    else if (!needsRole) router.replace("/login");
  }, [ready, user, existing, needsRole, next, router]);

  if (!ready || !needsRole) {
    return <div className="container-x py-20 max-w-md space-y-3" role="status" aria-label="Loading"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-4 w-full" /></div>;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (role === "recruiter" && company.trim().length < 2) return setErr("Enter your company name.");
    setErr(null); setBusy(true);
    try {
      await authService.completeOnboarding(role, company.trim());
      const r = await authService.loadRealUser();
      useRealAuth.setState({ loaded: true, user: r.user, needsRole: r.needsRole });
      toast.success("You are all set.");
      router.replace(role === "recruiter" ? "/recruiter/dashboard" : "/onboarding");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not save your choice.");
      setBusy(false);
    }
  }

  return (
    <div className="container-x py-12 md:py-20 grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-24">
      <div>
        <p className="eyebrow mb-3">One last step</p>
        <h1 className="text-5xl md:text-6xl">How will you use Shortlist?</h1>
        <p className="text-muted mt-6 max-w-md">This sets up your account. You cannot switch later, so if you need both, sign in with a second Google account.</p>
      </div>
      <form onSubmit={submit} noValidate className="max-w-md w-full space-y-6">
        <fieldset>
          <legend className="field-label">I am</legend>
          <div className="space-y-2">
            {([["applicant", "Looking for work", "Upload a resume, find roles you are eligible for, and apply."], ["recruiter", "Hiring", "Post roles, filter and score applicants, and manage interviews."]] as const).map(([v, t, d]) => (
              <label key={v} className={`flex gap-3 items-start border p-4 cursor-pointer ${role === v ? "border-ink bg-hover" : "border-rule hover:border-rule-strong"}`}>
                <input type="radio" name="role" className="mt-1" checked={role === v} onChange={() => setRole(v)} />
                <span><strong className="block">{t}</strong><span className="text-sm text-muted">{d}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        {role === "recruiter" && (
          <Field label="Company name" required error={err ?? undefined} hint="Applicants see this on your job posts. You can add more details later.">
            {(p) => <input className="input" autoComplete="organization" value={company} onChange={(e) => setCompany(e.target.value)} {...p} />}
          </Field>
        )}
        {role === "applicant" && err && <p role="alert" className="field-error">{err}</p>}
        <button className="btn btn-primary btn-lg w-full" disabled={busy}>{busy ? "Saving…" : "Continue"}</button>
      </form>
    </div>
  );
}

export default function ChooseRolePage() {
  return <Suspense fallback={<div className="container-x py-20" role="status">Loading…</div>}><Inner /></Suspense>;
}
