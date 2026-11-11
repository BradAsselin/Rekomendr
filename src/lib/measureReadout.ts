// src/lib/measureReadout.ts — server-only. S40: the three new blocks on
// the private stats page (docs/2026-11-10_measure_launch.md). Pure compute
// functions over plain rows (the validators check them against hand counts
// on fixtures), plus the loaders. Counts only: no id, title or word leaves
// here except the first eight characters of the house devices' ids.
// Server-only by use (routes and parseRetry); it holds no secret itself —
// the service-role client is imported lazily and only when its env is set.
import type { SupabaseClient } from "@supabase/supabase-js";

export const BLOCK1_SINCE = "2026-10-16";
export const MEASURE_SINCE = "2026-11-10";

export type CardRow = { card_id: string | null; client_id: string; kind: string; is_sender: boolean | null; created_at: string };
export type UsageRow = { client_id: string; route: string; created_at: string };
export type MeasureRow = {
  kind: string;
  lane: string | null;
  origin: string | null;
  category: string | null;
  picks: number | null;
  ms: number | null;
  client_id: string | null;
  created_at: string;
};

const isAgent = (id: string) => id.startsWith("anon_agent");
export const keepFor = (agentsOnly: boolean) => (id: string | null) =>
  id == null ? true : agentsOnly ? isAgent(id) : !isAgent(id);

// --- weeks: Monday start, America/New_York -----------------------------
const NY_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const NY_DOW = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" });
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// The Monday (New York date, YYYY-MM-DD) of the week an instant falls in.
export function weekOf(iso: string | number | Date): string {
  const d = new Date(iso);
  const [y, m, day] = NY_DATE.format(d).split("-").map(Number);
  const back = DOW.indexOf(NY_DOW.format(d));
  return new Date(Date.UTC(y, m - 1, day) - back * 86_400_000).toISOString().slice(0, 10);
}

