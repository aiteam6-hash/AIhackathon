import type { Applicant, Role, User } from "@/types";
import { mutate, resetStore } from "@/lib/store/store";
import { DEMO_RECRUITER_ID } from "@/lib/mock/jobs";
import { uid } from "@/lib/utils/format";
import { hasSupabase, supabaseBrowser } from "@/lib/supabase/client";
import { latency, must, ServiceError, state } from "./util";

export interface RealAuth {
  user: User | null;
  /** Signed in with Google, but has not chosen applicant or recruiter yet. */
  needsRole: boolean;
}

/** Simulated auth: a "session" is just a user id and role in localStorage. */
export const authService = {
  async getCurrentUser(): Promise<User | null> {
    const s = state();
    if (!s.session) return null;
    return s.users.find((u) => u.id === s.session!.userId) ?? null;
  },

  async loginDemo(role: Role): Promise<User> {
    await latency(500);
    const id = role === "applicant" ? "u_app_demo" : DEMO_RECRUITER_ID;
    const user = must(state().users.find((u) => u.id === id), "Demo account is missing. Use Reset demo data in the footer.");
    mutate(() => ({ session: { userId: user.id, role } }));
    return user;
  },

  /** Any password is accepted; only the email and role are looked up. */
  async login(input: { email: string; role: Role }): Promise<User> {
    await latency(700);
    const user = state().users.find((u) => u.email.toLowerCase() === input.email.toLowerCase() && u.role === input.role);
    if (!user) throw new ServiceError(`No ${input.role} account uses that email. Sign up first, or try a demo account.`);
    mutate(() => ({ session: { userId: user.id, role: user.role } }));
    return user;
  },

  async signup(input: { role: Role; name: string; email: string; company?: string }): Promise<User> {
    await latency(800);
    if (state().users.some((u) => u.email.toLowerCase() === input.email.toLowerCase() && u.role === input.role)) {
      throw new ServiceError("An account with that email already exists. Sign in instead.");
    }
    const id = uid("u");
    if (input.role === "applicant") {
      const applicantId = uid("ap");
      const profile: Applicant = {
        id: applicantId, name: input.name, email: input.email, headline: "", location: "", skills: [], experienceYears: 0,
        education: { degree: "None", field: "", institution: "" }, work: [], summary: "", expectedSalary: 0, salaryCurrency: "INR",
        noticeDays: 30, openToRelocate: false, preferences: { categories: [], workModes: [], minSalary: 0 },
        notifyPrefs: { statusChanges: true, newMatches: true, weeklyDigest: false }, resumeId: null,
      };
      const user: User = { id, role: "applicant", name: input.name, email: input.email, applicantId };
      mutate((s) => ({ users: [...s.users, user], applicants: [...s.applicants, profile], session: { userId: id, role: "applicant" } }));
      return user;
    }
    const companyId = uid("c");
    const user: User = { id, role: "recruiter", name: input.name, email: input.email, companyIds: [companyId] };
    mutate((s) => ({
      users: [...s.users, user],
      companies: [...s.companies, { id: companyId, name: input.company || "Your company", industry: "Not specified", size: "Not specified", city: "Not specified", website: "", about: "Add a short description of your company so applicants know who they are applying to." }],
      session: { userId: id, role: "recruiter" },
    }));
    return user;
  },

  async logout(): Promise<void> {
    mutate(() => ({ session: null }));
    if (hasSupabase) await supabaseBrowser().auth.signOut();
  },

  /* ----------------------- real accounts (Supabase + Google) ----------------------- */

  /** Sends the browser to Google. `next` is where to go after the callback finishes. */
  async signInWithGoogle(next = "/choose-role"): Promise<void> {
    if (!hasSupabase) throw new ServiceError("Sign-in is not configured on this deployment yet.");
    const { error } = await supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) throw new ServiceError(error.message);
  },

  async loadRealUser(): Promise<RealAuth> {
    if (!hasSupabase) return { user: null, needsRole: false };
    const sb = supabaseBrowser();
    const { data: auth } = await sb.auth.getUser();
    if (!auth.user) return { user: null, needsRole: false };
    const { data: p } = await sb.from("profiles").select("id, role, full_name, email").eq("id", auth.user.id).maybeSingle();
    if (!p || !p.role) return { user: null, needsRole: true };
    const role = p.role as Role;
    return {
      needsRole: false,
      user: { id: p.id, role, name: p.full_name || p.email, email: p.email, applicantId: role === "applicant" ? p.id : undefined },
    };
  },

  /** Calls `onChange` whenever the Supabase session changes (sign-in, sign-out, token refresh). Returns an unsubscribe. */
  onAuthChange(onChange: () => void): () => void {
    if (!hasSupabase) return () => {};
    const { data } = supabaseBrowser().auth.onAuthStateChange(() => setTimeout(onChange, 0));
    return () => data.subscription.unsubscribe();
  },

  /** First-time setup after Google sign-in: choose a role and, for recruiters, name the company. */
  async completeOnboarding(role: Role, companyName?: string): Promise<void> {
    const { error } = await supabaseBrowser().rpc("set_my_role", { p_role: role, p_company_name: companyName ?? null });
    if (error) throw new ServiceError(error.message);
  },

  /** Removes the account and everything attached to it. */
  async deleteAccount(userId: string): Promise<void> {
    await latency(600);
    const user = must(state().users.find((u) => u.id === userId), "Account not found.");
    mutate((s) => ({
      users: s.users.filter((u) => u.id !== userId),
      applicants: s.applicants.filter((a) => a.id !== user.applicantId),
      resumes: s.resumes.filter((r) => r.applicantId !== user.applicantId),
      applications: s.applications.filter((a) => a.applicantId !== user.applicantId),
      notifications: s.notifications.filter((n) => n.userId !== userId),
      session: null,
    }));
  },

  async resetDemoData(): Promise<void> {
    await latency(400);
    resetStore();
  },
};
