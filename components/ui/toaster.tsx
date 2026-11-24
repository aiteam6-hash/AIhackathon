"use client";
import { create } from "zustand";
import { Check, TriangleAlert, X } from "lucide-react";

interface ToastItem { id: number; message: string; kind: "success" | "error" }
const useToasts = create<{ items: ToastItem[]; push: (m: string, k: ToastItem["kind"]) => void; remove: (id: number) => void }>((set) => ({
  items: [],
  push: (message, kind) => {
    const id = Date.now() + Math.random();
    set((s) => ({ items: [...s.items, { id, message, kind }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((t) => t.id !== id) })), 4500);
  },
  remove: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (m: string) => useToasts.getState().push(m, "success"),
  error: (m: string) => useToasts.getState().push(m, "error"),
};

export function Toaster() {
  const { items, remove } = useToasts();
  return (
    <div aria-live="polite" role="status" className="fixed bottom-4 right-4 left-4 sm:left-auto z-[100] flex flex-col gap-2 sm:w-96">
      {items.map((t) => (
        <div key={t.id} className="rise flex items-start gap-3 border border-ink bg-ink text-bg px-4 py-3 text-sm">
          {t.kind === "success" ? <Check size={16} className="mt-0.5 shrink-0" aria-hidden /> : <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />}
          <p className="flex-1">{t.kind === "error" && <span className="font-semibold">Problem: </span>}{t.message}</p>
          <button onClick={() => remove(t.id)} aria-label="Dismiss notification" className="opacity-70 hover:opacity-100"><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}
