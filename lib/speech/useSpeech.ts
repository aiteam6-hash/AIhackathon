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

/** Fallback: reads text aloud with the browser's built-in voices (free, no download). Prefers an Indian or British English voice. */
function useBrowserSpeaker() {
  const [speaking, setSpeaking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const run = useRef(0); // bumps on every speak/stop so a stale chain stops itself
  const keep = useRef<SpeechSynthesisUtterance[]>([]); // Chrome drops utterances that get garbage collected mid-speech

  const stop = useCallback(() => {
    run.current++;
    if (supported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  const speak = useCallback((text: string) => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    const mine = ++run.current;
    synth.cancel();
    setProblem(null);

    const pickVoice = () => {
      const voices = synth.getVoices();
      return voices.find((v) => v.lang === "en-IN") ?? voices.find((v) => v.lang === "en-GB") ?? voices.find((v) => v.lang.toLowerCase().startsWith("en")) ?? voices[0] ?? null;
    };
    // Short pieces, because Chrome silently cuts off a single long utterance after about 15 seconds.
    const parts = text.match(/[^.!?]+[.!?]*\s*/g)?.map((x) => x.trim()).filter(Boolean) ?? [text];

    const begin = () => {
      if (run.current !== mine) return;
      const voice = pickVoice();
      let started = false;
      const fail = () => { if (run.current === mine && !started) { setSpeaking(false); setProblem("No voice came out. Check your volume, or read the question on screen."); } };
      const sayNext = (n: number) => {
        if (run.current !== mine || n >= parts.length) { if (run.current === mine) setSpeaking(false); return; }
        const u = new SpeechSynthesisUtterance(parts[n]);
        if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = "en-IN";
        u.rate = 0.95;
        u.onstart = () => { started = true; setSpeaking(true); };
        u.onend = () => { keep.current = keep.current.filter((x) => x !== u); sayNext(n + 1); };
        u.onerror = (ev) => {
          keep.current = keep.current.filter((x) => x !== u);
          if (ev.error === "canceled" || ev.error === "interrupted") return;
          setSpeaking(false);
          setProblem(ev.error === "not-allowed" ? "Your browser blocked the voice. Press Hear it again." : "This browser could not read the question aloud. Read it on screen.");
        };
        keep.current.push(u);
        synth.speak(u);
        if (n === 0) setTimeout(fail, 3000);
      };
      sayNext(0);
    };

    // Chrome needs a moment after cancel(), and loads its voice list late.
    setTimeout(() => {
      if (synth.getVoices().length) return begin();
      let done = false;
      const go = () => { if (!done) { done = true; synth.removeEventListener("voiceschanged", go); begin(); } };
      synth.addEventListener("voiceschanged", go);
      setTimeout(go, 800);
    }, 120);
  }, [supported]);

  useEffect(() => () => { run.current++; if (supported) window.speechSynthesis.cancel(); }, [supported]);
  return { speak, stop, speaking, supported, problem };
}

/**
 * Reads text aloud. Uses the Kokoro neural voice (in a worker, on the applicant's device) once it has loaded,
 * and the browser's built-in voice until then or if it cannot load.
 */
export function useSpeaker() {
  const fallback = useBrowserSpeaker();
  const worker = useRef<Worker | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const sources = useRef<AudioBufferSourceNode[]>([]);
  const nextAt = useRef(0);
  const run = useRef(0);
  const workerDone = useRef(true);
  const [status, setStatus] = useState<ModelStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const statusRef = useRef<ModelStatus>("idle");
  const setSt = (v: ModelStatus) => { statusRef.current = v; setStatus(v); };

  const halt = useCallback(() => {
    run.current++;
    worker.current?.postMessage({ type: "stop" });
    sources.current.forEach((n) => { n.onended = null; try { n.stop(); } catch { /* already stopped */ } });
    sources.current = [];
    workerDone.current = true;
    setSpeaking(false);
  }, []);

  useEffect(() => () => { run.current++; worker.current?.terminate(); worker.current = null; void ctx.current?.close(); }, []);

  const load = useCallback(() => {
    if (worker.current || typeof Worker === "undefined") return;
    setSt("loading"); setProgress(0);
    const w = new Worker(new URL("./kokoro.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    w.onmessage = (e: MessageEvent) => {
      const m = e.data as { type: string; progress?: number; id?: number; audio?: Float32Array; rate?: number };
      if (m.type === "progress") setProgress(Math.round(m.progress ?? 0));
      else if (m.type === "ready") setSt("ready");
      else if (m.type === "error") { setSt("error"); w.terminate(); worker.current = null; }
      else if (m.id !== run.current) return; // an old question
      else if (m.type === "chunk" && m.audio && ctx.current) {
        const c = ctx.current;
        const buf = c.createBuffer(1, m.audio.length, m.rate ?? 24000);
        buf.copyToChannel(m.audio as Float32Array<ArrayBuffer>, 0);
        const src = c.createBufferSource();
        src.buffer = buf; src.connect(c.destination);
        const at = Math.max(c.currentTime + 0.03, nextAt.current);
        src.start(at); nextAt.current = at + buf.duration;
        sources.current.push(src);
        src.onended = () => {
          sources.current = sources.current.filter((x) => x !== src);
          if (workerDone.current && sources.current.length === 0 && run.current === m.id) setSpeaking(false);
        };
        setSpeaking(true);
      } else if (m.type === "done") {
        workerDone.current = true;
        if (sources.current.length === 0) setSpeaking(false);
      } else if (m.type === "failed") {
        halt();
        setProblem("The voice model could not read that. Read the question on screen.");
      }
    };
    w.onerror = () => { setSt("error"); worker.current = null; };
    w.postMessage({ type: "load" });
  }, [halt]);

  const speak = useCallback((text: string) => {
    setProblem(null);
    if (statusRef.current !== "ready" || !worker.current) { fallback.speak(text); return; }
    fallback.stop();
    halt();
    try {
      // Created inside a click or the interview start, so the browser allows sound.
      ctx.current ??= new AudioContext();
      void ctx.current.resume();
    } catch { fallback.speak(text); return; }
    const id = ++run.current;
    nextAt.current = 0; workerDone.current = false;
    worker.current.postMessage({ type: "speak", id, text });
  }, [fallback, halt]);

  const stop = useCallback(() => { halt(); fallback.stop(); }, [halt, fallback]);

  return {
    speak, stop, load,
    speaking: speaking || fallback.speaking,
    supported: fallback.supported || status === "ready",
    problem: problem ?? fallback.problem,
    status, progress,
  };
}
