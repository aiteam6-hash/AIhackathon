"use client";
import { useId, useState } from "react";
import { X } from "lucide-react";
import { ALL_SKILLS } from "@/lib/ai/shared";

interface Props {
  value: string[];
  onChange: (v: string[]) => void;
  id?: string;
  placeholder?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

/** Type a skill and press Enter or comma. Suggestions come from the skills dictionary. */
export function TagInput({ value, onChange, id, placeholder = "Type a skill, press Enter", ...aria }: Props) {
  const [draft, setDraft] = useState("");
  const listId = useId();
  const add = (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    const canonical = ALL_SKILLS.find((s) => s.toLowerCase() === v.toLowerCase()) ?? v;
    if (!value.some((x) => x.toLowerCase() === canonical.toLowerCase())) onChange([...value, canonical]);
    setDraft("");
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {value.map((s) => (
          <span key={s} className="chip">
            {s}
            <button type="button" aria-label={`Remove ${s}`} onClick={() => onChange(value.filter((x) => x !== s))} className="hover:text-accent"><X size={12} /></button>
          </span>
        ))}
        {value.length === 0 && <span className="text-sm text-muted">No skills yet.</span>}
      </div>
      <input
        id={id} className="input" list={listId} value={draft} placeholder={placeholder} {...aria}
        onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value.slice(0, -1)) : setDraft(e.target.value))}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(draft); } }}
        onBlur={() => add(draft)}
      />
      <datalist id={listId}>{ALL_SKILLS.filter((s) => !value.includes(s)).map((s) => <option key={s} value={s} />)}</datalist>
    </div>
  );
}
