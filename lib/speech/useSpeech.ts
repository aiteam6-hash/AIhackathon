"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_ANSWER_SECONDS } from "./config";

export type ModelStatus = "idle" | "loading" | "ready" | "error";

/** Loads Whisper in a worker and turns recordings into text. Everything runs on the applicant's device. */
export function useWhisper() {
  const worker = useRef<Worker | null>(null);
  const pending = useRef(new Map<number, { resolve: (t: string) => void; reject: (e: Error) => void }>());
  const nextId = useRef(1);
  const [status, setStatus] = useState<ModelStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => { worker.current?.terminate(); worker.current = null; }, []);

  const load = useCallback(() => {
    if (worker.current) return;
    setStatus("loading"); setProgress(0); setError(null);
    const w = new Worker(new URL("./whisper.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    w.onmessage = (e: MessageEvent) => {
      const m = e.data as { type: string; progress?: number; id?: number; text?: string; message?: string };
      if (m.type === "progress") setProgress(Math.round(m.progress ?? 0));
      else if (m.type === "ready") setStatus("ready");
      else if (m.type === "result" && m.id !== undefined) { pending.current.get(m.id)?.resolve(m.text ?? ""); pending.current.delete(m.id); }
      else if (m.type === "error") {
        if (m.id !== undefined) { pending.current.get(m.id)?.reject(new Error(m.message)); pending.current.delete(m.id); }
        else { setStatus("error"); setError(m.message ?? "Could not load the speech model."); worker.current = null; }
      }
    };
    w.onerror = () => { setStatus("error"); setError("Could not start the speech model in this browser."); worker.current = null; };
    w.postMessage({ type: "load" });
  }, []);

  const transcribe = useCallback((audio: Float32Array) => new Promise<string>((resolve, reject) => {
    if (!worker.current) return reject(new Error("The speech model is not loaded."));
    const id = nextId.current++;
    pending.current.set(id, { resolve, reject });
    worker.current.postMessage({ type: "transcribe", id, audio }, [audio.buffer]);
  }), []);

  return { status, progress, error, load, transcribe };
}

/** Records the microphone and returns 16 kHz mono samples, which is what Whisper expects. */
export function useRecorder() {
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const onDone = useRef<((audio: Float32Array, seconds: number) => void) | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);

  const cleanup = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  useEffect(() => cleanup, []);

  const stop = useCallback(() => { if (recorder.current?.state === "recording") recorder.current.stop(); }, []);

  const start = useCallback(async (done: (audio: Float32Array, seconds: number) => void) => {
    setMicError(null);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch {
      setMicError("We could not use your microphone. Check the browser's permission, or answer by typing instead.");
      return;
    }
    onDone.current = done;
    chunks.current = [];
    const rec = new MediaRecorder(stream.current);
    recorder.current = rec;
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = async () => {
      const secs = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      cleanup(); setRecording(false);
      try {
        const buf = await new Blob(chunks.current, { type: rec.mimeType }).arrayBuffer();
        const ctx = new AudioContext({ sampleRate: 16000 });
        const decoded = await ctx.decodeAudioData(buf);
        void ctx.close();
        onDone.current?.(decoded.getChannelData(0).slice(), secs);
      } catch {
        setMicError("That recording could not be read. Try again, or answer by typing.");
      }
    };
    const startedAt = Date.now();
    rec.start();
    setRecording(true); setSeconds(0);
    timer.current = setInterval(() => {
      const s = Math.round((Date.now() - startedAt) / 1000);
      setSeconds(s);
      if (s >= MAX_ANSWER_SECONDS) stop();
    }, 500);
  }, [stop]);

  return { recording, seconds, micError, start, stop };
}

/** Reads text aloud with the browser's built-in voices (free, no download). Prefers an Indian or British English voice. */
export function useSpeaker() {
  const [speaking, setSpeaking] = useState(false);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  const speak = useCallback((text: string) => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    u.voice = voices.find((v) => v.lang === "en-IN") ?? voices.find((v) => v.lang === "en-GB") ?? voices.find((v) => v.lang.startsWith("en")) ?? null;
    u.rate = 0.95;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  }, [supported]);

  const stop = useCallback(() => { if (supported) window.speechSynthesis.cancel(); setSpeaking(false); }, [supported]);
  useEffect(() => () => { if (supported) window.speechSynthesis.cancel(); }, [supported]);
  return { speak, stop, speaking, supported };
}