// Every week from the one holding `since` (a New York date) to the one
// holding `now`, newest first — so an empty week shows zeros.
export function weeksBetween(since: string, now: number): string[] {
  const first = weekOf(`${since}T12:00:00-05:00`);
  const out: string[] = [];
  for (let w = weekOf(now); w >= first; ) {
    out.push(w);
    w = new Date(Date.parse(`${w}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
  }
  return out;
}

// New York midnight of a date, as an instant (handles EST/EDT).
export function nyStart(date: string): number {
  for (const off of ["-05:00", "-04:00"]) {
    const t = Date.parse(`${date}T00:00:00${off}`);
    if (NY_DATE.format(new Date(t)) === date && NY_DATE.format(new Date(t - 1)) !== date) return t;
  }
  return Date.parse(`${date}T05:00:00Z`);
}

const pct = (n: number, d: number): number | null => (d === 0 ? null : Math.round((1000 * n) / d) / 10);

// Nearest-rank percentile (p in 0..1) of a list of numbers; null if empty.
export function percentile(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))];
}

// --- Block 1: THE TEST (cards) ------------------------------------------
export type Block1Week = {
  cards_shared: number;
  cards_opened_by_other: number;
  receiving_devices: number;
  receivers_made_own: number;
  receivers_made_own_pct: number | null;
};

export const BLOCK1_LABELS: [keyof Block1Week, string][] = [
  ["cards_shared", "Cards shared"],
  ["cards_opened_by_other", "Shared cards opened by another device"],
  ["receiving_devices", "Receiving devices (first event: someone else’s card)"],
  ["receivers_made_own", "Receivers who made their own"],
  ["receivers_made_own_pct", "Receivers who made their own (%)"],
];

// Each device's first recorded event (card events and searches/snaps).
function firstEvents(cards: CardRow[], usage: UsageRow[]) {
  const first = new Map<string, { t: number; receiverOpen: boolean }>();
  const see = (id: string, t: number, receiverOpen: boolean) => {
    const cur = first.get(id);
    // A tie goes to the card open: a receiver's first search can share its second.
    if (!cur || t < cur.t || (t === cur.t && receiverOpen)) first.set(id, { t, receiverOpen });
  };
  for (const r of cards) see(r.client_id, Date.parse(r.created_at), r.kind === "open" && r.is_sender === false);
  for (const r of usage) see(r.client_id, Date.parse(r.created_at), false);
  return first;
}

export function computeBlock1(
  cards: CardRow[],
  usage: UsageRow[],
  opts: { since: string; now: number; exclude: Set<string>; agentsOnly?: boolean }
): Record<string, Block1Week> {
  const keep = keepFor(!!opts.agentsOnly);
  const c = cards.filter((r) => keep(r.client_id));
  const u = usage.filter((r) => keep(r.client_id));
  const t0 = nyStart(opts.since);
  const out: Record<string, Block1Week> = {};
  for (const w of weeksBetween(opts.since, opts.now))
    out[w] = { cards_shared: 0, cards_opened_by_other: 0, receiving_devices: 0, receivers_made_own: 0, receivers_made_own_pct: null };
  const add = (iso: string | number, k: keyof Block1Week) => {
    const t = new Date(iso).getTime();
    if (t < t0) return;
    const w = out[weekOf(t)];
    if (w) (w[k] as number)++;
  };
  const out_ = (id: string) => !opts.exclude.has(id);

  // Cards shared: a card counts once, in the week it was first shared.
  const firstSend = new Map<string, number>();
  for (const r of c)
    if (r.kind === "sent" && r.card_id && out_(r.client_id)) {
      const t = Date.parse(r.created_at);
      if (!firstSend.has(r.card_id) || t < firstSend.get(r.card_id)!) firstSend.set(r.card_id, t);
    }
  firstSend.forEach((t) => add(t, "cards_shared"));

  // Opened by a device other than the sharer: once per card, first such open.
  const firstOther = new Map<string, number>();
  for (const r of c)
    if (r.kind === "open" && r.is_sender === false && r.card_id && out_(r.client_id)) {
      const t = Date.parse(r.created_at);
      if (!firstOther.has(r.card_id) || t < firstOther.get(r.card_id)!) firstOther.set(r.card_id, t);
    }
  firstOther.forEach((t) => add(t, "cards_opened_by_other"));

  // Receivers: first recorded event is opening someone else's card; they
  // made their own if they later shared a card. Counted in the week of
  // that first open.
  const sends = new Map<string, number[]>();
  for (const r of c) if (r.kind === "sent") (sends.get(r.client_id) ?? sends.set(r.client_id, []).get(r.client_id)!).push(Date.parse(r.created_at));
  firstEvents(c, u).forEach((f, id) => {
    if (!f.receiverOpen || !out_(id)) return;
    add(f.t, "receiving_devices");
    if ((sends.get(id) ?? []).some((t) => t > f.t)) add(f.t, "receivers_made_own");
  });
  for (const w of Object.values(out)) w.receivers_made_own_pct = pct(w.receivers_made_own, w.receiving_devices);
  return out;
}

// --- Block 2: Quality ----------------------------------------------------
export const LANES = ["search", "snap", "wine"] as const;
export type Block2Lane = {
  sets: number;
  under_five: number;
  median_ms: number | null;
  p90_ms: number | null;
  retries: number;
  retries_failed: number;
  gave_up: number;
  server_errors: number;
};

export const BLOCK2_LABELS: [keyof Block2Lane, string][] = [
  ["sets", "Result sets shown"],
  ["under_five", "…with fewer than five picks"],
  ["median_ms", "Time to results, median (s)"],
  ["p90_ms", "Time to results, slowest tenth (s)"],
  ["retries", "Silent retries fired"],
  ["retries_failed", "…still failed after the retry"],
  ["gave_up", "Gave up (landed after the 90 s abort)"],
  ["server_errors", "Server errors shown"],
];

export function computeBlock2(
  rows: MeasureRow[],
  opts: { since: string; now: number; agentsOnly?: boolean }
): Record<string, Record<(typeof LANES)[number], Block2Lane>> {
  const keep = keepFor(!!opts.agentsOnly);
  const t0 = nyStart(opts.since);
  const blank = (): Block2Lane => ({ sets: 0, under_five: 0, median_ms: null, p90_ms: null, retries: 0, retries_failed: 0, gave_up: 0, server_errors: 0 });
  const out: Record<string, Record<(typeof LANES)[number], Block2Lane>> = {};
  const times: Record<string, number[]> = {};
  for (const w of weeksBetween(opts.since, opts.now)) out[w] = { search: blank(), snap: blank(), wine: blank() };
  for (const r of rows) {
    const t = Date.parse(r.created_at);
    if (t < t0 || !keep(r.client_id)) continue;
    const lane = r.lane as (typeof LANES)[number];
    const wk = out[weekOf(t)];
    if (!wk || !LANES.includes(lane)) continue;
    const L = wk[lane];
    if (r.kind === "search") {
      L.sets++;
      if ((r.picks ?? 0) < 5) L.under_five++;
      if (typeof r.ms === "number") (times[`${weekOf(t)}|${lane}`] ??= []).push(r.ms);
    } else if (r.kind === "retry") L.retries++;
    else if (r.kind === "retry_failed") L.retries_failed++;
    else if (r.kind === "late") L.gave_up++;
    else if (r.kind === "error") L.server_errors++;
  }
  for (const [key, ms] of Object.entries(times)) {
    const [w, lane] = key.split("|");
    const L = out[w][lane as (typeof LANES)[number]];
    L.median_ms = percentile(ms, 0.5);
    L.p90_ms = percentile(ms, 0.9);
  }
  return out;
}

// --- Block 3: Use ----------------------------------------------------------
export type Block3Week = {
  active_devices: number;
  searches: number;
  by_voice: number;
  by_typed: number;
  by_chips: number;
  by_snap: number;
  by_mlt: number;
  cat_movies: number;
  cat_tv: number;
  cat_books: number;
  cat_wine: number;
  cat_other: number;
  compare_on: number;
  compare_on_devices: number;
  asked: number | null;
  asked_poster: number | null;
  asked_not_yet: number | null;
};

export const BLOCK3_LABELS: [keyof Block3Week, string][] = [
  ["active_devices", "Active devices (any search or snap)"],
  ["searches", "Searches"],
  ["by_voice", "…started by voice"],
  ["by_typed", "…typed"],
  ["by_chips", "…chips"],
  ["by_snap", "…snap"],
  ["by_mlt", "…More like this"],
  ["cat_movies", "Movies"],
  ["cat_tv", "TV"],
  ["cat_books", "Books"],
  ["cat_wine", "Wine"],
  ["cat_other", "Other"],
  ["compare_on", "Compare to switched on"],
  ["compare_on_devices", "…distinct devices"],
  ["asked", "“Did you watch one of these?” asked"],
  ["asked_poster", "…answered with a poster"],
  ["asked_not_yet", "…answered “Not yet”"],
];

// Routes that are a search or a snap (api_usage), for active devices.
const USE_ROUTES = new Set(["openai", "reksnap-text", "reksnap-vision"]);

export function computeBlock3(
  rows: MeasureRow[],
  usage: UsageRow[],
  opts: { since: string; now: number; exclude: Set<string>; agentsOnly?: boolean }
): Record<string, Block3Week> {
  const keep = keepFor(!!opts.agentsOnly);
  const t0 = nyStart(opts.since);
  // Outside the house the nudge can't be split (its rows hold no device).
  const outside = opts.exclude.size > 0;
  const out: Record<string, Block3Week> = {};
  const active: Record<string, Set<string>> = {};
  const compareDevs: Record<string, Set<string>> = {};
  for (const w of weeksBetween(opts.since, opts.now)) {
    out[w] = {
      active_devices: 0, searches: 0, by_voice: 0, by_typed: 0, by_chips: 0, by_snap: 0, by_mlt: 0,
      cat_movies: 0, cat_tv: 0, cat_books: 0, cat_wine: 0, cat_other: 0, compare_on: 0, compare_on_devices: 0,
      asked: outside ? null : 0, asked_poster: outside ? null : 0, asked_not_yet: outside ? null : 0,
    };
    active[w] = new Set();
    compareDevs[w] = new Set();
  }
  const inScope = (id: string | null) => keep(id) && !(id && opts.exclude.has(id));
  for (const r of usage) {
    const t = Date.parse(r.created_at);
    if (t < t0 || !USE_ROUTES.has(r.route) || !inScope(r.client_id)) continue;
    active[weekOf(t)]?.add(r.client_id);
  }
  for (const r of rows) {
    const t = Date.parse(r.created_at);
    if (t < t0 || !inScope(r.client_id)) continue;
    const w = weekOf(t);
    const W = out[w];
    if (!W) continue;
    if (r.kind === "search") {
      if (r.client_id) active[w].add(r.client_id);
      W.searches++;
      const o = `by_${r.origin}` as keyof Block3Week;
      if (o in W) (W[o] as number)++;
      const c = `cat_${r.category ?? "other"}` as keyof Block3Week;
      if (c in W) (W[c] as number)++;
    } else if (r.kind === "compare_on") {
      W.compare_on++;
      if (r.client_id) compareDevs[w].add(r.client_id);
    } else if (!outside && r.kind === "nudge_asked") W.asked!++;
    else if (!outside && r.kind === "nudge_poster") W.asked_poster!++;
    else if (!outside && r.kind === "nudge_not_yet") W.asked_not_yet!++;
  }
  for (const w of Object.keys(out)) {
    out[w].active_devices = active[w].size;
    out[w].compare_on_devices = compareDevs[w].size;
  }
  return out;
}

// --- House devices: first eight characters and activity ---------------------
export type HouseLine = { id8: string; rows: number; last: string | null };
export function houseLines(house: string[], cards: CardRow[], usage: UsageRow[], since: string): HouseLine[] {
  const t0 = nyStart(since);
  return house.map((id) => {
    const ts = [...cards.filter((r) => r.client_id === id), ...usage.filter((r) => r.client_id === id)]
      .map((r) => Date.parse(r.created_at))
      .filter((t) => t >= t0);
    return { id8: id.slice(0, 8), rows: ts.length, last: ts.length ? new Date(Math.max(...ts)).toISOString().slice(0, 10) : null };
  });
}

// --- loaders ---------------------------------------------------------------
async function pageAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown; error: { code?: string } | null }>, label: string): Promise<T[]> {
  const out: T[] = [];
  const PAGE = 1000;
  for (let from = 0; from < 500_000; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error) throw new Error(`${label} read failed: ${error.code ?? "unknown"}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export const loadAllCards = (s: SupabaseClient) =>
  pageAll<CardRow>((a, b) => s.from("card_events").select("card_id, client_id, kind, is_sender, created_at").order("id").range(a, b), "card_events");
export const loadUsage = (s: SupabaseClient) =>
  pageAll<UsageRow>((a, b) => s.from("api_usage").select("client_id, route, created_at").order("id").range(a, b), "api_usage");
export const loadMeasure = (s: SupabaseClient, since: string) =>
  pageAll<MeasureRow>(
    (a, b) =>
      s
        .from("measure_events")
        .select("kind, lane, origin, category, picks, ms, client_id, created_at")
        .gte("created_at", new Date(nyStart(since)).toISOString())
        .order("id")
        .range(a, b),
    "measure_events"
  );
export async function loadHouse(s: SupabaseClient): Promise<string[]> {
  const { data, error } = await s.from("house_devices").select("client_id");
  if (error) throw new Error(`house_devices read failed: ${error.code ?? "unknown"}`);
  return (data ?? []).map((r: { client_id: string }) => r.client_id);
}
