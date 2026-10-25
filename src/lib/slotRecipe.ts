// src/lib/slotRecipe.ts — server-only. S12b: the five behind a Movies/TV
// mood chip, built from TMDb's own pools instead of the model's memory
// (docs/s12-gotos-steer-plan.md, Brad's slot recipe of 2026-10-18).
//
//   0 go-tos in the category: touchstone · touchstone · popular · WILDCARD · fresh
//   1 go-to:                  touchstone · neighbor · neighbor · WILDCARD neighbor · fresh
//   2+ go-tos (steer by the nearest):
//                             less-famous neighbor ×2 · WILDCARD neighbor · classic · new release
//
// Pools: TMDb discover for the chip's genre (and the refiner), ranked by
// vote count; tier 1 = ranks 1-50, tier 2 = 51-100, tier 3 = 101-150.
// Touchstones are the 20 most-voted of tier 1. Neighbors are the go-to's
// own TMDb web (recommendations, then similar — the bundle the typed-title
// anchor already loads). The wildcard is the slot that always reaches past
// the obvious: tier 3 with no go-to, the far end of the go-to's web with
// one. Quality floor (charter S5 defaults): vote_average ≥ 6.9 on most
// lanes, 5.0 comedy, 7.2 documentary. Anchors and go-tos are never judged.
//
// THE GUARANTEE (§2.12): every title shown this visit, every go-to, and
// everything the person watched or disliked is removed from every pool
// before a slot samples — uncapped, at this one response site. A slot
// whose pool runs dry falls through to the next pool, never to a repeat.

if (typeof window !== "undefined") {
  throw new Error("slotRecipe.ts was imported in a browser bundle.");
}

import { normalizeTitle } from "./tmdbVerify";
import {
  loadMediaBundle,
  resolveSnappedTitle,
  rowTitle,
  rowYear,
  safePosterPath,
  tmdbGet,
  type MediaBundle,
  type MediaKind,
  type Row,
  type TmdbCandidate,
} from "./tmdbMedia";

export type SlotKind =
  | "touchstone"
  | "popular"
  | "neighbor"
  | "wildcard"
  | "fresh"
  | "classic"
  | "new";

export type SlotPick = TmdbCandidate & { slot: SlotKind };

export type Refiner =
  | { kind: "tone"; vibe: string }
  | { kind: "era"; era: "classic" | "new" }
  | null;

export type GoToIn = {
  name: string;
  tmdbKind: MediaKind | null;
  tmdbId: number | null;
  at: string | null;
};

/* ------------------------------------------------------------------
   Lanes → TMDb genres. Movie and TV genre ids differ (TV has no
   Thriller, so its thriller lane is Mystery or Crime).
------------------------------------------------------------------- */
const MOVIE_GENRES: Record<string, number[]> = {
  comedy: [35], drama: [18], thriller: [53], crime: [80], action: [28],
  romance: [10749], "sci-fi": [878], horror: [27], documentary: [99],
  mystery: [9648], animation: [16], family: [10751], fantasy: [14],
};
const TV_GENRES: Record<string, number[]> = {
  comedy: [35], drama: [18], crime: [80], thriller: [9648, 80], "sci-fi": [10765],
  reality: [10764], documentary: [99], mystery: [9648], animation: [16],
  action: [10759], family: [10751],
};

const GENRE_NAMES: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
  27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Sci-Fi",
  53: "Thriller", 10752: "War", 37: "Western", 10759: "Action & Adventure",
  10762: "Kids", 10764: "Reality", 10765: "Sci-Fi & Fantasy", 10768: "War & Politics",
};

// "Comedy • Drama" — the card's genre line (the search lane's DescriptorLine).
export const genreLine = (ids: number[]): string =>
  ids.map((g) => GENRE_NAMES[g]).filter(Boolean).slice(0, 2).join(" • ");

// S13c — the lanes the recipe can build a pool for (the voice parser's
// vocabulary for screens: the chip row's lanes plus the genres behind them).
export const SLOT_LANES: Record<MediaKind, string[]> = {
  movie: Object.keys(MOVIE_GENRES),
  tv: Object.keys(TV_GENRES),
};

