"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@/types";
import { authService } from "@/lib/services/authService";
import { toast } from "@/components/ui/toaster";

export function DemoButtons({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Role | null>(null);
  async function go(role: Role) {
    setBusy(role);
    try {
      await authService.loginDemo(role);
      router.push(role === "recruiter" ? "/recruiter/dashboard" : "/jobs");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start the demo.");
      setBusy(null);
    }
  }
  return (
    <div className={`flex flex-wrap gap-3 ${className}`}>
      <button className="btn" disabled={!!busy} onClick={() => go("applicant")}>{busy === "applicant" ? "Opening…" : "Continue as demo applicant"}</button>
      <button className="btn" disabled={!!busy} onClick={() => go("recruiter")}>{busy === "recruiter" ? "Opening…" : "Continue as demo recruiter"}</button>
    </div>
  );
}
