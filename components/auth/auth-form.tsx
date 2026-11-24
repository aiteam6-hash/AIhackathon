"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Role } from "@/types";
import { authService } from "@/lib/services/authService";
import { Field } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { DemoButtons } from "./demo-buttons";

const loginSchema = z.object({
  email: z.string().min(1, "Enter your email.").email("That does not look like an email address."),
  password: z.string().min(1, "Enter your password."),
});
const signupSchema = z.object({
  name: z.string().min(2, "Enter your full name."),
  email: z.string().min(1, "Enter your email.").email("That does not look like an email address."),
  password: z.string().min(8, "Use at least 8 characters."),
  company: z.string().optional(),
});
type FormValues = { name?: string; email: string; password: string; company?: string };

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
  const router = useRouter();
  const params = useSearchParams();
  const [role, setRole] = useState<Role>(params.get("role") === "recruiter" ? "recruiter" : "applicant");
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(mode === "login" ? loginSchema : signupSchema) as never,
  });

  async function onSubmit(v: FormValues) {
    setError(null);
    try {
      if (mode === "login") {
        await authService.login({ email: v.email, role });
        toast.success("Signed in.");
        const next = params.get("next");
        router.push(next && next.startsWith("/") ? next : role === "recruiter" ? "/recruiter/dashboard" : "/jobs");
      } else {
        await authService.signup({ role, name: v.name!, email: v.email, company: v.company });
        toast.success("Account created.");
        router.push(role === "recruiter" ? "/recruiter/dashboard" : "/onboarding");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
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
        <div className="mt-10 border-t border-rule pt-6">
          <p className="text-sm font-semibold mb-3">Skip the form</p>
          <DemoButtons />
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="max-w-md w-full">
        <RoleTabs role={role} onChange={setRole} />
        <div className="space-y-5">
          {mode === "signup" && (
            <Field label="Full name" error={errors.name} required>{(p) => <input className="input" autoComplete="name" {...p} {...register("name")} />}</Field>
          )}
          <Field label="Email" error={errors.email} required>{(p) => <input className="input" type="email" autoComplete="email" {...p} {...register("email")} />}</Field>
          <Field label="Password" error={errors.password} required hint={mode === "login" ? "This is a simulated sign-in. Any password works for an existing account." : "At least 8 characters. Stored nowhere; this demo has no server."}>
            {(p) => <input className="input" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} {...p} {...register("password")} />}
          </Field>
          {mode === "signup" && role === "recruiter" && (
            <Field label="Company name" hint="Shown to applicants on your job posts." error={errors.company}>{(p) => <input className="input" autoComplete="organization" {...p} {...register("company")} />}</Field>
          )}
        </div>
        <div aria-live="polite">{error && <p role="alert" className="field-error mt-4 border-l-2 border-accent pl-3">{error}</p>}</div>
        <button className="btn btn-primary btn-lg w-full mt-6" disabled={isSubmitting}>{isSubmitting ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
        <p className="text-sm mt-5 text-muted">
          {mode === "login" ? <>New here? <Link className="link" href={`/signup?role=${role}`}>Create an account</Link></> : <>Already registered? <Link className="link" href={`/login?role=${role}`}>Sign in</Link></>}
        </p>
      </form>
    </div>
  );
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  return <Suspense fallback={<div className="container-x py-20" role="status">Loading…</div>}><Inner mode={mode} /></Suspense>;
}