export function laneGenres(kind: MediaKind, lane: string | null | undefined): number[] {
  const k = (lane ?? "").trim().toLowerCase();
  return (kind === "movie" ? MOVIE_GENRES : TV_GENRES)[k] ?? [];
}

// Charter S5 floor defaults (Brad may re-mark): comedy 5.0, documentary
// 7.2, horror 5.5, everything else 6.9.
export function floorFor(lane: string | null | undefined): number {
  const k = (lane ?? "").trim().toLowerCase();
  if (k === "comedy") return 5.0;
  if (k === "documentary") return 7.2;
  if (k === "horror") return 5.5;
  return 6.9;
}

// Tone refiners: genres to keep out, or a genre the title must also carry.
const DARK_ANY = { movie: [53, 80, 9648, 27], tv: [80, 9648, 10768] };
const BRIGHT_OUT = { movie: [27, 53, 10752], tv: [10768] };

type PoolSpec = {
  kind: MediaKind;
  genres: number[];
  floor: number;
  minVotes: number;
  without: number[];
  anyOf: number[] | null;
  after: string | null;
  before: string | null;
  pages: number;
  // S19a — TMDb keyword filters: AND of OR groups ("10051,6075|240"), and
  // ids to keep out.
  withKeywords?: string;
  withoutKeywords?: string;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthsAgo = (m: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - m);
  return iso(d);
};

function baseSpec(kind: MediaKind, lane: string | null, refiner: Refiner): PoolSpec {
  const genres = laneGenres(kind, lane);
  let floor = floorFor(lane);
  const without: number[] = [];
  let anyOf: number[] | null = null;
  let after: string | null = null;
  let before: string | null = null;
  // Call (logged): the chips are grown-up lanes. TMDb's most-voted comedies
  // are mostly kids' animation (Up, Ratatouille, Madagascar), so Animation
  // and Family stay out unless the lane is one of them.
  for (const g of [16, 10751, 10762]) if (!genres.includes(g)) without.push(g);
  const tone = refiner?.kind === "tone" ? refiner.vibe.toLowerCase() : "";
  if (/feel-good|comfort/.test(tone)) {
    // Bright: no horror/thriller/war — unless the lane itself is one.
    without.push(...BRIGHT_OUT[kind].filter((g) => !genres.includes(g)));
  } else if (/dark/.test(tone)) {
    anyOf = DARK_ANY[kind];
  } else if (/smart/.test(tone)) {
    floor = Math.max(floor, 7.4);
  }
  if (refiner?.kind === "era" && refiner.era === "classic") before = "1999-12-31";
  if (refiner?.kind === "era" && refiner.era === "new") after = monthsAgo(24);
  return {
    kind,
    genres,
    floor,
    minVotes: kind === "movie" ? 500 : 150,
    without,
    anyOf,
    after,
    before,
    pages: 8,
  };
}

/* ------------------------------------------------------------------
   Discover, cached per process (a warm lambda reuses it) for an hour.
------------------------------------------------------------------- */
const POOL_TTL_MS = 60 * 60 * 1000;
const POOL_MAX = 120;
const poolCache = new Map<string, { at: number; list: TmdbCandidate[] }>();

const asCandidate = (r: Row, kind: MediaKind): TmdbCandidate | null => {
  const title = rowTitle(r, kind).trim();
  const overview = (r.overview ?? "").trim();
  if (!title || !overview || r.adult) return null;
  return {
    id: r.id,
    kind,
    title,
    year: rowYear(r, kind),
    overview,
    genreIds: Array.isArray(r.genre_ids) ? r.genre_ids : [],
    votes: r.vote_count ?? 0,
    rating: r.vote_average ?? 0,
    posterPath: safePosterPath(r.poster_path),
  };
};

