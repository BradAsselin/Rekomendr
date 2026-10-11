// src/lib/tmdbVerify.ts
// S1.5 — THE REAL-TITLE GUARD (server-only; holds TMDB_API_KEY).
//
// The body: snapping a 2026 A24 release (Backrooms) returned five
// FABRICATED movie titles, each with a working Trailer and Watch button.
// The model could not place the anchor, so it filled five slots with
// fiction and the app dressed the fiction in completion verbs. Charter
// §2.4 — "a silent failure is worse than a wrong answer" — and §1's whole
// recognition beat die right there.
//
// So: for movies and TV, every rek from every path (search, snap,
// backfill, more-like-this, chain) must RESOLVE to a real TMDb entry
// before it ships. Title match, year ±1. Unresolved titles are dropped
// and logged [fake-title] with the anchor that produced them.
//
// This is ONLY the lookup, pulled forward from Session 5. There is no
// quality floor here, no vote count, no score — nothing is judged, only
// existence. The floor is still Session 5's to build.
//
// ANCHORS ARE EXEMPT, everywhere. The snapped or typed thing is the
// user's, not the model's; a brand-new release the model cannot place is
// exactly the case this guard exists to serve honestly, and dropping the
// anchor would delete the question instead of answering it.

export type TitleKind = "movie" | "tv" | "any";

export type VerifyItem = {
  title: string;
  // Search-lane reks carry a year; snap-lane reks do not. Absent year =
  // title match alone (see matchesYear).
  year?: number | null;
  kind?: TitleKind;
};

export type VerifyReason =
  | "no_match"
  | "year_mismatch"
  | "lookup_failed"
  | "disabled"
  | "empty_title";

export type VerifyVerdict = {
  title: string;
  resolved: boolean;
  reason?: VerifyReason;
  // TMDb's own year when a title matched — diagnostic only. Nothing is
  // rewritten from it (see the PR's "Found, not fixed").
  tmdbYear?: number | null;
};

// Hang protection, not a latency SLA (charter §2.11). A TMDb search is
// 100-300ms at the median; 5s is far above any legitimate completion and
// still bounds a true hang. Two lookups (movie + tv) can run for "any",
// so the worst case a caller waits is one round of the pool, not the sum.
const LOOKUP_TIMEOUT_MS = 5000;

// One retry on a TRANSPORT failure only (never on a clean "no results"):
// a single blip should not read as fabrication.
const TRANSPORT_RETRIES = 1;

// How many lookups run at once. TMDb's published ceiling is ~50/s; five
// keeps a five-rek set to one round trip's worth of wall clock without
// going anywhere near it.
const CONCURRENCY = 5;

// FAIL-CLOSED ON LOOKUP FAILURE.
// A title we could not check is a title we cannot vouch for, and the
// charter prefers honest-short to canned-full (§2.4). The cost is real
// and worth naming: a TMDb outage empties media sets rather than
// shipping unverified titles, and the honest-short copy carries it.
// Flip this one constant to let unchecked titles through instead — the
// [fake-title] log already separates `lookup_failed` from `no_match`, so
// the field evidence for flipping it will be in the log before the
// decision has to be made.
const DROP_ON_LOOKUP_FAILURE = true;

/* ------------------------------------------------------------------
   CONFIG
------------------------------------------------------------------- */

export function tmdbConfigured(): boolean {
  return Boolean(process.env.TMDB_API_KEY?.trim());
}

// TMDb takes either a v3 api_key query param or a v4 Bearer token, and
// the two look nothing alike. Sniffing the shape means a key pasted from
// either half of TMDb's settings page works, instead of failing with an
// opaque 401.
function authFor(key: string): { headers: HeadersInit; query: string } {
  const isV4 = key.startsWith("eyJ"); // a JWT
  return isV4
    ? { headers: { Authorization: `Bearer ${key}` }, query: "" }
    : { headers: {}, query: `api_key=${encodeURIComponent(key)}` };
}

