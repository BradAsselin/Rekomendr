// src/lib/measureRow.ts — S40. The one row a /api/signals "measure" body
// may become (docs/2026-11-10_measure_launch.md, §0: counts, never
// content). Every stored field is an allow-listed word or a bounded
// number; anything else in the body is dropped, never stored. Pure — the
// validators call it directly.

const MEASURE_ORIGINS = new Set(["voice", "typed", "chips", "snap", "mlt"]);
const MEASURE_CATEGORIES = new Set(["movies", "tv", "books", "wine", "other"]);
const MEASURE_LANES = new Set(["search", "snap", "wine"]);
const NUDGE_EVENTS = new Set(["nudge_asked", "nudge_poster", "nudge_not_yet"]);
const oneOf = (set: Set<string>, v: unknown): string | null => (typeof v === "string" && set.has(v) ? v : null);
const intIn = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : null;

// The one row a "measure" body may become, or null (refused).
export function measureRow(body: any, clientId: string): Record<string, unknown> | null {
  const event = body?.event;
  if (event === "search") {
    const origin = oneOf(MEASURE_ORIGINS, body.origin);
    const category = oneOf(MEASURE_CATEGORIES, body.category);
    const lane = oneOf(MEASURE_LANES, body.lane);
    const picks = intIn(body.picks, 0, 5);
    if (!origin || !category || !lane || picks === null) return null;
    return { kind: "search", origin, category, lane, picks, ms: intIn(body.ms, 0, 3_600_000), client_id: clientId };
  }
  if (event === "compare_on") {
    const category = oneOf(MEASURE_CATEGORIES, body.category);
    return category ? { kind: "compare_on", category, client_id: clientId } : null;
  }
  if (typeof event === "string" && NUDGE_EVENTS.has(event)) return { kind: event };
  return null;
}