async function discover(spec: PoolSpec): Promise<TmdbCandidate[] | null> {
  const key = JSON.stringify(spec);
  const hit = poolCache.get(key);
  if (hit && Date.now() - hit.at < POOL_TTL_MS) return hit.list;
  const dateKey = spec.kind === "movie" ? "primary_release_date" : "first_air_date";
  const params: Record<string, string> = {
    sort_by: "vote_count.desc",
    include_adult: "false",
    language: "en-US",
    "vote_average.gte": String(spec.floor),
    "vote_count.gte": String(spec.minVotes),
  };
  if (spec.genres.length) params.with_genres = spec.genres.join("|");
  if (spec.without.length) params.without_genres = spec.without.join(",");
  if (spec.after) params[`${dateKey}.gte`] = spec.after;
  if (spec.before) params[`${dateKey}.lte`] = spec.before;
  if (spec.withKeywords) params.with_keywords = spec.withKeywords;
  if (spec.withoutKeywords) params.without_keywords = spec.withoutKeywords;
  if (spec.kind === "movie") params.with_runtime_gte = "60";
  const pages = await Promise.all(
    Array.from({ length: spec.pages }, (_, i) =>
      tmdbGet(`discover/${spec.kind}`, { ...params, page: String(i + 1) })
    )
  );
  if (pages.every((p) => !p)) return null;
  const seen = new Set<number>();
  const list: TmdbCandidate[] = [];
  for (const p of pages) {
    for (const r of (Array.isArray(p?.results) ? p.results : []) as Row[]) {
      if (!r || typeof r.id !== "number" || seen.has(r.id)) continue;
      const c = asCandidate(r, spec.kind);
      if (!c) continue;
      if (spec.anyOf && !c.genreIds!.some((g) => spec.anyOf!.includes(g))) continue;
      seen.add(r.id);
      list.push(c);
    }
  }
  list.sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));
  if (poolCache.size >= POOL_MAX) {
    const oldest = poolCache.keys().next().value;
    if (oldest !== undefined) poolCache.delete(oldest);
  }
  poolCache.set(key, { at: Date.now(), list });
  return list;
}

export type Pools = {
  tier1: TmdbCandidate[];
  tier2: TmdbCandidate[];
  tier3: TmdbCandidate[];
  touchstones: TmdbCandidate[];
  popular: TmdbCandidate[];
  fresh: TmdbCandidate[];
  classic: TmdbCandidate[];
  // S19a — a mood pool (keywords / a named reference): every title in it,
  // the last resort of every slot, and the fence neighbors stay inside.
  all?: TmdbCandidate[];
};

export async function loadPools(kind: MediaKind, lane: string | null, refiner: Refiner): Promise<Pools | null> {
  const spec = baseSpec(kind, lane, refiner);
  const era = refiner?.kind === "era" ? refiner.era : null;
  const [main, fresh, classic] = await Promise.all([
    discover(spec),
    era === "classic"
      ? Promise.resolve([] as TmdbCandidate[])
      : discover({ ...spec, after: monthsAgo(18), before: null, minVotes: kind === "movie" ? 200 : 60, pages: 3 }),
    era === "new"
      ? Promise.resolve([] as TmdbCandidate[])
      : discover({ ...spec, after: null, before: "1999-12-31", pages: 3 }),
  ]);
  if (!main) return null;
  const tier1 = main.slice(0, 50);
  return {
    tier1,
    tier2: main.slice(50, 100),
    tier3: main.slice(100, 150),
    touchstones: tier1.slice(0, 20),
    popular: tier1.slice(20),
    fresh: fresh ?? [],
    classic: classic ?? [],
  };
}

/* ------------------------------------------------------------------
   S19a — MOOD POOLS (docs/s19-fast-moods-plan.md, Part A): a typed or
   spoken mood's concrete ideas as TMDb keywords, or the title it named.
   The chip rules hold (lane genres, floor, refiner, Animation/Family out
   unless asked); the vote minimum drops to 200 / 60 because a keyword
   already narrows to the idea. The whole pool is sorted by votes and cut
   in thirds for the recipe's tiers; fresh and classic come from the same
   list. Every slot falls back to the whole pool (`all`), so a small pool
   fills five instead of shipping short. The route decides whether the
   pool is strong enough to answer at all (MIN_STRONG_POOL).
------------------------------------------------------------------- */
export const MIN_STRONG_POOL = 12;

export type MoodConcept = { ids: number[]; exclude: boolean };

function poolsFromList(list: TmdbCandidate[]): Pools {
  const sorted = [...list].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));
  const third = Math.ceil(sorted.length / 3);
  const tier1 = sorted.slice(0, third);
  const touch = Math.max(3, Math.ceil(tier1.length / 2));
  const thisYear = new Date().getFullYear();
  return {
    tier1,
    tier2: sorted.slice(third, third * 2),
    tier3: sorted.slice(third * 2),
    touchstones: tier1.slice(0, touch),
    popular: tier1.slice(touch),
    fresh: sorted.filter((c) => (c.year ?? 0) >= thisYear - 1),
    classic: sorted.filter((c) => c.year != null && c.year <= 1999),
    all: sorted,
  };
}

