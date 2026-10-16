// app/api/stats/route.ts
// S4 — the test readout, admin-only: GET /api/stats?key=<STATS_KEY>
// [&since=YYYY-MM-DD] [&format=json] [&agents=1 — agent test traffic only,
// for acceptance runs]. A small HTML table by default (for
// a phone), JSON on request. Same definitions as docs/sql/test-readout.sql.
//
// Gate: the STATS_KEY env var, compared in constant time. No key set → the
// route answers 404 for everyone (feature off), named at boot by envCheck.
// Any wrong or missing key → the same 404: the route doesn't advertise
// that it exists. Counts only — no anon ids, no names leave this route.

import { timingSafeEqual } from "crypto";
import { runEnvCheck } from "../../../src/lib/envCheck";
import { getSnapshotStore } from "../../../src/lib/anchorSnapshots";
import { computeReadout, loadEvents, type Readout } from "../../../src/lib/testReadout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

runEnvCheck();

// The test start Brad set (2026-10-16). Pass ?since= to override.
const DEFAULT_SINCE = "2026-10-16";

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

function keyOk(given: string | null): boolean {
  const want = process.env.STATS_KEY?.trim();
  if (!want || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

const LABELS: [keyof Readout, string][] = [
  ["cards_sent", "Cards sent"],
  ["senders", "Senders"],
  ["unique_receivers", "Unique receivers"],
  ["receiver_opens", "Receiver opens"],
  ["late_opens", "Opens > 2 days after send"],
  ["reopen_rate_pct", "Reopen rate (%)"],
  ["receivers_who_sent", "Receivers who sent their own"],
  ["receiver_to_sender_pct", "Receiver → sender (%)"],
  ["watch_taps", "Watch taps"],
  ["trailer_taps", "Trailer taps"],
  ["buy_taps", "Buy taps"],
  ["saves", "Saves"],
  ["installs", "Installs (home-screen launches)"],
];

// S8c — the wine shelf's outcome: bottles bought from confirmed hauls, and
// how many of them a rek led to (snap-to-cart). Same agent exclusion as
// the card readout. Counts only.
type WineReadout = {
  wine_hauls: number;
  wine_bottles_bought: number;
  snap_to_cart: number;
  wine_buyers: number;
  followups_answered: number;
};

const WINE_LABELS: [keyof WineReadout, string][] = [
  ["wine_hauls", "Wine hauls confirmed"],
  ["wine_bottles_bought", "Bottles bought"],
  ["snap_to_cart", "Snap-to-cart (bought from a rek)"],
  ["wine_buyers", "People who bought"],
  ["followups_answered", "\"How was it?\" answered"],
];

async function wineReadout(
  store: NonNullable<Awaited<ReturnType<typeof getSnapshotStore>>>,
  since: string,
  agentsOnly: boolean
): Promise<WineReadout | null> {
  const { data, error } = await store
    .from("wine_marks")
    .select("client_id, haul_id, from_rek, followup")
    .eq("kind", "bought")
    .gte("created_at", since)
    .limit(20000);
  if (error || !Array.isArray(data)) {
    console.warn("[stats] wine readout unavailable", { code: error?.code ?? null });
    return null;
  }
  const rows = data.filter((r) =>
    agentsOnly ? String(r.client_id).startsWith("anon_agent") : !String(r.client_id).startsWith("anon_agent")
  );
  return {
    wine_hauls: new Set(rows.map((r) => r.haul_id).filter(Boolean)).size,
    wine_bottles_bought: rows.length,
    snap_to_cart: rows.filter((r) => !!r.from_rek).length,
    wine_buyers: new Set(rows.map((r) => r.client_id)).size,
    followups_answered: rows.filter((r) => r.followup && r.followup !== "skipped").length,
  };
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (!keyOk(url.searchParams.get("key"))) return notFound();

  const sinceRaw = url.searchParams.get("since") ?? DEFAULT_SINCE;
  const sinceMs = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(sinceRaw) ? `${sinceRaw}T00:00:00Z` : "");
  if (!Number.isFinite(sinceMs)) return Response.json({ error: "since must be YYYY-MM-DD" }, { status: 400 });
  const since = new Date(sinceMs).toISOString();

  const store = await getSnapshotStore();
  if (!store) {
    console.warn("[stats] unavailable — supabase unconfigured");
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
  let readout: Readout;
  try {
    readout = computeReadout(await loadEvents(store, since), since, {
      agentsOnly: url.searchParams.get("agents") === "1",
    });
  } catch (err) {
    console.warn("[stats] read failed", { error: err instanceof Error ? err.message : String(err) });
    return Response.json({ error: "unavailable" }, { status: 503 });
  }

  const wine = await wineReadout(store, since, url.searchParams.get("agents") === "1");

  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
  if (url.searchParams.get("format") === "json") {
    return Response.json({ ...readout, ...(wine ?? {}) }, { headers });
  }

  const rows =
    LABELS.map(([k, label]) => `<tr><td>${label}</td><td>${readout[k] ?? "—"}</td></tr>`).join("") +
    WINE_LABELS.map(([k, label]) => `<tr><td>${label}</td><td>${wine ? wine[k] : "—"}</td></tr>`).join("");
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Rekomendr test readout</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;margin:16px;color:#111827}table{border-collapse:collapse;width:100%;max-width:28rem}td{padding:8px 4px;border-bottom:1px solid #e5e7eb;font-size:16px}td:last-child{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}p{color:#4b5563;font-size:14px}</style>
</head><body><h1 style="font-size:20px">Test readout</h1><p>Since ${since.slice(0, 10)} (UTC). Agent test traffic excluded.</p><table>${rows}</table></body></html>`,
    { status: 200, headers: { ...headers, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" } }
  );
}
