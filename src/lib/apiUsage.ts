// src/lib/apiUsage.ts — server-only.
// S3.6: per-client daily caps on the OpenAI-burning routes (Ledger #19,
// Calls 1+3; docs/s3-build-plan.md S3.6). Mint and flip are capped
// separately, by counts on anchor_snapshots itself (anchorSnapshots.ts).
//
// One log table, one helper, called once at the top of each handler. No
// middleware, no new dependency. public.api_usage has RLS ON, ZERO client
// policies and anon/authenticated revoked (docs/sql/s3.6-api-usage.sql);
// every read and write here is the service role, server-side.
//
// Honest limitation (accepted, Call 1): an attacker who rotates client ids
// is not bounded here. These caps bound per-identity burn and runaway
// loops; a determined distributed attacker is Vercel-platform territory.
if (typeof window !== "undefined") {
  throw new Error("apiUsage.ts was imported in a browser bundle.");
}
import type { SupabaseClient } from "@supabase/supabase-js";
import { dbErrorReason } from "./dbError";

// Generous, sized so no real user ever sees them (build plan S3.6). The
// keys are also the CHECK-constrained values of api_usage.route.
export const CAPS_PER_DAY = {
  "reksnap-vision": 60,
  // anchorDetail, backfill and chain share one key.
  "reksnap-text": 300,
  openai: 300,
  recipe: 60,
} as const;
export type CappedRoute = keyof typeof CAPS_PER_DAY;

const DAY_MS = 24 * 60 * 60 * 1000;

// Mirrors cleanClientId in the reksnap route and anchorSnapshots.ts (and
// the CHECK on api_usage.client_id).
const cleanClientId = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return id.length >= 8 && id.length <= 64 ? id : null;
};

// Same guarded, memoized dynamic import as every service-role route:
// supabaseServer throws at import time on missing env.
let storePromise: Promise<SupabaseClient | null> | null = null;
const getStore = (): Promise<SupabaseClient | null> => {
  if (!storePromise) {
    storePromise =
      process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
        ? import("./supabaseServer")
            .then((m) => m.supabaseServer)
            .catch(() => null)
        : Promise.resolve(null);
  }
  return storePromise;
};

// S22 — the shared classifier; a missing GRANT is named permission_denied
// and logged as an error (it means a migration shipped without GRANTs).
const capLog = (line: string, error: { code?: string; message?: string }, route: string) => {
  const reason = dbErrorReason(error);
  (reason === "permission_denied" ? console.error : console.warn)(line, { route, reason, code: error.code });
};

// True when this request may proceed (and is now counted). ANY
// infrastructure failure answers true with a named tripwire: a broken
// counter must never block a real user (§2.4 — fail-soft, never silent).
export async function underCap(clientId: string, route: CappedRoute): Promise<boolean> {
  try {
    return await countAndRecord(clientId, route);
  } catch (err) {
    // A thrown failure (network, client bug) gets the same answer as a
    // returned one: allowed, and named.
    console.warn("[api-cap] uncapped — counter threw", {
      route,
      message: err instanceof Error ? err.message : String(err),
    });
    return true;
  }
}

async function countAndRecord(clientId: string, route: CappedRoute): Promise<boolean> {
  const store = await getStore();
  if (!store) {
    console.warn("[api-cap] uncapped — supabase unconfigured", { route });
    return true;
  }
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const counted = await store
    .from("api_usage")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("route", route)
    .gt("created_at", since);
  if (counted.error) {
    capLog("[api-cap] uncapped — count failed", counted.error, route);
    return true;
  }
  if ((counted.count ?? 0) >= CAPS_PER_DAY[route]) return false;
  const inserted = await store.from("api_usage").insert({ client_id: clientId, route });
  if (inserted.error) {
    capLog("[api-cap] request not counted — insert failed", inserted.error, route);
  }
  return true;
}

// The one call each handler makes. null = proceed. Otherwise the Response
// to return as-is:
//   400 — no usable client id (the cheap bot filter);
//   429 — over the daily cap. The body carries `error` but deliberately NO
//         `reason`, so readServiceFailure() leaves it alone and every
//         surface answers in its existing failure voice — no new UX.
export async function capGate(rawClientId: unknown, route: CappedRoute): Promise<Response | null> {
  const clientId = cleanClientId(rawClientId);
  if (!clientId) {
    console.warn("[api-cap] refused — missing client id", { route });
    return Response.json({ error: "Missing client id" }, { status: 400 });
  }
  if (await underCap(clientId, route)) return null;
  console.warn("[api-cap] refused — over daily cap", {
    route,
    cap: CAPS_PER_DAY[route],
    client: clientId.slice(0, 12),
  });
  return Response.json({ error: "Daily limit reached" }, { status: 429 });
}
