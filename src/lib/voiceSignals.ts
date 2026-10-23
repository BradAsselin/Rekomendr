// src/lib/voiceSignals.ts — S13c, client side: what happened to the five
// cards a spoken mood produced (docs/s13-opus-voice-plan.md, B4).
//
// The page marks a result set as a voice set (its mood id and titles); the
// card handlers report taps, plays, shares, saves and stars on any title
// in it. Any other search ends the voice set. One event per (kind, title);
// fire-and-forget to /api/voice. "Ignored" is computed by the readout:
// shown with nothing else.

import { getAnonymousClientId } from "./userPrefs";

export type VoiceEventKind = "shown" | "tap" | "play" | "share" | "save" | "star";

let active: { moodId: string; titles: string[] } | null = null;
const sent = new Set<string>();

function post(moodId: string, events: { kind: VoiceEventKind; title: string; position: number }[]) {
  if (typeof window === "undefined" || events.length === 0) return;
  void fetch("/api/voice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: getAnonymousClientId(), moodId, events }),
    keepalive: true,
  }).catch(() => {});
}

export function setVoiceSet(moodId: string | null, titles: string[]): void {
  sent.clear();
  active = moodId ? { moodId, titles: titles.slice(0, 10) } : null;
  if (active) post(active.moodId, active.titles.map((title, position) => ({ kind: "shown", title, position })));
}

export const clearVoiceSet = (): void => {
  active = null;
  sent.clear();
};

// A thumbs-down replacement joins the set (it is one of "the five" now).
export function addToVoiceSet(title: string): void {
  if (active && !active.titles.includes(title) && active.titles.length < 10) {
    active.titles.push(title);
    post(active.moodId, [{ kind: "shown", title, position: active.titles.length - 1 }]);
  }
}

export function noteVoiceAction(kind: Exclude<VoiceEventKind, "shown">, title: string): void {
  if (!active) return;
  const position = active.titles.indexOf(title);
  if (position < 0) return;
  const key = `${kind}|${title}`;
  if (sent.has(key)) return;
  sent.add(key);
  post(active.moodId, [{ kind, title, position }]);
}