// A feel-good mood ("an uplifting sports movie") keeps out what TMDb tags
// as sad: measured, Million Dollar Baby (tragedy, euthanasia) and Southpaw
// (tragedy) topped the sports pool. Mood pools only; the chips are as
// they were. tragedy, tragic ending, terminal illness, euthanasia,
// cancer, depressing, death of a loved one.
const FEEL_GOOD_OUT = [10614, 368391, 6564, 206662, 10163, 323809, 241364];

// Keyword concepts → one discover (AND across concepts, OR inside one).
export async function loadMoodPools(
  kind: MediaKind,
  lane: string | null,
  refiner: Refiner,
  concepts: MoodConcept[]
): Promise<Pools | null> {
  const withK = concepts.filter((c) => !c.exclude && c.ids.length).map((c) => c.ids.join("|"));
  const withoutK = concepts.filter((c) => c.exclude).flatMap((c) => c.ids);
  const tone = refiner?.kind === "tone" ? refiner.vibe.toLowerCase() : "";
  if (/feel-good|comfort/.test(tone)) withoutK.push(...FEEL_GOOD_OUT);
  const base = baseSpec(kind, lane, refiner);
  // A keyword isn't a genre: "coming of age" also tags It (2017). Horror
  // stays out of a movie mood pool unless the lane asked for it.
  const without = kind === "movie" && !base.genres.includes(27) ? Array.from(new Set([...base.without, 27])) : base.without;
  const spec: PoolSpec = {
    ...base,
    without,
    minVotes: kind === "movie" ? 200 : 60,
    pages: 3,
    ...(withK.length ? { withKeywords: withK.join(",") } : {}),
    ...(withoutK.length ? { withoutKeywords: withoutK.join(",") } : {}),
  };
  const list = await discover(spec);
  return list ? poolsFromList(list) : null;
}

// A named reference with no keyword concept: its own web (recommendations,
// then similar), held to the same rules as a discover pool.
export function webPools(
  kind: MediaKind,
  lane: string | null,
  refiner: Refiner,
  bundle: MediaBundle | null
): Pools | null {
  if (!bundle) return null;
  const spec = baseSpec(kind, lane, refiner);
  const minVotes = kind === "movie" ? 100 : 40;
  const afterY = spec.after ? Number(spec.after.slice(0, 4)) : null;
  const beforeY = spec.before ? Number(spec.before.slice(0, 4)) : null;
  const list = bundle.candidates.filter((c) => {
    const g = c.genreIds ?? [];
    if ((c.votes ?? 0) < minVotes || (c.rating ?? 0) < spec.floor) return false;
    if (spec.genres.length && !g.some((x) => spec.genres.includes(x))) return false;
    if (g.some((x) => spec.without.includes(x))) return false;
    if (spec.anyOf && !g.some((x) => spec.anyOf!.includes(x))) return false;
    if (afterY != null && (c.year ?? 0) < afterY) return false;
    if (beforeY != null && (c.year ?? 9999) > beforeY) return false;
    return true;
  });
  return poolsFromList(list);
}

/* ------------------------------------------------------------------
   Go-tos: bundle (genres + web) per go-to; nearest by genre overlap and
   web links into the lane's pool; ties and no-signal → most recent.
------------------------------------------------------------------- */
export type LoadedGoTo = GoToIn & { bundle: MediaBundle | null };

export async function loadGoTos(kind: MediaKind, goTos: GoToIn[]): Promise<LoadedGoTo[]> {
  return Promise.all(
    goTos.slice(0, 12).map(async (g) => {
      try {
        if (g.tmdbId && (g.tmdbKind ?? kind) === kind) {
          return { ...g, bundle: await loadMediaBundle(kind, g.tmdbId) };
        }
        const hit = await resolveSnappedTitle(g.name, kind);
        return { ...g, bundle: hit ? await loadMediaBundle(hit.kind, hit.id) : null };
      } catch {
        return { ...g, bundle: null };
      }
    })
  );
}

