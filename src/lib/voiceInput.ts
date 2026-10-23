// src/lib/voiceInput.ts — S13c: the browser's own speech recognition
// (docs/s13-opus-voice-plan.md, B1). Transcription happens on the device
// or the browser's service; Rekomendr never receives audio, only the
// final text the person sees in the box.
//
// Non-continuous: one phrase, and the browser ends it on a pause (the iOS
// default). Interim results stream into the box so the person sees their
// words as they speak. Anything that stops it from working — no API (the
// iOS home-screen app, Firefox), a refused or unavailable mic, a network
// miss — reports "fallback", and the bar falls back to the keyboard's own
// dictation. Never a dead button.

type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

function recognitionCtor(): (new () => RecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const speechSupported = (): boolean => recognitionCtor() !== null;

// Errors that mean "this device can't do it here" → keyboard dictation.
// "no-speech" and "aborted" are not failures: the person said nothing or
// tapped stop.
const FALLBACK_ERRORS = new Set(["not-allowed", "service-not-allowed", "audio-capture", "network", "language-not-supported"]);

export type VoiceListener = { stop(): void };

export function startListening(handlers: {
  onText: (text: string, final: boolean) => void;
  onFallback: (reason: string) => void;
  onEnd: () => void;
}): VoiceListener | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;
  let rec: RecognitionLike;
  try {
    rec = new Ctor();
  } catch {
    return null;
  }
  rec.lang = (typeof navigator !== "undefined" && navigator.language) || "en-US";
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  rec.onresult = (e: any) => {
    let text = "";
    let final = false;
    for (let i = 0; i < e.results.length; i++) {
      text += e.results[i][0]?.transcript ?? "";
      if (e.results[i].isFinal) final = true;
    }
    handlers.onText(text.trim(), final);
  };
  rec.onerror = (e: any) => {
    const code = typeof e?.error === "string" ? e.error : "unknown";
    if (FALLBACK_ERRORS.has(code)) handlers.onFallback(code);
  };
  rec.onend = () => handlers.onEnd();
  try {
    rec.start();
  } catch {
    return null;
  }
  return {
    stop: () => {
      try {
        rec.stop();
      } catch {
        /* already ended */
      }
    },
  };
}
