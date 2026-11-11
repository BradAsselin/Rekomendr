// src/lib/measure.ts — server-only. S40 (docs/2026-11-10_measure_launch.md):
// small counter rows in public.measure_events, written the moment a thing
// happens, so the readout doesn't depend on Vercel's short log window.
//
// §0: counts, never content. A server row is a kind, a lane and the time —
// no client id, no title, no words (the table's CHECKs refuse a client id
// on these kinds). Fail-soft: a counter that can't write logs one line and
// moves on; it never changes what the person gets.
// Server-only by use (routes and parseRetry); it holds no secret itself —
// the service-role client is imported lazily and only when its env is set.
import type { SupabaseClient } from "@supabase/supabase-js";
import { dbErrorReason } from "./dbError";

export type Lane = "search" | "snap" | "wine";
export type ServerKind = "retry" | "retry_failed" | "error" | "late";

// The client gives up on a search-lane backfill at 90 s (rekomendrEngine).
// A result that lands later than this arrived after the person stopped
// waiting: that is the server-side count of "the client gave up".
export const CLIENT_ABORT_MS = 90_000;

// parseWithRetry tags → lane. The search lane's AI calls go through
// /api/openai ("search"); the snap lane's text calls through /api/reksnap;
// wine through the wine libs and the typed-wine classifier.
const TAG_LANE: Record<string, Lane> = {
  search: "search",
  "snap-read": "snap",
  backfill: "snap",
  detail: "snap",
  chain: "snap",
  "typed-wine": "wine",
  "wine-shelf": "wine",
  wine: "wine",
};
export const laneForTag = (tag: string): Lane | null => TAG_LANE[tag] ?? null;

let storePromise: Promise<SupabaseClient | null> | null = null;
const getStore = (): Promise<SupabaseClient | null> => {
  if (!storePromise) {
    storePromise =
      process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
        ? import("./supabaseServer").then((m) => m.supabaseServer).catch(() => null)
        : Promise.resolve(null);
  }
  return storePromise;
};

// Test seam: the validators swap the store for a recorder.
export function __setMeasureStore(store: SupabaseClient | null): void {
  storePromise = Promise.resolve(store);
}

export async function insertMeasure(row: Record<string, unknown>): Promise<boolean> {
  try {
    const store = await getStore();
    if (!store) return false;
    const { error } = await store.from("measure_events").insert(row);
    if (error) {
      const reason = dbErrorReason(error);
      (reason === "permission_denied" ? console.error : console.warn)("[measure] not recorded", {
        kind: row.kind,
        reason,
        code: error.code ?? null,
      });
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[measure] not recorded — threw", { kind: row.kind, message: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

// One server counter row. Awaited by callers on paths that are already
// slow (a retry, an error), so the write lands before the function ends.
export function recordServer(kind: ServerKind, lane: Lane | null): Promise<boolean> {
  return insertMeasure({ kind, lane });
}

// Wraps a route's POST: a 5xx answer (or a throw, which Next turns into a
// 500) is counted as a server error shown to the person, by lane. The
// response itself is passed through untouched.
export function countErrors(lane: Lane, handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      const res = await handler(req);
      if (res.status >= 500) await recordServer("error", lane);
      return res;
    } catch (err) {
      await recordServer("error", lane);
      throw err;
    }
  };
}
