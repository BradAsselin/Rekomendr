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

// S12 — go-tos and steering. Stars are the LIVE go-tos starred since the
// test start (wine: its one live go-to, from wine_marks). The rest are
// goto_events counts. "Repeats" must stay 0: it is the client's own count
// of titles that reached the screen twice in one visit.
type GoToReadout = {
  stars_movies: number;
  stars_tv: number;
  stars_books: number;
  stars_wine: number;
  touchstones_shown: number;
  touchstone_stars: number;
  touchstone_star_rate_pct: number | null;
  more_from_goto: number;
  steer_switches: number;
  sets_counted: number;
  repeats: number;
};

const GOTO_LABELS: [keyof GoToReadout, string][] = [
  ["stars_movies", "Go-tos starred: Movies"],
  ["stars_tv", "Go-tos starred: TV"],
  ["stars_books", "Go-tos starred: Books"],
  ["stars_wine", "Go-tos starred: Wine"],
  ["touchstones_shown", "Touchstones shown"],
  ["touchstone_stars", "Touchstones starred"],
  ["touchstone_star_rate_pct", "Touchstone star rate (%)"],
  ["more_from_goto", "+ More like this from a go-to"],
  ["steer_switches", "Steer by switches"],
  ["sets_counted", "Sets checked for repeats"],
  ["repeats", "Repeats (must be 0)"],
];

async function goToReadout(
  store: NonNullable<Awaited<ReturnType<typeof getSnapshotStore>>>,
  since: string,
  agentsOnly: boolean
): Promise<GoToReadout | null> {
  const [stars, wine, events] = await Promise.all([
    store.from("go_tos").select("client_id, category").is("cleared_at", null).gte("created_at", since).limit(20000),
    store
      .from("wine_marks")
      .select("client_id")
      .eq("kind", "favorite")
      .is("cleared_at", null)
      .gte("created_at", since)
      .limit(20000),
    store.from("goto_events").select("client_id, kind, repeats").gte("created_at", since).limit(50000),
  ]);
  if (stars.error || wine.error || events.error) {
    console.warn("[stats] go-to readout unavailable", {
      stars: stars.error?.code ?? null,
      wine: wine.error?.code ?? null,
      events: events.error?.code ?? null,
    });
    return null;
  }
  const mine = (r: { client_id: unknown }) =>
    agentsOnly ? String(r.client_id).startsWith("anon_agent") : !String(r.client_id).startsWith("anon_agent");
  const st = (stars.data ?? []).filter(mine);
  const ev = (events.data ?? []).filter(mine);
  const n = (kind: string) => ev.filter((e) => e.kind === kind).length;
  const shown = n("touchstone_shown");
  const starred = n("touchstone_star");
  const sets = ev.filter((e) => e.kind === "set_shown");
  return {
    stars_movies: st.filter((r) => r.category === "movies").length,
    stars_tv: st.filter((r) => r.category === "tv").length,
    stars_books: st.filter((r) => r.category === "books").length,
    stars_wine: (wine.data ?? []).filter(mine).length,
    touchstones_shown: shown,
    touchstone_stars: starred,
    touchstone_star_rate_pct: shown > 0 ? Math.round((starred / shown) * 1000) / 10 : null,
    more_from_goto: n("goto_more"),
    steer_switches: n("steer_switch"),
    sets_counted: sets.length,
    repeats: sets.reduce((a, e) => a + (Number(e.repeats) || 0), 0),
  };
}

// S13c — voice moods. One row per spoken mood (the words, never audio)
// and what happened to its five: tapped (details opened), played (trailer
// or where to watch), shared, saved, starred — or ignored (shown, nothing
// else). Counted per distinct card.
type VoiceReadout = {
  voice_moods: number;
  voice_mapped_pct: number | null;
  voice_movies: number;
  voice_tv: number;
  voice_wine: number;
  voice_cards_shown: number;
  voice_tapped: number;
  voice_played: number;
  voice_shared: number;
  voice_saved: number;
  voice_starred: number;
  voice_ignored: number;
  voice_ignored_pct: number | null;
  voice_recent: { said: string; mapped: string }[];
};

const VOICE_LABELS: [Exclude<keyof VoiceReadout, "voice_recent">, string][] = [
  ["voice_moods", "Voice: moods spoken"],
  ["voice_mapped_pct", "Voice: mapped to tags (%)"],
  ["voice_movies", "Voice: → Movies"],
  ["voice_tv", "Voice: → TV"],
  ["voice_wine", "Voice: → Wine"],
  ["voice_cards_shown", "Voice: cards shown"],
  ["voice_tapped", "Voice: cards tapped"],
  ["voice_played", "Voice: cards played (trailer/watch)"],
  ["voice_shared", "Voice: cards shared"],
  ["voice_saved", "Voice: cards saved"],
  ["voice_starred", "Voice: cards starred"],
  ["voice_ignored", "Voice: cards ignored"],
  ["voice_ignored_pct", "Voice: ignored (%)"],
];

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

