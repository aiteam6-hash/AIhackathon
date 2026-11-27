"use client";
import { useEffect, useState } from "react";
import { Keyboard, Mic, Square, Volume2 } from "lucide-react";
import type { AiInterview } from "@/types";
import { MAX_ANSWER_SECONDS } from "@/lib/speech/config";
import { useRecorder, useSpeaker, useWhisper } from "@/lib/speech/useSpeech";
import { aiInterviewService } from "@/lib/services/aiInterviewService";
import { ProgressBar } from "@/components/ui/bits";
import { toast } from "@/components/ui/toaster";

type Phase = "intro" | "question" | "review" | "submitting" | "done";
type Mode = "voice" | "typed";
interface Saved { text: string; mode: Mode; seconds?: number }

export function AiInterviewRunner({ interview, jobTitle, companyName }: { interview: AiInterview; jobTitle: string; companyName: string }) {
  const qs = interview.questions;
  const [phase, setPhase] = useState<Phase>("intro");
  const [consent, setConsent] = useState(false);
  const [starting, setStarting] = useState(false);
  const [mode, setMode] = useState<Mode>("voice");
  const [i, setI] = useState(0);
  const [saved, setSaved] = useState<Record<string, Saved>>({});
  const [draft, setDraft] = useState("");
  const [draftMode, setDraftMode] = useState<Mode>("voice");
  const [draftSecs, setDraftSecs] = useState<number | undefined>();
  const [transcribing, setTranscribing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const whisper = useWhisper();
  const rec = useRecorder();
  const speaker = useSpeaker();
  const q = qs[i];

  // Read each question aloud when it appears (the applicant can replay it).
  useEffect(() => {
    if (phase === "question" && q) speaker.speak(q.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, i]);

  // Ask before closing the tab mid-interview, because answers are only sent at the end.
  useEffect(() => {
    if (phase !== "question" && phase !== "review") return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  async function begin(m: Mode) {
    if (!consent) return;
    setStarting(true); setProblem(null);
    try {
      await aiInterviewService.start(interview.id);
      setMode(m);
      if (m === "voice") whisper.load(); // downloads in the background while the first question is read out
      goTo(0, m, {});
      setPhase("question");
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Could not start the interview.");
    }
    setStarting(false);
  }

  function goTo(idx: number, m: Mode, from: Record<string, Saved>) {
    const s = from[qs[idx]?.id];
    setI(idx); setDraft(s?.text ?? ""); setDraftMode(s?.mode ?? m); setDraftSecs(s?.seconds);
    setProblem(null);
  }

  function record() {
    speaker.stop(); setProblem(null);
    void rec.start(async (audio, secs) => {
      setTranscribing(true);
      try {
        const text = await whisper.transcribe(audio);
        setDraft(text); setDraftMode("voice"); setDraftSecs(secs);
        if (!text) setProblem("We could not hear anything in that recording. Try again, a little closer to the microphone, or type your answer.");
      } catch {
        setProblem("We could not turn that recording into text. Try again, or type your answer.");
      }
      setTranscribing(false);
    });
  }

  function next() {
    const all = { ...saved, [q.id]: { text: draft.trim(), mode: draftMode, seconds: draftSecs } };
    setSaved(all);
    if (i + 1 < qs.length) goTo(i + 1, mode, all);
    else setPhase("review");
  }

  async function submit() {
    setPhase("submitting");
    try {
      await aiInterviewService.submit(interview.id, qs.map((x) => ({ questionId: x.id, answer: saved[x.id]?.text ?? "", inputMode: saved[x.id]?.mode ?? "typed", durationSeconds: saved[x.id]?.seconds })));
      toast.success("Interview submitted.");
      setPhase("done");
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Could not submit your answers. Try again.");
      setPhase("review");
    }
  }

  /* ------------------------------- screens ------------------------------- */
  if (phase === "done") {
    return (
      <div role="status" className="max-w-xl">
        <h2 className="text-3xl mb-2">Thank you. You are done.</h2>
        <p>Your answers have been sent to the recruiter at {companyName}. They will read a summary and a person makes the decision. You will be told here if anything changes.</p>
      </div>
    );
  }

  if (phase === "intro") {
    const minutes = Math.max(3, qs.length * 2);
    return (
      <div className="max-w-2xl">
        <p className="mb-6">{companyName} would like you to answer {qs.length} short questions for <strong>{jobTitle}</strong>. It takes about {minutes} minutes. The questions were written with AI and approved by the recruiter.</p>
        <h2 className="text-2xl mb-2">Before you start</h2>
        <ul className="list-disc pl-5 space-y-1.5 mb-6">
          <li>Each question is read aloud, and you answer out loud or by typing. You can mix both.</li>
          <li>If you speak, your voice is turned into text <strong>on your own device</strong>. The audio is not recorded, uploaded or stored.</li>
          <li>The recruiter sees your written answers and an AI-written summary. The summary looks at what you said, not your accent, voice or fluency. A person makes the decision.</li>
          <li>You can re-record, fix any words we got wrong, or leave a question blank.</li>
          <li>Keep this tab open. Your answers are sent when you finish.</li>
        </ul>
        <label className="flex items-start gap-2 mb-5 border border-rule p-4"><input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> <span>I understand how my answers will be used and I agree to take this interview.</span></label>
        <div aria-live="polite">{problem && <p role="alert" className="field-error mb-3">{problem}</p>}</div>
        <div className="flex flex-wrap gap-3">
          <button className="btn btn-primary btn-lg" disabled={!consent || starting} onClick={() => begin("voice")}><Mic size={17} aria-hidden /> {starting ? "Starting…" : "Answer by voice"}</button>
          <button className="btn btn-lg" disabled={!consent || starting} onClick={() => begin("typed")}><Keyboard size={17} aria-hidden /> Answer by typing</button>
        </div>
        <p className="text-sm text-muted mt-4">Voice needs a microphone and a one-time download of about 77 MB for the speech model. Chrome, Edge or Safari on a laptop work best.</p>
      </div>
    );
  }

  if (phase === "review" || phase === "submitting") {
    return (
      <div className="max-w-2xl">
        <h2 className="text-3xl mb-1">Check your answers</h2>
        <p className="text-muted mb-5">Change anything you like. Nothing is sent until you submit.</p>
        <ol className="border-t border-ink">
          {qs.map((x, idx) => (
            <li key={x.id} className="py-4 border-b border-rule">
              <p className="font-semibold">{idx + 1}. {x.text}</p>
              <p className="whitespace-pre-wrap mt-1 text-sm">{saved[x.id]?.text || <span className="text-muted">No answer.</span>}</p>
              <button className="link text-sm mt-1" disabled={phase === "submitting"} onClick={() => { goTo(idx, mode, saved); setPhase("question"); }}>Change this answer</button>
            </li>
          ))}
        </ol>
        <div aria-live="polite">{problem && <p role="alert" className="field-error mt-4">{problem}</p>}</div>
        <button className="btn btn-primary btn-lg mt-6" onClick={submit} disabled={phase === "submitting"}>{phase === "submitting" ? "Submitting…" : "Submit interview"}</button>
      </div>
    );
  }

  // phase === "question"
  const voiceReady = whisper.status === "ready";
  const typed = draftMode === "typed" || mode === "typed";
  return (
    <div className="max-w-2xl">
      <p className="eyebrow mb-2">Question {i + 1} of {qs.length}</p>
      <h2 className="text-3xl md:text-4xl mb-4">{q.text}</h2>
      <button className="btn btn-sm mb-6" onClick={() => speaker.speak(q.text)} disabled={!speaker.supported} aria-label="Read the question aloud again"><Volume2 size={15} aria-hidden /> {speaker.speaking ? "Reading…" : "Hear it again"}</button>

      {!typed && (
        <div className="mb-5">
          {whisper.status === "loading" && <div className="mb-4" aria-live="polite"><ProgressBar value={whisper.progress} label="Preparing the speech model (first time only)" /><p className="text-xs text-muted mt-1">It stays on your device and loads faster next time.</p></div>}
          {whisper.status === "error" && <p role="alert" className="field-error mb-3">{whisper.error} You can still answer by typing.</p>}
          {voiceReady && !rec.recording && !transcribing && (
            <button className="btn btn-primary" onClick={record}><Mic size={16} aria-hidden /> {draft ? "Record again" : "Start answering"}</button>
          )}
          {rec.recording && (
            <div role="status" className="flex items-center gap-3">
              <button className="btn btn-primary" onClick={rec.stop}><Square size={15} aria-hidden /> Stop</button>
              <span className="num">Recording {rec.seconds}s <span className="text-muted">(up to {MAX_ANSWER_SECONDS}s)</span></span>
            </div>
          )}
          {transcribing && <p role="status" className="text-sm">Turning your answer into text…</p>}
          {(rec.micError || problem) && <p role="alert" className="field-error mt-3">{rec.micError ?? problem}</p>}
        </div>
      )}

      {(typed || draft) && !rec.recording && !transcribing && (
        <div className="mb-4">
          <label className="field-label" htmlFor="ans">{typed ? "Your answer" : "Check what we heard. Fix any mistakes."}</label>
          <textarea id="ans" className="input min-h-36" value={draft} onChange={(e) => { setDraft(e.target.value); if (draftMode === "voice") setDraftMode("voice"); }} maxLength={4000} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" onClick={next} disabled={rec.recording || transcribing}>{i + 1 < qs.length ? "Next question" : "Review answers"}</button>
        {!typed && <button className="link text-sm" onClick={() => { setDraftMode("typed"); setDraftSecs(undefined); }} disabled={rec.recording}>Type this answer instead</button>}
        {typed && mode === "voice" && <button className="link text-sm" onClick={() => { setDraftMode("voice"); }}>Use my voice instead</button>}
      </div>
      <p className="text-xs text-muted mt-3">You can leave a question blank if you prefer not to answer it.</p>
    </div>
  );
}
