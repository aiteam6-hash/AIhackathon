"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Applicant, Application, Company, CriteriaTemplate, Job, Notification, Resume, Session, User } from "@/types";
import { STORE_KEY, STORE_VERSION } from "@/lib/config";
import { createSeed } from "@/lib/mock/seed";

export interface DataState {
  version: number;
  companies: Company[];
  jobs: Job[];
  applicants: Applicant[];
  resumes: Resume[];
  applications: Application[];
  notifications: Notification[];
  users: User[];
  templates: CriteriaTemplate[];
  session: Session | null;
}

/** `tick` increments after every write so screens reading through services refresh themselves. */
interface Store extends DataState {
  tick: number;
}

export const useStore = create<Store>()(
  persist(
    () => ({ ...createSeed(), tick: 0 }),
    {
      name: STORE_KEY,
      version: STORE_VERSION,
      storage: createJSONStorage(() => { if (typeof window === "undefined") throw new Error("no window"); return window.localStorage; }),
      partialize: (s) => { const { tick, ...data } = s; void tick; return data; },
      migrate: () => createSeed(),
    },
  ),
);

export const getState = () => useStore.getState();

/** Apply a change to the data and notify subscribers. Used only by the service layer. */
export function mutate(fn: (s: Store) => Partial<DataState>) {
  useStore.setState((s) => ({ ...fn(s), tick: s.tick + 1 }));
}

export function resetStore() {
  useStore.setState((s) => ({ ...createSeed(), tick: s.tick + 1 }));
}