async function voiceReadout(
  store: NonNullable<Awaited<ReturnType<typeof getSnapshotStore>>>,
  since: string,
  agentsOnly: boolean
): Promise<VoiceReadout | null> {
  const [moods, events] = await Promise.all([
    store
      .from("voice_moods")
      .select("id, client_id, transcript, category, chip, refiner, go_to, price, mapped, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20000),
    store.from("voice_events").select("mood_id, client_id, kind, title").gte("created_at", since).limit(100000),
  ]);
  if (moods.error || events.error) {
    console.warn("[stats] voice readout unavailable", {
      moods: moods.error?.code ?? null,
      events: events.error?.code ?? null,
    });
    return null;
  }
  const mine = (r: { client_id: unknown }) =>
    agentsOnly ? String(r.client_id).startsWith("anon_agent") : !String(r.client_id).startsWith("anon_agent");
  const m = (moods.data ?? []).filter(mine);
  const ev = (events.data ?? []).filter(mine);
  const cards = new Map<string, Set<string>>();
  for (const e of ev) {
    const key = `${e.mood_id}|${e.title}`;
    if (!cards.has(key)) cards.set(key, new Set());
    cards.get(key)!.add(String(e.kind));
  }
  const all = Array.from(cards.values());
  const shown = all.filter((k) => k.has("shown"));
  const count = (kind: string) => all.filter((k) => k.has(kind)).length;
  const ignored = shown.filter((k) => k.size === 1).length;
  const mapped = m.filter((r) => r.mapped).length;
  return {
    voice_moods: m.length,
    voice_mapped_pct: m.length ? Math.round((mapped / m.length) * 1000) / 10 : null,
    voice_movies: m.filter((r) => r.category === "movies").length,
    voice_tv: m.filter((r) => r.category === "tv").length,
    voice_wine: m.filter((r) => r.category === "wine").length,
    voice_cards_shown: shown.length,
    voice_tapped: count("tap"),
    voice_played: count("play"),
    voice_shared: count("share"),
    voice_saved: count("save"),
    voice_starred: count("star"),
    voice_ignored: ignored,
    voice_ignored_pct: shown.length ? Math.round((ignored / shown.length) * 1000) / 10 : null,
    voice_recent: m.slice(0, 10).map((r) => ({
      said: String(r.transcript ?? ""),
      mapped: r.mapped
        ? [r.category, r.chip, r.refiner, r.go_to ? `like ${r.go_to}` : null, r.price].filter(Boolean).join(" · ")
        : "not mapped",
    })),
  };
}

// S17 — "Watched": the live watched marks since the test start. An Undo
// deletes its row, so an undone mark is not counted. Same agent exclusion.
type WatchedReadout = { watched: number };

const WATCHED_LABELS: [keyof WatchedReadout, string][] = [["watched", "Watched"]];

async function watchedReadout(
  store: NonNullable<Awaited<ReturnType<typeof getSnapshotStore>>>,
  since: string,
  agentsOnly: boolean
): Promise<WatchedReadout | null> {
  const { data, error } = await store
    .from("user_likes")
    .select("client_id")
    .eq("action", "watched")
    .gte("created_at", since)
    .limit(50000);
  if (error || !Array.isArray(data)) {
    console.warn("[stats] watched readout unavailable", { code: error?.code ?? null });
    return null;
  }
  const rows = data.filter((r) =>
    agentsOnly ? String(r.client_id).startsWith("anon_agent") : !String(r.client_id).startsWith("anon_agent")
  );
  return { watched: rows.length };
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

  const agentsOnly = url.searchParams.get("agents") === "1";
  const [wine, goTos, voice, watched] = await Promise.all([
    wineReadout(store, since, agentsOnly),
    goToReadout(store, since, agentsOnly),
    voiceReadout(store, since, agentsOnly),
    watchedReadout(store, since, agentsOnly),
  ]);

  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
  if (url.searchParams.get("format") === "json") {
    return Response.json(
      { ...readout, ...(watched ?? {}), ...(wine ?? {}), ...(goTos ?? {}), ...(voice ?? {}) },
      { headers }
    );
  }

  const rows =
    LABELS.map(([k, label]) => `<tr><td>${label}</td><td>${readout[k] ?? "—"}</td></tr>`).join("") +
    WATCHED_LABELS.map(([k, label]) => `<tr><td>${label}</td><td>${watched ? watched[k] : "—"}</td></tr>`).join("") +
    WINE_LABELS.map(([k, label]) => `<tr><td>${label}</td><td>${wine ? wine[k] : "—"}</td></tr>`).join("") +
    GOTO_LABELS.map(([k, label]) => `<tr><td>${label}</td><td>${goTos ? goTos[k] ?? "—" : "—"}</td></tr>`).join("") +
    VOICE_LABELS.map(([k, label]) => `<tr><td>${label}</td><td>${voice ? voice[k] ?? "—" : "—"}</td></tr>`).join("") +
    (voice?.voice_recent.length
      ? `<tr><td colspan="2" style="padding-top:16px;font-weight:600">Recent spoken moods</td></tr>` +
        voice.voice_recent
          .map((v) => `<tr><td>“${esc(v.said)}”</td><td style="font-weight:400">${esc(v.mapped)}</td></tr>`)
          .join("")
      : "");
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Rekomendr test readout</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;margin:16px;color:#111827}table{border-collapse:collapse;width:100%;max-width:28rem}td{padding:8px 4px;border-bottom:1px solid #e5e7eb;font-size:16px}td:last-child{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}p{color:#4b5563;font-size:14px}</style>
</head><body><h1 style="font-size:20px">Test readout</h1><p>Since ${since.slice(0, 10)} (UTC). Agent test traffic excluded.</p><table>${rows}</table></body></html>`,
    { status: 200, headers: { ...headers, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" } }
  );
}
