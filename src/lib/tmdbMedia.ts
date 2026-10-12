// src/lib/tmdbMedia.ts — server-only. S3.0: TMDb as the ground truth for
// media anchors (movies and TV), snapped or typed.
//
// Four jobs, all plain TMDb reads (no model call anywhere in this file —
// the public share page imports it, and scripts/validate-s2.cjs walks
// that page's import graph to prove it never reaches OpenAI):
//   1. resolveTypedTitle — does the typed text NAME a specific title?
//      (the "what's that show?" flow; the detection rule is below)
//   2. resolveSnappedTitle — which title did the vision model read?
//   3. loadMediaBundle — one call: overview (the anchor's description,
//      verbatim), trailer, US watch providers, and the candidate pool
//      (TMDb recommendations + similar) the chooser picks five from.
//   4. resolveExactTitle — the wildcard's existence check (title + year).
//
// Charter §2.7 (amended 2026-10-12): public recommendation webs may be
// candidate pools; Rekomendr picks, ranks and explains.
// Charter §2.1 (the firewall): providers are listed where the title
// actually is, in TMDb/JustWatch's own regional order. Nothing here knows
// or uses what any provider pays.

if (typeof window !== "undefined") {
  throw new Error("tmdbMedia.ts was imported in a browser bundle.");
}

import { authFor, normalizeTitle } from "./tmdbVerify";

export type MediaKind = "movie" | "tv";

export type WatchProvider = { name: string; url: string };
export type WatchInfo = {
  // TMDb's own watch page for the title (JustWatch-sourced). Every
  // provider without a known direct search link points here.
  link: string;
  stream: WatchProvider[];
  rentBuy: WatchProvider[];
};
export type MediaCompletion = {
  trailerUrl: string | null;
  watch: WatchInfo | null;
  // When no US service lists the title yet: the honest release window
  // from TMDb's US release dates ("In theaters — on digital Nov 17,
  // 2026"). Null when there is nothing true to say.
  availability: string | null;
};

export type TmdbCandidate = {
  id: number;
  kind: MediaKind;
  title: string;
  year: number | null;
  overview: string;
};

export type MediaBundle = {
  id: number;
  kind: MediaKind;
  title: string;
  year: number | null;
  overview: string;
  completion: MediaCompletion;
  candidates: TmdbCandidate[];
};

export type ResolvedTitle = {
  id: number;
  kind: MediaKind;
  title: string;
  year: number | null;
  overview: string;
  votes: number;
};

// Hang protection, not a latency SLA (charter §2.11): TMDb answers in
// ~50-300ms; 5s bounds a true hang.
const TIMEOUT_MS = 5000;

// Candidate pool hygiene, not a quality floor (that stays Session 5's):
// TMDb's "similar" list carries near-zero-vote noise (a 1959 short with
// one vote under Sing Street). Twenty votes means somebody has seen it.
const MIN_CANDIDATE_VOTES = 20;
const MAX_CANDIDATES = 40;
const MAX_PROVIDERS_PER_GROUP = 4;

function key(): string | null {
  return process.env.TMDB_API_KEY?.trim() || null;
}

export function mediaConfigured(): boolean {
  return key() !== null;
}

