"use client";
import { useRef, useState } from "react";
import { FileText, Upload } from "lucide-react";
import { aiService } from "@/lib/services/aiService";
import type { ParsedProfile } from "@/lib/ai/parse";
import { ProgressBar } from "@/components/ui/bits";

export type ParsedResume = ParsedProfile & { usedText: boolean; text: string; fileName: string; file: File };
const MAX_MB = 5;

interface Props {
  onParsed: (p: ParsedResume) => void;
  label?: string;
}

/** Drag-and-drop or browse. Validates type and size, then shows parse progress. */
export function ResumeUpload({ onParsed, label = "Upload your resume" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState<{ pct: number; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<File | null>(null);

  async function handle(file: File | undefined) {
    if (!file) return;
    setError(null);
    setLast(file);
    if (!/\.(pdf|docx|txt)$/i.test(file.name)) return setError("That file type is not supported. Upload a PDF, DOCX or TXT file.");
    if (file.size > MAX_MB * 1024 * 1024) return setError(`That file is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${MAX_MB} MB.`);
    if (file.size === 0) return setError("That file is empty.");
    try {
      setProgress({ pct: 0, label: "Starting" });
      const parsed = await aiService.parseResume(file, (pct, l) => setProgress({ pct, label: l }));
      onParsed({ ...parsed, fileName: file.name, file });
    } catch {
      setError("We could not read that file. Try again, or enter your details by hand.");
    } finally {
      setProgress(null);
    }
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]); }}
        className={`border border-dashed border-ink p-8 md:p-12 text-center ${drag ? "bg-accent-tint" : ""}`}
      >
        {progress ? (
          <div className="max-w-sm mx-auto text-left" aria-live="polite">
            <ProgressBar value={progress.pct} label={`${progress.label}…`} />
            <p className="text-xs text-muted mt-2 flex items-center gap-1"><FileText size={12} aria-hidden /> {last?.name}</p>
          </div>
        ) : (
          <>
            <Upload className="mx-auto mb-3" size={26} aria-hidden />
            <p className="font-display text-2xl">{label}</p>
            <p className="text-sm text-muted mt-1">Drag a file here, or choose one. PDF, DOCX or TXT, up to {MAX_MB} MB.</p>
            <button type="button" className="btn btn-primary mt-5" onClick={() => inputRef.current?.click()}>Choose a file</button>
          </>
        )}
        <input ref={inputRef} type="file" accept=".pdf,.docx,.txt" className="sr-only" aria-label="Resume file" tabIndex={-1}
          onChange={(e) => { handle(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      <div aria-live="polite">
        {error && (
          <div role="alert" className="mt-3 text-sm border-l-2 border-accent pl-3">
            <p className="font-semibold text-accent-deep">{error}</p>
            {last && !progress && /\.(pdf|docx|txt)$/i.test(last.name) && last.size <= MAX_MB * 1048576 && last.size > 0 && (
              <button className="link mt-1" onClick={() => handle(last)}>Try again</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