const jaccard = (a: number[], b: number[]) => {
  if (!a.length || !b.length) return 0;
  const A = new Set(a);
  const inter = b.filter((x) => A.has(x)).length;
  return inter / (A.size + b.length - inter);
};

// Nearest first, then the rest most recent first.
export function rankGoTos(
  goTos: LoadedGoTo[],
  lane: number[],
  pools: Pools | null
): { order: LoadedGoTo[]; scores: number[] } {
  const poolIds = new Set([...(pools?.tier1 ?? []), ...(pools?.tier2 ?? [])].map((c) => c.id));
  const poolGenres = Array.from(
    new Set((pools?.tier1 ?? []).slice(0, 20).flatMap((c) => c.genreIds ?? []))
  );
  const recency = (g: LoadedGoTo) => Date.parse(g.at ?? "") || 0;
  const score = (g: LoadedGoTo) => {
    const genres = g.bundle?.genreIds ?? [];
    const laneHit = lane.length && genres.some((x) => lane.includes(x)) ? 2 : 0;
    const links = (g.bundle?.candidates ?? []).filter((c) => poolIds.has(c.id)).length;
    return laneHit + jaccard(genres, poolGenres) + Math.min(1, links / 3);
  };
  const scored = goTos.map((g) => ({ g, s: score(g) }));
  const best = [...scored].sort((a, b) => b.s - a.s || recency(b.g) - recency(a.g))[0];
  const rest = scored
    .filter((x) => x !== best)
    .sort((a, b) => recency(b.g) - recency(a.g));
  const order = best ? [best, ...rest] : [];
  return { order: order.map((x) => x.g), scores: order.map((x) => x.s) };
}

/* ------------------------------------------------------------------
   Sampling.
------------------------------------------------------------------- */
type Rand = () => number;

function sampleFrom(list: TmdbCandidate[], taken: Set<string>, rand: Rand): TmdbCandidate | null {
  const open = list.filter((c) => !taken.has(normalizeTitle(c.title)));
  if (!open.length) return null;
  return open[Math.floor(rand() * open.length)];
}

export type RecipeName = "none" | "one" | "many";

export function recipeFor(goToCount: number): RecipeName {
  return goToCount <= 0 ? "none" : goToCount === 1 ? "one" : "many";
}

export function slotsFor(recipe: RecipeName): SlotKind[] {
  if (recipe === "none") return ["touchstone", "touchstone", "popular", "wildcard", "fresh"];
  if (recipe === "one") return ["touchstone", "neighbor", "neighbor", "wildcard", "fresh"];
  return ["neighbor", "neighbor", "wildcard", "classic", "new"];
}

// The go-to's web, held to the lane's genre and the floor. A chip is a
// promise about genre, so neighbors never leave it: when the web has too
// few titles in the lane (a spy drama starred, Comedy tapped), the rest
// come from the lane's own pool, closest in genre to the go-to first.
export function neighborPool(
  goTo: LoadedGoTo | null,
  lane: number[],
  floor: number,
  pools?: Pools | null
): TmdbCandidate[] {
  const web = (goTo?.bundle?.candidates ?? []).filter((c) => (c.rating ?? 0) >= floor || (c.votes ?? 0) < 50);
  // S19a — a mood pool is a promise about the idea ("a funny heist
  // movie"): neighbors stay inside it — the go-to's web where it meets the
  // pool, then the pool's titles closest in genre to the go-to.
  if (pools?.all) {
    const ids = new Set(pools.all.map((c) => c.id));
    const inPool = (goTo?.bundle?.candidates ?? []).filter((c) => ids.has(c.id));
    if (inPool.length >= 6) return inPool;
    const have = new Set(inPool.map((c) => c.id));
    const genres = goTo?.bundle?.genreIds ?? [];
    const fill = pools.all
      .filter((c) => !have.has(c.id))
      .map((c) => ({ c, s: jaccard(genres, c.genreIds ?? []) }))
      .sort((a, b) => b.s - a.s || (b.c.votes ?? 0) - (a.c.votes ?? 0))
      .slice(0, 24)
      .map((x) => x.c);
    return [...inPool, ...fill];
  }
  if (!lane.length) return web;
  const inLane = web.filter((c) => (c.genreIds ?? []).some((g) => lane.includes(g)));
  if (inLane.length >= 6 || !pools) return inLane;
  const have = new Set(inLane.map((c) => c.id));
  const genres = goTo?.bundle?.genreIds ?? [];
  const fill = [...pools.tier1, ...pools.tier2]
    .filter((c) => !have.has(c.id))
    .map((c) => ({ c, s: jaccard(genres, c.genreIds ?? []) }))
    .sort((a, b) => b.s - a.s || (b.c.votes ?? 0) - (a.c.votes ?? 0))
    .slice(0, 24)
    .map((x) => x.c);
  return [...inLane, ...fill];
}

