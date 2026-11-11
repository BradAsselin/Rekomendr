// src/lib/measureClient.ts — S40 (docs/2026-11-10_measure_launch.md).
// The app's only new outbound records: counts of what happened, sent
// through /api/signals (kind "measure"). §0: never a title, never words,
// never a photo or a name. Each body is built here from fixed words and
// small numbers only, so nothing else can ride along:
//   search      — origin, category, lane, picks shown (0-5), ms to the set
//   compare_on  — category
//   nudge_*     — nothing but the event
// Fire-and-forget; a failed send is one console line, never a UI change.

import { getAnonymousClientId } from "./clientId";
import type { SearchKind } from "./recentSearches";

export type MeasureCategory = "movies" | "tv" | "books" | "wine" | "other";
export type MeasureLane = "search" | "snap" | "wine";
export type NudgeEvent = "nudge_asked" | "nudge_poster" | "nudge_not_yet";

export type MeasureBody =
  | { event: "search"; origin: SearchKind; category: MeasureCategory; lane: MeasureLane; picks: number; ms: number }
  | { event: "compare_on"; category: MeasureCategory }
  | { event: NudgeEvent };

export function measureCategory(raw: unknown): MeasureCategory {
  const c = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (c === "movies" || c === "movie") return "movies";
  if (c === "tv shows" || c === "tv show" || c === "tv") return "tv";
  if (c === "books" || c === "book") return "books";
  if (c === "wine" || c === "wines") return "wine";
  return "other";
}

// The lane a search ran in: wine is its own lane wherever it started; a
// snap is the snap lane; everything else (voice, typed, chips, More like
// this) is the search lane.
export const measureLane = (origin: SearchKind, category: MeasureCategory): MeasureLane =>
  category === "wine" ? "wine" : origin === "snap" ? "snap" : "search";

// Test seam: the harness reads exactly what would be sent.
export const measurePayload = (clientId: string, body: MeasureBody) => ({ clientId, kind: "measure" as const, ...body });

export function sendMeasure(body: MeasureBody): void {
  if (typeof window === "undefined") return;
  const clientId = getAnonymousClientId();
  if (!clientId) return;
  try {
    void fetch("/api/signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify(measurePayload(clientId, body)),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) console.warn("[measure] not recorded", { event: body.event, status: res.status, reason: data?.reason ?? null });
      })
      .catch(() => console.warn("[measure] not sent", { event: body.event }));
  } catch {}
}

// "search" is sent once per Recent entry: a set that fills in later (its
// lines, a typed title's late five, a vibe refining its genre) is the
// same search, never a second one.
const sentSearches = new Set<string>();
export function measureSearchOnce(entryId: string, origin: SearchKind, rawCategory: string, picks: number, startedAt: string): void {
  if (sentSearches.has(entryId)) return;
  sentSearches.add(entryId);
  const category = measureCategory(rawCategory);
  const started = Date.parse(startedAt);
  sendMeasure({
    event: "search",
    origin,
    category,
    lane: measureLane(origin, category),
    picks: Math.max(0, Math.min(5, Math.round(picks))),
    ms: Number.isFinite(started) ? Math.max(0, Math.min(3_600_000, Date.now() - started)) : 0,
  });
}
