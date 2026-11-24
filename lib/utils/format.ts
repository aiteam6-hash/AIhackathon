import type { Currency, Job, Stage } from "@/types";

export const cn = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

const SYMBOL: Record<Currency, string> = { INR: "₹", USD: "$", GBP: "£", EUR: "€" };

export function money(amount: number, currency: Currency): string {
  if (currency === "INR") {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2).replace(/\.?0+$/, "")} Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(2).replace(/\.?0+$/, "")} LPA`;
    return `₹${amount.toLocaleString("en-IN")}`;
  }
  if (amount >= 1000) return `${SYMBOL[currency]}${Math.round(amount / 1000)}k`;
  return `${SYMBOL[currency]}${amount}`;
}

export const salaryRange = (j: Pick<Job, "salaryMin" | "salaryMax" | "currency">) =>
  `${money(j.salaryMin, j.currency)} – ${money(j.salaryMax, j.currency)} / yr`;

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${formatDate(iso)}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

export function daysAgo(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

export function relativeDays(iso: string): string {
  const d = daysAgo(iso);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 30) return `${d} days ago`;
  return formatDate(iso);
}

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");

export const isActiveStage = (s: Stage) => !["Rejected", "Withdrawn", "Hired"].includes(s);

export const uid = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
