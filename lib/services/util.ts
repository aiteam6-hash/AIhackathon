import { getState, mutate, useStore } from "@/lib/store/store";
import type { Application, Notification, Stage } from "@/types";
import { uid } from "@/lib/utils/format";

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Artificial latency so loading states are real. A backend would replace this with network time. */
export const latency = (ms = 450) => sleep(ms);

export class ServiceError extends Error {}

/** Throws a friendly error when a lookup fails. */
export function must<T>(value: T | undefined | null, message: string): T {
  if (value === undefined || value === null) throw new ServiceError(message);
  return value;
}

export const state = getState;

export function notify(userId: string | undefined, title: string, body: string, href: string) {
  if (!userId) return;
  const n: Notification = { id: uid("n"), userId, title, body, at: new Date().toISOString(), read: false, href };
  mutate((s) => ({ notifications: [n, ...s.notifications] }));
}

export const userIdOfApplicant = (applicantId: string) =>
  state().users.find((u) => u.applicantId === applicantId)?.id;

export const nowIso = () => new Date().toISOString();

export function patchApplication(id: string, fn: (a: Application) => Application) {
  mutate((s) => ({ applications: s.applications.map((a) => (a.id === id ? fn(a) : a)) }));
}

export const stageEvent = (stage: Stage, by: "applicant" | "recruiter" | "system", note?: string) => ({
  stage, by, note, at: nowIso(),
});

/** Tells screens that read through `useAsync` to refresh. Real-mode writes call this after they finish. */
export const bump = () => useStore.setState((s) => ({ tick: s.tick + 1 }));