export function assemble(args: {
  recipe: RecipeName;
  pools: Pools;
  neighbors: TmdbCandidate[];
  excluded: Set<string>;
  count?: number;
  only?: SlotKind;
  rand?: Rand;
}): SlotPick[] {
  const rand = args.rand ?? Math.random;
  const taken = new Set(args.excluded);
  const n = args.neighbors;
  // 1 go-to: the close end of the web (TMDb's own order). 2+: one tier
  // less famous — the most-voted third is skipped. Wildcard: the far end.
  const byVotes = [...n].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));
  const close = n.slice(0, 12);
  const lessFamous = byVotes.slice(Math.ceil(byVotes.length / 3));
  const farEnd = n.slice(Math.floor(n.length / 2));
  const { pools } = args;

  const chains: Record<SlotKind, TmdbCandidate[][]> = {
    touchstone: [pools.touchstones, pools.popular],
    popular: [pools.popular, pools.tier2],
    neighbor:
      args.recipe === "many"
        ? [lessFamous, n, pools.tier2, pools.popular]
        : [close, n, pools.popular, pools.tier2],
    wildcard: args.recipe === "none" ? [pools.tier3, pools.tier2] : [farEnd, n, pools.tier3, pools.tier2],
    fresh: [pools.fresh, pools.popular, pools.tier2],
    new: [pools.fresh, pools.tier2],
    classic: [pools.classic, pools.tier2],
  };

  // S19a — a mood pool: every slot's last resort is the whole pool.
  if (pools.all) for (const k of Object.keys(chains) as SlotKind[]) chains[k].push(pools.all);

  const slots = args.only ? [args.only] : slotsFor(args.recipe);
  const out: SlotPick[] = [];
  for (const slot of slots.slice(0, args.count ?? slots.length)) {
    let pick: TmdbCandidate | null = null;
    for (const pool of chains[slot]) {
      pick = sampleFrom(pool, taken, rand);
      if (pick) break;
    }
    if (!pick) continue; // honest-short: every pool for this slot ran dry
    taken.add(normalizeTitle(pick.title));
    out.push({ ...pick, slot });
  }
  return out;
}

// shortSynopsis moved to ./synopsis (S17v: the browser engine uses it too).
export { shortSynopsis } from "./synopsis";

// "vs. your Lioness: same CIA pressure…" — the line opens lower-case when
// its first word is an ordinary word (a comparative or a verb), never when
// it might be a name.
const OPENERS =
  /^(combines|explores|features|shares|mixes|blends|follows|centers|focuses|offers|brings|turns|puts|gives|captures|delivers|has|uses|leans|goes|stays|matches|echoes|pairs|replaces|flips|swaps|trades|carries|feels|plays|sets|tells|shows|starts|ends|mirrors|contrasts|retains|maintains|transports|transforms|presents|delves|dives|steps|lands|runs|same|lighter|darker|slower|faster|funnier|quieter|louder|swaps|trades|more|less|smaller|bigger|sharper|softer|warmer|colder|gentler|grittier|sillier|stranger|weirder|bleaker|brighter|also|like|where|instead|shifts|moves|takes|keeps|drops|adds|both|another|similar|similarly|older|newer|longer|shorter|broader|tighter|heavier|wider|closer|even|just|not|a|an|here|this|it|its|with|without|but|from|set|again|equally|much|far|just)\b/i;

export function leadLine(line: string): string {
  const t = line.trim().replace(/\s+/g, " ");
  const first = t.split(" ")[0] ?? "";
  if (OPENERS.test(first)) return t.charAt(0).toLowerCase() + t.slice(1);
  return t;
}