async function tmdbGet(path: string, params: Record<string, string> = {}): Promise<any | null> {
  const k = key();
  if (!k) return null;
  const auth = authFor(k);
  const qs = Object.entries(params)
    .map(([a, b]) => `${a}=${encodeURIComponent(b)}`)
    .concat(auth.query ? [auth.query] : [])
    .join("&");
  const url = `https://api.themoviedb.org/3/${path}${qs ? `?${qs}` : ""}`;
  try {
    const res = await fetch(url, {
      headers: auth.headers,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn("[tmdb-media] non-OK", { path: path.split("?")[0], status: res.status });
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn("[tmdb-media] request failed", {
      path: path.split("?")[0],
      error: err instanceof Error ? err.name : String(err),
    });
    return null;
  }
}

const yearOf = (d: unknown): number | null => {
  if (typeof d !== "string" || d.length < 4) return null;
  const y = Number(d.slice(0, 4));
  return Number.isFinite(y) ? y : null;
};

type Row = {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  vote_count?: number;
  popularity?: number;
  adult?: boolean;
};

const rowTitle = (r: Row, kind: MediaKind) => (kind === "movie" ? r.title : r.name) ?? "";
const rowOriginal = (r: Row, kind: MediaKind) =>
  (kind === "movie" ? r.original_title : r.original_name) ?? "";
const rowYear = (r: Row, kind: MediaKind) =>
  yearOf(kind === "movie" ? r.release_date : r.first_air_date);

async function search(kind: MediaKind, query: string): Promise<Row[] | null> {
  const data = await tmdbGet(`search/${kind}`, {
    query,
    include_adult: "false",
    language: "en-US",
    page: "1",
  });
  if (!data) return null;
  return Array.isArray(data.results) ? (data.results as Row[]) : [];
}

const toResolved = (r: Row, kind: MediaKind): ResolvedTitle => ({
  id: r.id,
  kind,
  title: rowTitle(r, kind),
  year: rowYear(r, kind),
  overview: (r.overview ?? "").trim(),
  votes: r.vote_count ?? 0,
});

/* ------------------------------------------------------------------
   1. THE DETECTION RULE — typed text → a specific title, or null.

   The precedent (charter §12.2): search UIs that know a catalog show the
   exact-name entity as a "top result" above everything else — Google's
   Knowledge Panel, Spotify/Apple Music's Top Result, Netflix and Apple
   TV search — and NN/g's search-results guidance is that an exact match
   on an item's name must come first. So the rule is an EXACT name match
   against TMDb, not a guess about intent:

   - the whole query (minus an optional trailing year, "Heat 1995") equals
     a TMDb title or original title after normalization;
   - the match has at least MIN_TYPED_VOTES votes, so a mood word that
     happens to be the name of an obscure film ("Clever", 2 votes) stays a
     mood query;
   - the query is not a genre or mood word the app itself offers (its
     lanes and vibes) — "Heist" (1,029 votes) and "Romance" (318) are real
     films, but a person typing them into a movie app means the genre;
   - across movies and TV, the lane's own kind wins unless the other
     kind's match is far better known (votes × 3 for the lane's kind):
     "Lioness" typed under Movies is the TV show, because the films named
     Lioness have five votes between them.

   Anything else returns null and the search behaves exactly as today.
------------------------------------------------------------------- */
const MIN_TYPED_VOTES = 25;
const LANE_KIND_WEIGHT = 3;

// The app's own lanes and vibes (SearchBar) plus TMDb's genre names and
// the everyday mood words people type. Matched against the WHOLE
// normalized query only — "The Heist" is still a title.
const GENRE_AND_MOOD = new Set(
  [
    "action", "adventure", "animation", "animated", "anime", "comedy", "comedies",
    "crime", "documentary", "documentaries", "drama", "dramas", "family",
    "fantasy", "history", "horror", "music", "musical", "mystery", "romance",
    "romantic", "science fiction", "sci fi", "scifi", "thriller", "thrillers",
    "war", "western", "westerns", "sitcom", "sitcoms", "reality", "kids",
    "heist", "heists", "noir", "slasher", "superhero", "spy", "zombie",
    "zombies", "biopic", "satire", "parody", "mockumentary", "true crime",
    "funny", "clever", "smart", "witty", "dark", "twisty", "scary", "sad",
    "happy", "cozy", "cosy", "light", "uplifting", "feel good", "feelgood",
    "weird", "offbeat", "epic", "suspense", "suspenseful", "comfort",
    "comfort watch", "binge", "binge and chill", "prestige drama",
    "edge of seat", "heartfelt", "goofy", "silly", "quirky", "chill",
    "intense", "classic", "classics", "new", "popular", "trending", "short",
    "long", "slow burn", "thought provoking", "meaningful", "inspiring",
    "inspirational", "relaxing", "fun", "adrenaline", "real stories",
  ].map((w) => normalizeTitle(w))
);

const TRAILING_YEAR = /^(.*?)[\s(]+((?:19|20)\d{2})\)?\s*$/;

export function splitTypedYear(text: string): { title: string; year: number | null } {
  const m = text.trim().match(TRAILING_YEAR);
  if (m && m[1].trim()) return { title: m[1].trim(), year: Number(m[2]) };
  return { title: text.trim(), year: null };
}

export function isGenreOrMood(text: string): boolean {
  return GENRE_AND_MOOD.has(normalizeTitle(text));
}

export async function resolveTypedTitle(
  text: string,
  laneKind: MediaKind
): Promise<ResolvedTitle | null> {
  const raw = (text ?? "").trim();
  if (!raw || raw.length > 100 || !key()) return null;
  const { title, year } = splitTypedYear(raw);
  const wanted = normalizeTitle(title);
  if (!wanted || GENRE_AND_MOOD.has(wanted)) return null;

  const kinds: MediaKind[] = ["movie", "tv"];
  const results = await Promise.all(kinds.map((k) => search(k, title)));

  let best: { row: Row; kind: MediaKind; score: number } | null = null;
  kinds.forEach((kind, i) => {
    for (const row of results[i] ?? []) {
      if (row.adult) continue;
      const a = normalizeTitle(rowTitle(row, kind));
      const b = normalizeTitle(rowOriginal(row, kind));
      if (a !== wanted && b !== wanted) continue;
      const votes = row.vote_count ?? 0;
      if (votes < MIN_TYPED_VOTES) continue;
      const ry = rowYear(row, kind);
      if (year != null && ry != null && Math.abs(ry - year) > 1) continue;
      const score = votes * (kind === laneKind ? LANE_KIND_WEIGHT : 1);
      if (!best || score > best.score) best = { row, kind, score };
    }
  });
  if (!best) return null;
  const hit = best as { row: Row; kind: MediaKind };
  return toResolved(hit.row, hit.kind);
}

/* ------------------------------------------------------------------
   2. A SNAPPED name → title. The vision model's name can carry package
   noise ("Home Alone DVD", "Winchester '73 (1950)"), so this is looser
   than the typed rule: an exact match first (most-voted), then TMDb's
   own top hit when one title contains the other. No vote floor — the
   user is holding the thing; a tiny film is still that film.
------------------------------------------------------------------- */
const PACKAGE_NOISE =
  /\b(dvd|blu[\s-]?ray|4k|uhd|ultra hd|vhs|digital|steelbook|special edition|collector'?s edition|box set|poster|movie|film|the complete series|complete series|season \d+)\b/gi;

export async function resolveSnappedTitle(
  name: string,
  kindHint: MediaKind | "any"
): Promise<ResolvedTitle | null> {
  if (!key()) return null;
  const { title, year } = splitTypedYear(name.replace(PACKAGE_NOISE, " ").replace(/\s+/g, " "));
  const wanted = normalizeTitle(title);
  if (!wanted) return null;
  const kinds: MediaKind[] = kindHint === "any" ? ["movie", "tv"] : [kindHint];
  const results = await Promise.all(kinds.map((k) => search(k, title)));

  let exact: { row: Row; kind: MediaKind; votes: number } | null = null;
  let loose: { row: Row; kind: MediaKind } | null = null;
  kinds.forEach((kind, i) => {
    const rows = (results[i] ?? []).filter((r) => !r.adult);
    for (const row of rows) {
      const a = normalizeTitle(rowTitle(row, kind));
      const b = normalizeTitle(rowOriginal(row, kind));
      const ry = rowYear(row, kind);
      const yearOk = year == null || ry == null || Math.abs(ry - year) <= 1;
      if ((a === wanted || b === wanted) && yearOk) {
        const votes = row.vote_count ?? 0;
        if (!exact || votes > exact.votes) exact = { row, kind, votes };
      }
    }
    const top = rows[0];
    if (!loose && top) {
      const a = normalizeTitle(rowTitle(top, kind));
      if (a && a.length >= 3 && (a.includes(wanted) || wanted.includes(a))) {
        loose = { row: top, kind };
      }
    }
  });
  const pick = (exact ?? loose) as { row: Row; kind: MediaKind } | null;
  return pick ? toResolved(pick.row, pick.kind) : null;
}

/* ------------------------------------------------------------------
   4. EXACT TITLE (+ year ±1) → the title, with its overview. The
   wildcard's existence check: the S1.5 rule (title match, year ±1),
   returning the row so the card can carry TMDb's own overview.
------------------------------------------------------------------- */
export async function resolveExactTitle(
  title: string,
  year: number | null,
  kind: MediaKind
): Promise<ResolvedTitle | null> {
  const wanted = normalizeTitle(title);
  if (!wanted || !key()) return null;
  const rows = await search(kind, title);
  let best: Row | null = null;
  for (const row of rows ?? []) {
    if (row.adult) continue;
    const a = normalizeTitle(rowTitle(row, kind));
    const b = normalizeTitle(rowOriginal(row, kind));
    if (a !== wanted && b !== wanted) continue;
    const ry = rowYear(row, kind);
    if (year != null && ry != null && Math.abs(ry - year) > 1) continue;
    if (!best || (row.vote_count ?? 0) > (best.vote_count ?? 0)) best = row;
  }
  return best ? toResolved(best, kind) : null;
}

/* ------------------------------------------------------------------
   3. THE BUNDLE — one TMDb call (append_to_response) per anchor.
------------------------------------------------------------------- */

// Direct links for the services people actually use, by TMDb provider id
// (JustWatch's ids). A provider not listed here links to TMDb's watch
// page for the title, which carries JustWatch's deep link to it. Search
// URLs, not deep links: TMDb's API does not expose per-provider deep
// links, and a search on the service lands one tap from the title.
const PROVIDER_SEARCH: Record<number, (q: string) => string> = {
  8: (q) => `https://www.netflix.com/search?q=${q}`, // Netflix
  1796: (q) => `https://www.netflix.com/search?q=${q}`, // Netflix Standard with Ads
  9: (q) => `https://www.amazon.com/s?k=${q}&i=instant-video`, // Amazon Prime Video
  119: (q) => `https://www.amazon.com/s?k=${q}&i=instant-video`, // Amazon Prime Video
  2100: (q) => `https://www.amazon.com/s?k=${q}&i=instant-video`, // Prime Video with Ads
  10: (q) => `https://www.amazon.com/s?k=${q}&i=instant-video`, // Amazon Video (rent/buy)
  15: (q) => `https://www.hulu.com/search?q=${q}`, // Hulu
  337: (q) => `https://www.disneyplus.com/search?q=${q}`, // Disney Plus
  2: (q) => `https://tv.apple.com/search?term=${q}`, // Apple TV Store
  350: (q) => `https://tv.apple.com/search?term=${q}`, // Apple TV+
  3: (q) => `https://play.google.com/store/search?q=${q}&c=movies`, // Google Play Movies
  192: (q) => `https://www.youtube.com/results?search_query=${q}`, // YouTube
  73: (q) => `https://tubitv.com/search/${q}`, // Tubi
  300: (q) => `https://pluto.tv/search/details?query=${q}`, // Pluto TV
};

type ProviderRow = { provider_id: number; provider_name: string; display_priority?: number };

// A service's "channel" resale ("Paramount+ Amazon Channel", "… Apple TV
// channel", "… Roku Premium Channel") is the same catalog sold through a
// storefront; listing them all buries the one answer. Kept only when the
// service itself is absent.
const isChannelResale = (name: string) => /\bchannel\b/i.test(name);

function providerList(rows: ProviderRow[][], title: string, watchLink: string): WatchProvider[] {
  const q = encodeURIComponent(title);
  const seen = new Set<number>();
  const all: ProviderRow[] = [];
  for (const group of rows) {
    for (const p of group ?? []) {
      if (!p || typeof p.provider_name !== "string" || seen.has(p.provider_id)) continue;
      seen.add(p.provider_id);
      all.push(p);
    }
  }
  // Source order, untouched: TMDb/JustWatch's display_priority for the
  // region. Not ours, and not payout.
  all.sort((a, b) => (a.display_priority ?? 999) - (b.display_priority ?? 999));
  const direct = all.filter((p) => !isChannelResale(p.provider_name));
  const chosen = (direct.length > 0 ? direct : all).slice(0, MAX_PROVIDERS_PER_GROUP);
  return chosen.map((p) => ({
    name: p.provider_name,
    url: PROVIDER_SEARCH[p.provider_id]?.(q) ?? watchLink,
  }));
}

function parseWatch(raw: any, title: string): WatchInfo | null {
  const us = raw?.results?.US;
  if (!us || typeof us.link !== "string") return null;
  const stream = providerList([us.flatrate, us.free, us.ads], title, us.link);
  const streamIds = new Set(stream.map((p) => p.name));
  const rentBuy = providerList([us.rent, us.buy], title, us.link).filter(
    (p) => !streamIds.has(p.name)
  );
  if (stream.length === 0 && rentBuy.length === 0) return null;
  return { link: us.link, stream, rentBuy };
}

// TMDb release types: 2 limited theatrical, 3 theatrical, 4 digital,
// 5 physical. Only answers when no service lists the title — a release
// window is what a friend would say about a film still in cinemas.
const THEATRICAL_RECENT_DAYS = 150;
const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function parseAvailability(raw: any, now: Date = new Date()): string | null {
  const us = (Array.isArray(raw?.results) ? raw.results : []).find(
    (r: any) => r?.iso_3166_1 === "US"
  );
  const dates: { type?: number; release_date?: string }[] = Array.isArray(us?.release_dates)
    ? us.release_dates
    : [];
  const first = (types: number[]): Date | null => {
    const ts = dates
      .filter((d) => types.includes(Number(d.type)) && typeof d.release_date === "string")
      .map((d) => new Date(d.release_date as string))
      .filter((d) => !Number.isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());
    return ts[0] ?? null;
  };
  const theatrical = first([3, 2]);
  const digital = first([4]);
  const t = now.getTime();
  if (digital && digital.getTime() > t) {
    return theatrical && theatrical.getTime() <= t
      ? `In theaters — on digital ${fmtDate(digital)}`
      : `On digital ${fmtDate(digital)}`;
  }
  if (theatrical && theatrical.getTime() > t) return `In theaters ${fmtDate(theatrical)}`;
  if (
    theatrical &&
    !digital &&
    t - theatrical.getTime() < THEATRICAL_RECENT_DAYS * 864e5
  ) {
    return "In theaters";
  }
  return null;
}

type VideoRow = { site?: string; type?: string; official?: boolean; key?: string; iso_639_1?: string };

function parseTrailer(raw: any): string | null {
  const vids: VideoRow[] = Array.isArray(raw?.results) ? raw.results : [];
  const yt = vids.filter((v) => v.site === "YouTube" && typeof v.key === "string" && v.key);
  const rank = (v: VideoRow) =>
    (v.type === "Trailer" ? 0 : v.type === "Teaser" ? 2 : 4) +
    (v.official ? 0 : 1) +
    (v.iso_639_1 && v.iso_639_1 !== "en" ? 6 : 0);
  const usable = yt.filter((v) => v.type === "Trailer" || v.type === "Teaser");
  usable.sort((a, b) => rank(a) - rank(b));
  const best = usable[0];
  return best ? `https://www.youtube.com/watch?v=${encodeURIComponent(best.key as string)}` : null;
}

function parseCandidates(raw: any, kind: MediaKind, anchorId: number): TmdbCandidate[] {
  const out: TmdbCandidate[] = [];
  const seen = new Set<number>([anchorId]);
  // Recommendations first ("people who watched this also watched"), then
  // similar (genre/keyword neighbours) — the stronger signal leads.
  for (const list of [raw?.recommendations?.results, raw?.similar?.results]) {
    for (const r of (Array.isArray(list) ? list : []) as Row[]) {
      if (!r || typeof r.id !== "number" || seen.has(r.id) || r.adult) continue;
      const overview = (r.overview ?? "").trim();
      const title = rowTitle(r, kind).trim();
      if (!title || !overview || (r.vote_count ?? 0) < MIN_CANDIDATE_VOTES) continue;
      seen.add(r.id);
      out.push({ id: r.id, kind, title, year: rowYear(r, kind), overview });
      if (out.length >= MAX_CANDIDATES) return out;
    }
  }
  return out;
}

// Per-process cache (a warm lambda reuses it): the share page and a
// re-snap of the same title cost nothing. Bounded.
const BUNDLE_TTL_MS = 60 * 60 * 1000;
const BUNDLE_MAX = 200;
const bundleCache = new Map<string, { at: number; bundle: MediaBundle }>();

export async function loadMediaBundle(kind: MediaKind, id: number): Promise<MediaBundle | null> {
  const ck = `${kind}:${id}`;
  const hit = bundleCache.get(ck);
  if (hit && Date.now() - hit.at < BUNDLE_TTL_MS) return hit.bundle;

  const raw = await tmdbGet(`${kind}/${id}`, {
    append_to_response:
      kind === "movie"
        ? "videos,watch/providers,recommendations,similar,release_dates"
        : "videos,watch/providers,recommendations,similar",
    language: "en-US",
  });
  if (!raw || typeof raw.id !== "number") return null;
  const title = String((kind === "movie" ? raw.title : raw.name) ?? "").trim();
  if (!title) return null;
  const bundle: MediaBundle = {
    id: raw.id,
    kind,
    title,
    year: yearOf(kind === "movie" ? raw.release_date : raw.first_air_date),
    overview: String(raw.overview ?? "").trim(),
    completion: (() => {
      const watch = parseWatch(raw["watch/providers"], title);
      return {
        trailerUrl: parseTrailer(raw.videos),
        watch,
        availability: !watch && kind === "movie" ? parseAvailability(raw.release_dates) : null,
      };
    })(),
    candidates: parseCandidates(raw, kind, raw.id),
  };
  if (bundleCache.size >= BUNDLE_MAX) {
    const oldest = bundleCache.keys().next().value;
    if (oldest !== undefined) bundleCache.delete(oldest);
  }
  bundleCache.set(ck, { at: Date.now(), bundle });
  return bundle;
}

// The share page's lookup: a saved media anchor carries its name and
// category, not a TMDb id (no schema change this session), so the page
// re-resolves by name with the snapped rule and reads the completion.
// Null on any miss — the page then shows no trailer/providers rather than
// a guess.
export async function completionForSaved(
  name: string,
  category: string
): Promise<MediaCompletion | null> {
  const c = (category ?? "").trim().toLowerCase();
  const kind: MediaKind | "any" =
    c === "tv" || c === "tv shows" || c === "tv show" || c === "television" || c === "show" || c === "shows"
      ? "tv"
      : c === "movies" || c === "movie" || c === "film" || c === "films"
        ? "movie"
        : "any";
  const resolved = await resolveSnappedTitle(name, kind);
  if (!resolved) return null;
  const bundle = await loadMediaBundle(resolved.kind, resolved.id);
  return bundle?.completion ?? null;
}

export const mediaCategoryFor = (kind: MediaKind): string => (kind === "movie" ? "movies" : "tv");
