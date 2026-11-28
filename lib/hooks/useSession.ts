"use client";
import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { useStore } from "@/lib/store/store";
import type { Role, User } from "@/types";

const noop = () => () => {};
/** False during server render and the first client render, true afterwards. Avoids hydration mismatches. */
export function useMounted() {
  return useSyncExternalStore(noop, () => true, () => false);
}

/** The real (Supabase + Google) session, filled in by <AuthProvider>. Demo sessions live in the main store. */
export const useRealAuth = create<{ loaded: boolean; user: User | null; needsRole: boolean }>(() => ({
  loaded: false, user: null, needsRole: false,
}));

export interface SessionInfo {
  ready: boolean;
  user: User | null;
  role: Role | null;
  /** Signed in with Google but has not picked a role yet. */
  needsRole: boolean;
  /** True for the sample-data demo accounts. */
  isDemo: boolean;
}

export function useSession(): SessionInfo {
  const mounted = useMounted();
  const demoSession = useStore((s) => s.session);
  const demoUser = useStore((s) => (s.session ? s.users.find((u) => u.id === s.session!.userId) ?? null : null));
  const real = useRealAuth();

  if (!mounted) return { ready: false, user: null, role: null, needsRole: false, isDemo: false };
  // A real Google account always wins over a leftover demo session.
  if (demoSession && demoUser && !real.user) return { ready: true, user: demoUser, role: demoSession.role, needsRole: false, isDemo: true };
  if (!real.loaded) return { ready: false, user: null, role: null, needsRole: false, isDemo: false };
  return { ready: true, user: real.user, role: real.user?.role ?? null, needsRole: real.needsRole, isDemo: false };
}
