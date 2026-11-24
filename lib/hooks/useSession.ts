"use client";
import { useSyncExternalStore } from "react";
import { useStore } from "@/lib/store/store";
import type { Role, User } from "@/types";

const noop = () => () => {};
/** False during server render and the first client render, true afterwards. Avoids hydration mismatches. */
export function useMounted() {
  return useSyncExternalStore(noop, () => true, () => false);
}

export interface SessionInfo {
  ready: boolean;
  user: User | null;
  role: Role | null;
}

export function useSession(): SessionInfo {
  const ready = useMounted();
  const session = useStore((s) => s.session);
  const user = useStore((s) => (s.session ? s.users.find((u) => u.id === s.session!.userId) ?? null : null));
  if (!ready) return { ready: false, user: null, role: null };
  return { ready: true, user: session ? user : null, role: session?.role ?? null };
}
