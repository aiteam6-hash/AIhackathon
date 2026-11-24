import { useId } from "react";
import type { FieldError } from "react-hook-form";

interface FieldProps {
  label: string;
  hint?: string;
  error?: FieldError | string;
  required?: boolean;
  children: (p: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => React.ReactNode;
}

/** Label + control + hint + error, wired together for screen readers. */
export function Field({ label, hint, error, required, children }: FieldProps) {
  const id = useId();
  const msg = typeof error === "string" ? error : error?.message;
  const describedBy = [hint ? `${id}-hint` : "", msg ? `${id}-err` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}{required && <span aria-hidden className="text-accent"> *</span>}
      </label>
      {children({ id, "aria-invalid": !!msg, "aria-describedby": describedBy })}
      {hint && <p id={`${id}-hint`} className="field-hint">{hint}</p>}
      {msg && <p id={`${id}-err`} role="alert" className="field-error">{msg}</p>}
    </div>
  );
}
