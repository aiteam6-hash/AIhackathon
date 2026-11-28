/** English-only Whisper "base": good accuracy for accented English at about 77 MB. Use "Xenova/whisper-tiny.en" (about 41 MB) for a lighter, less accurate option. */
export const WHISPER_MODEL = "Xenova/whisper-base.en";
/** Longest single spoken answer, in seconds. Recording stops by itself at this point. */
export const MAX_ANSWER_SECONDS = 120;

/** Natural text-to-speech that runs in the browser (about 90 MB, downloaded once). */
export const KOKORO_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
export const KOKORO_VOICE = "af_heart";