/* ------------------------------------------------------------------
   NORMALIZATION
   Loose enough that a real title survives punctuation and accents,
   tight enough that an invented title cannot slip through on a
   near-miss. Deliberately does NOT strip articles: "The Fall" and
   "Fall" are different films.
------------------------------------------------------------------- */
export function normalizeTitle(raw: string): string {
  return (raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // diacritics
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function yearOf(dateStr: unknown): number | null {
  if (typeof dateStr !== "string" || dateStr.length < 4) return null;
  const y = Number(dateStr.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

// Year ±1. An item with no year (the snap lane never has one) matches on
// title alone; a TMDb row with no date does not disqualify a title match
// (real entries sometimes lack a release date).
function matchesYear(itemYear: number | null | undefined, rowYear: number | null): boolean {
  if (itemYear == null) return true;
  if (rowYear == null) return true;
  return Math.abs(rowYear - itemYear) <= 1;
}

/* ------------------------------------------------------------------
   CACHE — per process. Serverless instances are short-lived, so this
   mostly pays inside one request batch and across a warm lambda's
   requests. Bounded so a long-lived instance cannot grow without limit.
------------------------------------------------------------------- */
type CacheEntry = { verdict: VerifyVerdict; at: number };
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map<string, CacheEntry>();

const cacheKey = (item: VerifyItem): string =>
  `${item.kind ?? "any"}|${normalizeTitle(item.title)}|${item.year ?? ""}`;

function cacheGet(item: VerifyItem): VerifyVerdict | null {
  const hit = cache.get(cacheKey(item));
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(cacheKey(item));
    return null;
  }
  return hit.verdict;
}

function cacheSet(item: VerifyItem, verdict: VerifyVerdict): void {
  // A lookup failure is a statement about the network, not about the
  // title — never cache it, or one blip poisons the title for six hours.
  if (verdict.reason === "lookup_failed") return;
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(cacheKey(item), { verdict, at: Date.now() });
}

/* ------------------------------------------------------------------
   ONE LOOKUP
------------------------------------------------------------------- */
type TmdbRow = {
  title?: string;
  original_title?: string;
  name?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
};

type SearchOutcome =
  | { ok: true; rows: TmdbRow[] }
  | { ok: false };

async function searchOnce(
  path: "movie" | "tv",
  query: string,
  key: string
): Promise<SearchOutcome> {
  const { headers, query: auth } = authFor(key);
  // Searched WITHOUT a year filter on purpose: TMDb's own year params
  // filter strictly, and the ±1 window is ours to apply. Asking broadly
  // and matching locally keeps the rule in one place.
  const params = [
    `query=${encodeURIComponent(query)}`,
    "include_adult=false",
    "page=1",
    auth,
  ]
    .filter(Boolean)
    .join("&");
  const url = `https://api.themoviedb.org/3/search/${path}?${params}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) {
      // A 401/429/5xx is a statement about US or about TMDb, never about
      // the title. Transport failure, not a verdict.
      console.warn("[fake-title] tmdb lookup non-OK", {
        path,
        status: res.status,
      });
      return { ok: false };
    }
    const data = (await res.json()) as { results?: TmdbRow[] };
    return { ok: true, rows: Array.isArray(data?.results) ? data.results : [] };
  } catch (err) {
    console.warn("[fake-title] tmdb lookup threw", {
      path,
      name: err instanceof Error ? err.name : undefined,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

async function searchWithRetry(
  path: "movie" | "tv",
  query: string,
  key: string
): Promise<SearchOutcome> {
  for (let attempt = 0; attempt <= TRANSPORT_RETRIES; attempt++) {
    const out = await searchOnce(path, query, key);
    if (out.ok) return out;
  }
  return { ok: false };
}

function rowMatches(row: TmdbRow, path: "movie" | "tv", wanted: string) {
  const a = normalizeTitle(path === "movie" ? row.title ?? "" : row.name ?? "");
  const b = normalizeTitle(
    path === "movie" ? row.original_title ?? "" : row.original_name ?? ""
  );
  const titleHit = (a && a === wanted) || (b && b === wanted);
  const rowYear = yearOf(path === "movie" ? row.release_date : row.first_air_date);
  return { titleHit, rowYear };
}

async function verifyOne(item: VerifyItem, key: string): Promise<VerifyVerdict> {
  const wanted = normalizeTitle(item.title);
  if (!wanted) return { title: item.title, resolved: false, reason: "empty_title" };

  const cached = cacheGet(item);
  if (cached) return cached;

  const kind = item.kind ?? "any";
  const paths: ("movie" | "tv")[] =
    kind === "movie" ? ["movie"] : kind === "tv" ? ["tv"] : ["movie", "tv"];

  let anyTransportFailure = false;
  let titleHitWrongYear = false;

  for (const path of paths) {
    const out = await searchWithRetry(path, item.title, key);
    if (!out.ok) {
      anyTransportFailure = true;
      continue;
    }
    for (const row of out.rows) {
      const { titleHit, rowYear } = rowMatches(row, path, wanted);
      if (!titleHit) continue;
      if (matchesYear(item.year, rowYear)) {
        const verdict: VerifyVerdict = {
          title: item.title,
          resolved: true,
          tmdbYear: rowYear,
        };
        cacheSet(item, verdict);
        return verdict;
      }
      titleHitWrongYear = true;
    }
  }

  // Order matters. A transport failure is not evidence of fabrication, so
  // it is reported as itself even when another path returned rows.
  if (anyTransportFailure) {
    const verdict: VerifyVerdict = {
      title: item.title,
      resolved: !DROP_ON_LOOKUP_FAILURE,
      reason: "lookup_failed",
    };
    return verdict; // never cached
  }

  const verdict: VerifyVerdict = {
    title: item.title,
    resolved: false,
    reason: titleHitWrongYear ? "year_mismatch" : "no_match",
  };
  cacheSet(item, verdict);
  return verdict;
}

/* ------------------------------------------------------------------
   THE ENTRY POINT
------------------------------------------------------------------- */
export type VerifyOutcome = {
  // False when TMDB_API_KEY is absent: the guard is DISABLED, every title
  // passes, and the caller logs it loudly. A missing key is a deployment
  // problem, not a reason to ship the user an empty app — but it is never
  // allowed to be quiet (envCheck + /api/health + the log line here).
  enabled: boolean;
  verdicts: VerifyVerdict[];
};

export async function verifyTitles(items: VerifyItem[]): Promise<VerifyOutcome> {
  const key = process.env.TMDB_API_KEY?.trim();
  if (!key) {
    return {
      enabled: false,
      verdicts: items.map((i) => ({
        title: i.title,
        resolved: true,
        reason: "disabled" as const,
      })),
    };
  }
  if (items.length === 0) return { enabled: true, verdicts: [] };

  // Bounded pool: each worker pulls the next index until the list is done.
  const verdicts: VerifyVerdict[] = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      verdicts[i] = await verifyOne(items[i], key);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker)
  );

  return { enabled: true, verdicts };
}

/* ------------------------------------------------------------------
   THE TRIPWIRE (charter §2.4 / §3.7)
   One log shape for every path, always naming the ANCHOR that produced
   the fiction — that is the field-debuggable half: "which snap invented
   these?"
------------------------------------------------------------------- */
export function logFakeTitles(args: {
  path: "search" | "search-freshness" | "mlt" | "search-backfill" | "snap" | "snap-backfill" | "chain";
  anchor: string;
  category?: string;
  dropped: { title: string; reason?: VerifyReason }[];
  kept: number;
  enabled: boolean;
}): void {
  if (!args.enabled) {
    console.warn("[fake-title] VERIFICATION DISABLED — TMDB_API_KEY missing", {
      path: args.path,
      anchor: args.anchor,
      shipped: args.kept,
    });
    return;
  }
  if (args.dropped.length === 0) return;
  console.warn("[fake-title] dropped unresolved media titles", {
    path: args.path,
    anchor: args.anchor,
    category: args.category,
    kept: args.kept,
    dropped: args.dropped.map((d) => `${d.title} (${d.reason ?? "unknown"})`),
  });
}
