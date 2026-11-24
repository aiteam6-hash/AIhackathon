"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";

export interface MenuItem {
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  /** Draws a hairline above the item. */
  separated?: boolean;
}

interface Props {
  trigger: React.ReactNode;
  label: string;
  items: MenuItem[];
  align?: "left" | "right";
  triggerClassName?: string;
}

/** Click-to-open menu with Escape, outside-click and arrow-key support. */
export function Menu({ trigger, label, items, align = "right", triggerClassName = "btn btn-text btn-sm" }: Props) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); wrap.current?.querySelector<HTMLElement>("button")?.focus(); }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const els = Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);
        const i = els.indexOf(document.activeElement as HTMLElement);
        els[(i + (e.key === "ArrowDown" ? 1 : -1) + els.length) % els.length]?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    wrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const cls = "block w-full text-left px-4 py-2 text-sm hover:bg-hover focus:bg-hover outline-none aria-disabled:opacity-40 aria-disabled:cursor-not-allowed";
  return (
    <div ref={wrap} className="relative inline-block">
      <button type="button" className={triggerClassName} aria-haspopup="menu" aria-expanded={open} aria-controls={id} aria-label={label} onClick={() => setOpen((o) => !o)}>
        {trigger}
      </button>
      {open && (
        <div id={id} role="menu" aria-label={label} className={`absolute z-40 mt-1 min-w-52 bg-bg border border-ink py-1 ${align === "right" ? "right-0" : "left-0"}`}>
          {items.map((it) => (
            <div key={it.label} className={it.separated ? "border-t border-rule mt-1 pt-1" : ""}>
              {it.href && !it.disabled ? (
                <Link role="menuitem" href={it.href} className={cls} onClick={() => setOpen(false)}>{it.label}</Link>
              ) : (
                <button role="menuitem" type="button" aria-disabled={it.disabled} tabIndex={-1} className={cls}
                  onClick={() => { if (it.disabled) return; setOpen(false); it.onClick?.(); }}>
                  {it.label}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
