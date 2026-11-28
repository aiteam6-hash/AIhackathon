/// <reference lib="webworker" />
/* eslint-disable @typescript-eslint/no-explicit-any */
import { KokoroTTS } from "kokoro-js";
import { KOKORO_MODEL, KOKORO_VOICE } from "./config";

/**
 * Runs the Kokoro text-to-speech model in a Web Worker, in the applicant's own browser (free, no API key).
 * The model (about 90 MB) is downloaded once from Hugging Face and then cached by the browser.
 * Text is spoken one sentence at a time so the first sentence starts playing while the rest is still being made.
 */
let tts: any = null;
let current = 0;

const sentences = (text: string) => text.match(/[^.!?]+[.!?]*\s*/g)?.map((x) => x.trim()).filter(Boolean) ?? [text];

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data as { type: "load" } | { type: "speak"; id: number; text: string } | { type: "stop" };
  if (msg.type === "stop") { current = 0; return; }
  if (msg.type === "load") {
    try {
      if (!tts) {
        tts = await KokoroTTS.from_pretrained(KOKORO_MODEL, {
          dtype: "q8",
          device: "wasm",
          progress_callback: (p: { status?: string; progress?: number }) => {
            if (p.status === "progress" && typeof p.progress === "number") self.postMessage({ type: "progress", progress: p.progress });
          },
        } as any);
      }
      self.postMessage({ type: "ready" });
    } catch (err) {
      self.postMessage({ type: "error", message: err instanceof Error ? err.message : "Could not load the voice model." });
    }
    return;
  }
  if (msg.type === "speak") {
    current = msg.id;
    try {
      for (const part of sentences(msg.text)) {
        if (current !== msg.id) return;
        const out: any = await tts.generate(part, { voice: KOKORO_VOICE, speed: 0.95 });
        if (current !== msg.id) return;
        const audio: Float32Array = out.audio;
        self.postMessage({ type: "chunk", id: msg.id, audio, rate: out.sampling_rate ?? 24000 }, [audio.buffer]);
      }
      if (current === msg.id) self.postMessage({ type: "done", id: msg.id });
    } catch (err) {
      self.postMessage({ type: "failed", id: msg.id, message: err instanceof Error ? err.message : "Could not speak." });
    }
  }
};
