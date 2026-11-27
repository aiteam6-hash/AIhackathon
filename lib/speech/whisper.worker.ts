/// <reference lib="webworker" />
/* eslint-disable @typescript-eslint/no-explicit-any */
import { env, pipeline } from "@huggingface/transformers";
import { WHISPER_MODEL } from "./config";

/**
 * Runs Whisper speech-to-text inside a Web Worker, in the applicant's own browser. The audio never leaves the device.
 * The model (about 77 MB) is downloaded once from Hugging Face and then cached by the browser.
 */
env.allowLocalModels = false;
let asr: any = null;

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data as { type: "load" } | { type: "transcribe"; id: number; audio: Float32Array };
  if (msg.type === "load") {
    try {
      if (!asr) {
        asr = await pipeline("automatic-speech-recognition", WHISPER_MODEL, {
          dtype: "q8",
          device: "wasm",
          progress_callback: (p: { status?: string; progress?: number }) => {
            if (p.status === "progress" && typeof p.progress === "number") self.postMessage({ type: "progress", progress: p.progress });
          },
        } as any);
      }
      self.postMessage({ type: "ready" });
    } catch (err) {
      self.postMessage({ type: "error", message: err instanceof Error ? err.message : "Could not load the speech model." });
    }
  } else if (msg.type === "transcribe") {
    try {
      const out: any = await asr(msg.audio, { chunk_length_s: 30, stride_length_s: 5 });
      self.postMessage({ type: "result", id: msg.id, text: String(out?.text ?? "").trim() });
    } catch (err) {
      self.postMessage({ type: "error", id: msg.id, message: err instanceof Error ? err.message : "Could not transcribe that recording." });
    }
  }
};
