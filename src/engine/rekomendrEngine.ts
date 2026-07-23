/* ------------------------------------------------------------------
   Rekomendr Engine – V1 Magic Hybrid
   - Pool / Deer Trails for the Play button (the sole mode:pool surface)
   - Full AI generation for discovery mode
   - Intent persistence so AI follows the user's path
   - +MoreLikeThis is a deliberate act: always AI, and it flips the
     category session to AI mode; thumbs backfill follows session mode
   - AI failures surface honestly — no silent fail-open to the pool

   Philosophy:
   - Play button = fast, deterministic, safe
   - Any deliberate act = full AI discovery
   - Once AI mode is active for a category, refinements stay AI-driven
     (pool returns only via another Play press)
------------------------------------------------------------------- */

import { getTop5FromDeck } from "./deckSelector";
import { buildCompassTop5FromDeck } from "./compass/compassPick";
import { rankMovieCandidates } from "./movieProfileScorer";

/**
 * Feature flag
 * true  = Starter Decks (Deer Trails) for pool mode
 * false = always skip decks and use fallback pool logic
 */
const USE_DEER_TRAILS = true;

/* ------------------------------------------------------------------
   TYPES
------------------------------------------------------------------- */
export interface Rek {
  id: number;
  title: string;
  year: number;
  short: string;
  long: string;
  trailerUrl?: string;
  genre?: string;
  isFavorite?: boolean;
  vibeTags?: string[];
  tier?: "T1" | "T2" | "T3";
}

export type Category = "Movies" | "TV Shows" | "Books" | "Wine";
type IntentMode = "pool" | "ai";

type Intent = {
  category: Category;
  clarifier: string;
  text: string;
  deckId: string | null;
  vibeTag: string | null;
  isVibeClarifier: boolean;
  mode: IntentMode;
};

/* ------------------------------------------------------------------
   FEATURE TOGGLES / CONSTANTS
------------------------------------------------------------------- */
const MAX_AI_ITEMS = 6;
// Backfill keeps only the first unseen item. The old narrow ask (2) starved
// tight lanes ("crime"): the seen-filter routinely ate the whole batch and
// the slot silently stayed empty (RC-3). Request 5 and take what survives —
// still one slot filled, but the filter can't zero out the batch as easily.
const MAX_AI_BACKFILL_OPTIONS = 5;

/* ------------------------------------------------------------------
   SESSION-LEVEL MEMORY
------------------------------------------------------------------- */
const sessionSeenByCategory: Record<Category, Set<string>> = {
  Movies: new Set(),
  "TV Shows": new Set(),
  Books: new Set(),
  Wine: new Set(),
};

function getSessionSeen(category: Category): Set<string> {
  return sessionSeenByCategory[category];
}

// sessionSeen stores normalized (trimmed, lowercased) title keys — always
// add and check through seenKey so formatting differences between AI-generated
// and pool titles can't slip an already-shown title back through.
// deckSelector (normalizeTitle) and compassPick mirror this normalization.
function seenKey(title: string): string {
  return (title ?? "").trim().toLowerCase();
}

const lastIntentByCategory: Record<Category, Intent | null> = {
  Movies: null,
  "TV Shows": null,
  Books: null,
  Wine: null,
};

function setLastIntent(intent: Intent) {
  lastIntentByCategory[intent.category] = intent;
}

function getLastIntent(category: Category): Intent | null {
  return lastIntentByCategory[category] ?? null;
}

/* ------------------------------------------------------------------
   GENERATED ID HELPERS
------------------------------------------------------------------- */
let generatedIdCounter = -1;

function nextGeneratedId(): number {
  return generatedIdCounter--;
}

/* ------------------------------------------------------------------
   TIER PROGRESSION
------------------------------------------------------------------- */
type Tier = "T1" | "T2" | "T3";

function tierWeights(sessionSeenCount: number) {
  if (sessionSeenCount <= 10) return { T1: 0.7, T2: 0.3, T3: 0.0 };
  if (sessionSeenCount <= 35) return { T1: 0.2, T2: 0.7, T3: 0.1 };
  return { T1: 0.1, T2: 0.5, T3: 0.4 };
}

function pickTier(w: { T1: number; T2: number; T3: number }): Tier {
  const r = Math.random();
  if (r < w.T1) return "T1";
  if (r < w.T1 + w.T2) return "T2";
  return "T3";
}

function pickWithTierBias(args: {
  candidates: Rek[];
  sessionSeenCount: number;
}): Rek | null {
  const { candidates, sessionSeenCount } = args;
  if (!candidates.length) return null;

  const weights = tierWeights(sessionSeenCount);
  const preferred = pickTier(weights);

  const tiered = candidates.filter((r) => r.tier === preferred);
  const bucket = tiered.length > 0 ? tiered : candidates;
  return bucket[Math.floor(Math.random() * bucket.length)] ?? null;
}

/* ------------------------------------------------------------------
   VIBE → STARTER DECK MAP (LOCKED 12 VIBES)
------------------------------------------------------------------- */
const VIBE_TO_DECK: Record<string, string> = {
  "Comfort Watch": "comfort-core",
  "Goofy / Silly Fun": "goofy-fun",
  "Feel-Good Crowd Pleaser": "feelgood-crowd",
  "Smart & Witty": "smart-witty",
  "Romantic / Heartfelt": "romantic-heartfelt",
  "Dark & Twisty": "dark-twisty",
  "Suspense / Edge-of-Seat": "edge-seat",
  "Epic / Immersive": "epic-immersive",
  "Action / Adrenaline": "action-adrenaline",
  "Thought-Provoking / Meaningful": "thoughtful-meaningful",
  "Weird / Offbeat": "weird-offbeat",
  "Documentary / Real Stories": "doc-real",
};

function deckFromClarifier(clarifier: string): string | null {
  const c = (clarifier || "").trim();
  if (!c) return null;

  if (c.toLowerCase().startsWith("vibe:")) {
    const vibeName = c.slice(5).trim();
    return VIBE_TO_DECK[vibeName] ?? null;
  }

  return null;
}

function tagFromClarifier(clarifier: string): string | null {
  const c = (clarifier || "").trim();
  if (!c) return null;
  if (!c.toLowerCase().startsWith("vibe:")) return null;

  const name = c.slice(5).trim();
  if (!name) return null;
  if (VIBE_TO_DECK[name]) return null;
  return name;
}

/* ------------------------------------------------------------------
   NORMALIZATION / TAG HELPERS
------------------------------------------------------------------- */
function normalizeTag(t: string): string {
  return (t || "")
    .trim()
    .toLowerCase()
    .replace(/[“”"']/g, "")
    .replace(/\s+/g, " ");
}

function hasVibeTag(rek: Rek, tag: string): boolean {
  if (!rek?.vibeTags?.length) return false;
  const n = normalizeTag(tag);
  return rek.vibeTags.some((x) => normalizeTag(x) === n);
}

function normalize(list: Rek[]): Rek[] {
  return list.map((r) => ({
    ...r,
    isFavorite: r.isFavorite ?? false,
    trailerUrl:
      r.trailerUrl ||
      `https://www.youtube.com/results?search_query=${encodeURIComponent(
        `${r.title} trailer`
      )}`,
  }));
}

/* ------------------------------------------------------------------
   QUERY PARSE
   Rule:
   - Pool is opt-in only: the Play button is the sole surface that tags
     mode:pool. Anything else — tagged mode:ai or untagged — routes to
     AI discovery, so nothing can drift into the canned pool.
------------------------------------------------------------------- */
function parseRawQuery(rawQuery: string): {
  category: Category;
  clarifier: string;
  text: string;
  context: string;
  mode: IntentMode;
} {
  const q = (rawQuery ?? "").trim();
  const parts = q.includes("||") ? q.split("||") : q.split("|");

  const rawCategory = (parts[0] ?? "Movies").trim();
  const clarifier = (parts[1] ?? "").trim();
  const text = (parts[2] ?? "").trim();
  const maybeMode = (parts[3] ?? "").trim().toLowerCase();

  const mode: IntentMode = maybeMode === "mode:pool" ? "pool" : "ai";

  const c = rawCategory.toLowerCase();
  let category: Category = "Movies";
  if (c === "tv" || c === "tv shows" || c === "tv show") category = "TV Shows";
  if (c === "books" || c === "book") category = "Books";
  if (c === "wine" || c === "wines") category = "Wine";

  const context = [
    `Vertical: ${category}`,
    clarifier ? `Lane/Clarifier: ${clarifier}` : "",
    text ? `User text: ${text}` : "",
    `Mode: ${mode}`,
  ]
    .filter(Boolean)
    .join(" | ");

  return { category, clarifier, text, context, mode };
}

/* ------------------------------------------------------------------
   FETCH FULL POOL
------------------------------------------------------------------- */
async function fetchPool(category: string): Promise<Rek[]> {
  const c = (category || "").trim().toLowerCase();
  const canonical =
    c === "tv shows" || c === "tv show"
      ? "TV"
      : c === "tv"
      ? "TV"
      : c === "movies"
      ? "Movies"
      : c === "books"
      ? "Books"
      : c === "wine" || c === "wines"
      ? "Wine"
      : "Movies";

  const url = `/api/recs?category=${encodeURIComponent(canonical)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch reks pool (${canonical})`);
  return (await res.json()) as Rek[];
}

/* ------------------------------------------------------------------
   ROBUST GENRE TOKENIZATION
------------------------------------------------------------------- */
function tokensFromGenre(genre?: string): string[] {
  return (genre ?? "")
    .toLowerCase()
    .replace(/[•|/]+/g, ",")
    .replace(/\s*&\s*/g, ",")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/* ------------------------------------------------------------------
   CLARIFIER FILTER / TEXT FILTERS
------------------------------------------------------------------- */
function applyClarifierFilter(pool: Rek[], clarifier: string): Rek[] {
  const c = (clarifier || "").trim().toLowerCase();
  if (!c) return pool;

  const filtered = pool.filter((r) => tokensFromGenre(r.genre).includes(c));
  return filtered.length >= 5 ? filtered : pool;
}

function tokenizeText(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function matchesTextIntent(rek: Rek, tokens: string[]): boolean {
  if (!tokens.length) return true;

  const hay = [
    rek.title,
    String(rek.year ?? ""),
    rek.genre ?? "",
    rek.short ?? "",
    rek.long ?? "",
    Array.isArray(rek.vibeTags) ? rek.vibeTags.join(" ") : "",
  ]
    .join(" ")
    .toLowerCase();

  return tokens.some((t) => hay.includes(t));
}

function applyIntentFilters(pool: Rek[], intent: Intent | null): Rek[] {
  if (!intent) return pool;

  if (intent.vibeTag) {
    const tagged = pool.filter((r) => hasVibeTag(r, intent.vibeTag!));
    if (tagged.length >= 5) return tagged;
  }

  if (!intent.isVibeClarifier && intent.clarifier) {
    return applyClarifierFilter(pool, intent.clarifier);
  }

  return pool;
}

/* ------------------------------------------------------------------
   COHESION HELPERS
------------------------------------------------------------------- */
function tokenize(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function rekTokens(r: any): Set<string> {
  const parts: string[] = [];
  if (r?.title) parts.push(r.title);
  if (r?.genre) parts.push(r.genre);
  if (Array.isArray(r?.vibeTags)) parts.push(r.vibeTags.join(" "));
  return new Set(tokenize(parts.join(" ")));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  a.forEach((x) => {
    if (b.has(x)) inter++;
  });
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function pickCohesiveFive(args: {
  pool: Rek[];
  usedTitles: Set<string>;
  anchorHint: Rek | null;
  preferGenre: string | null;
}): Rek[] {
  const { pool, usedTitles, anchorHint, preferGenre } = args;

  const candidates = pool.filter(
    (r) => r?.title && !usedTitles.has(seenKey(r.title))
  );
  if (candidates.length === 0) return [];

  let anchor =
    (anchorHint && candidates.find((r) => r.title === anchorHint.title)) ||
    (preferGenre
      ? candidates.find(
          (r) => (r.genre || "").toLowerCase() === preferGenre.toLowerCase()
        )
      : null) ||
    candidates[0];

  const anchorTok = rekTokens(anchor);

  const scored = candidates
    .filter((r) => r.title !== anchor.title)
    .map((r) => {
      const sim = jaccard(anchorTok, rekTokens(r));
      const genreBoost =
        preferGenre &&
        (r.genre || "").toLowerCase() === preferGenre.toLowerCase()
          ? 0.03
          : 0;
      return { r, score: sim + genreBoost };
    })
    .sort((a, b) => b.score - a.score);

  const picked: Rek[] = [anchor];
  for (const s of scored) {
    if (picked.length >= 5) break;
    picked.push(s.r);
  }

  return picked.slice(0, 5);
}

/* ------------------------------------------------------------------
   AI GENERATION
   Uses /api/openai backward-compatible prompt mode.
   Returns generated Rek objects directly.
------------------------------------------------------------------- */
type GeneratedRekWire = {
  title?: string;
  year?: number | string;
  short?: string;
  long?: string;
  genre?: string;
  vibeTags?: string[];
  trailerUrl?: string;
};

function extractJsonArray(text: string): any[] | null {
  try {
    const direct = JSON.parse(text);
    if (Array.isArray(direct)) return direct;
    if (Array.isArray(direct?.results)) return direct.results;
    if (Array.isArray(direct?.recommendations)) return direct.recommendations;
  } catch {}

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]);
    if (Array.isArray(parsed)) return parsed;
  } catch {}

  return null;
}

function sanitizeGeneratedRek(item: GeneratedRekWire, category: Category): Rek | null {
  let rawTitle = String(item?.title ?? "").trim();
  if (!rawTitle) return null;

  // tolerate titles like "Prisoners (2013)" or "The Night Of [2016]"
  const yearMatch = rawTitle.match(/\((19|20)\d{2}\)|\[(19|20)\d{2}\]/);
  let extractedYear: number | null = null;

  if (yearMatch) {
    const y = yearMatch[0].replace(/[^\d]/g, "");
    const parsed = Number(y);
    if (Number.isFinite(parsed)) extractedYear = parsed;
    rawTitle = rawTitle.replace(/\s*[\(\[](?:19|20)\d{2}[\)\]]\s*/g, "").trim();
  }

  // strip numbering / bullets / quotes
  rawTitle = rawTitle
    .replace(/^\d+[\.\)\-:]\s*/, "")
    .replace(/^[-•*]\s*/, "")
    .replace(/^["“”']+|["“”']+$/g, "")
    .trim();

  if (!rawTitle) return null;

  const rawYear = Number(item?.year);
  const year =
    Number.isFinite(rawYear) && rawYear >= 1900 && rawYear <= 2100
      ? Math.round(rawYear)
      : extractedYear && extractedYear >= 1900 && extractedYear <= 2100
      ? extractedYear
      : new Date().getFullYear();

  const short = String(item?.short ?? "").trim();
  const long = String(item?.long ?? "").trim();
  const genre = String(item?.genre ?? "").trim();

  const safeShort =
    short ||
    `A ${category.toLowerCase()} recommendation chosen to match the current vibe and discovery path.`;

  const safeLong = long || safeShort;

  const vibeTags = Array.isArray(item?.vibeTags)
    ? item.vibeTags
        .map((v) => String(v).trim())
        .filter(Boolean)
        .slice(0, 3)
    : undefined;

  const trailerUrl =
    String(item?.trailerUrl ?? "").trim() ||
    `https://www.youtube.com/results?search_query=${encodeURIComponent(
      `${rawTitle} trailer`
    )}`;

  return {
    id: nextGeneratedId(),
    title: rawTitle,
    year,
    short: safeShort,
    long: safeLong,
    genre: genre || undefined,
    vibeTags,
    trailerUrl,
    tier: "T3",
    isFavorite: false,
  };
}

function buildAIPrompt(args: {
  category: Category;
  count: number;
  context: string;
  seedTitle?: string;
  likedTitles?: string[];
  dislikedTitles?: string[];
  currentTitles?: string[];
  seenTitles?: string[];
  backfill?: boolean;
}): string {
  const {
    category,
    count,
    context,
    seedTitle,
    likedTitles = [],
    dislikedTitles = [],
    currentTitles = [],
    seenTitles = [],
    backfill = false,
  } = args;

  // Only the most recent window is serialized into the prompt to stop it
  // ballooning over a long session. The full seen set is still used for
  // dedup in generateAIReks, so older titles won't be re-suggested.
  const avoidTitles = Array.from(
  new Set([...(currentTitles ?? []), ...(seenTitles ?? [])])
)
  .filter(Boolean)
  .slice(-100);

  // Long-tier spec, split by category: Movies/TV/Books earn a 3-4 sentence
  // payoff (the expanded card is the read moment — what it is, who it's
  // for, why this searcher's line points at it), under the same no-spoiler
  // rule as short. Wine keeps its original one-sentence blurb, verbatim.
  const mediaLong =
    category === "Movies" || category === "TV Shows" || category === "Books";
  const longFormat = mediaLong
    ? "3-4 sentences: the setup's concrete situation, the texture, the viewing moment it wins — deepening short's angle, setup only."
    : "One sentence explaining why it is worth watching (Rotten Tomatoes style).";
  const longRules = mediaLong
    ? `- long is EXACTLY 3-4 sentences, one job each:
  - Sentence 1: the world and the concrete situation the setup drops you into — specifics only this title has.
  - Sentence 2: the texture — pace, tone, and one vivid element (a performance, a setting, a running device) named concretely.
  - Sentence 3: the viewing situation it wins, and it MUST be phrased as a situation, not a suitability claim — start it with 'One for...', 'Save it for...', or 'Best on...' ('One for a solo weeknight', 'Save it for a slow Sunday'). NEVER 'perfect/ideal/great/made for', never a type of person ('fans of...', 'those who enjoy...').
  - Optional sentence 4: what to expect going in — honest texture (slow burn, talky, violent), the friend-warning a trailer won't give.
- long must DEEPEN the angle short established — never paraphrase or re-say short in different words.
- NO SPOILERS in long: setup only, never a twist, a turn, or an ending.
- Decision rule: if a phrase could describe half of all movies, delete it and say something only this title earns.
- BAN in any construction: 'heartwarming', 'a journey of', 'refreshing take', 'must-watch', 'a rollercoaster', 'keeps you on the edge of your seat', 'perfect for', 'fans of', 'those who enjoy', 'explores themes of', 'a testament to', 'resonates', 'ideal for', 'great for', 'lingers long after', 'stays with you'.
- RIGHT (fictional title, for shape only): 'A night-shift tollbooth operator starts finding handwritten confessions taped inside returned toll baskets and becomes obsessed with identifying the writers. It moves slowly and quietly, most of it shot inside the booth, carried by one wary, wordless lead performance. One for a solo weeknight when you want something small that sticks. Expect long silences — it trusts you to sit in them.'
- WRONG (same shape of title): 'A heartwarming journey of connection that explores themes of loneliness. A refreshing take on the mystery genre, perfect for fans of slow cinema. A must-watch that resonates long after.' (could describe five hundred films; three banned constructions; names nothing this title owns)`
    : "- long must be ONE sentence explaining why it is worth watching.";
  const longFitRule = mediaLong
    ? "- long, sentence 1 or 2, should tilt its specifics toward the searcher's line where it's natural — the same premise reads differently after a 'funny feel-good' search than after a 'dark thriller' search. Never announce the fit ('since you searched...', 'if you're looking for...'); let the chosen specifics carry it."
    : "- long = why it fits.";

  const categoryInstructions: Record<Category, string> = {
    Movies:
      "Recommend real movies only. No fake or invented films. Prefer discoverable, vibe-matching films over obvious catalog filler unless the context points there.",
    "TV Shows":
      "Recommend real TV series or limited series only. No fake or invented shows.",
    Books:
      "Recommend real books only. No fake or invented books.",
    Wine:
      "Recommend real wines, producers, regions, or bottles that are plausible and useful. Do not invent absurd fake labels.",
  };

  return `
You are Rekomendr in full AI discovery mode.

Your job:
Generate ${count} ${category} recommendations as fresh discovery picks.

Core behavior:
- The user's explicit text input is the PRIMARY signal — build recommendations around it first, then apply taste preferences as a secondary filter.
- Follow the user's path and mood, not just the literal words.
- If a seed title is provided, recommend things that feel like a smart "more like this."
- If likes/dislikes are provided, use them to refine the taste lane only after the explicit text input has been satisfied.
- Avoid repeating or returning titles already shown in this session.
- Prefer real titles/items. Do not invent fake media.
- Return ONLY a valid JSON ${backfill ? `object of the form {"results": [ ...items ]}` : "array"}. No commentary. No markdown.

Output format:
${backfill ? `{ "results": [` : "["}
  {
    "title": "Example Title",
    "year": 2014,
    "short": "Two sentences: a characterized role + their wildly specific premise, then the complication — from the SETUP only, never a twist.",
    "long": "${longFormat}",
    "genre": "Comedy • Drama",
    "vibeTags": ["Witty", "Heartfelt"],
    "trailerUrl": "https://www.youtube.com/results?search_query=Example%20Title%20trailer"
  }
${backfill ? `] }` : "]"}
Rules:
- For Movies, TV Shows, and Books: short is exactly two sentences. Sentence 1 opens with a CHARACTERIZED role — a vivid description that sets the tone ('a sneering TV weatherman', 'a couple eager to buy their first home', 'an insurance lawyer who has never lost'), NOT a proper name (names mean nothing to someone who hasn't seen it) — then the concrete premise only this movie has. Sentence 2: the complication or collision that makes it a story.
- NO SPOILERS in short: draw only from the setup — never a twist, a turn, or an ending. If the hook needs the twist, you have chosen the wrong sentence; hook from the premise instead.
- short must end on a concrete noun or stake. BANNED endings: 'leading to...' in any form ('leading to humorous and poignant situations', 'leading to unexpected romance', 'leading to a series of comedic events'), 'hilarity ensues', 'nothing will ever be the same', 'a journey of self-discovery'.
- RIGHT: 'A sneering TV weatherman is stuck living the same small-town February 2nd over and over. No consequences carry forward — except what it does to him.'
- WRONG: 'A cynical weatherman relives the same day, leading to humorous and poignant situations.' (vague premise and a banned 'leading to...' ending — says nothing this movie doesn't share with a hundred comedies)
- For Wine, short is exactly two sentences. Sentence 1 MUST open by placing the wine on dry vs. sweet, then signature notes in concrete decision words (grapefruit, grassy, oaky, buttery). Sentence 2: a concrete moment or contrast — when it shines and when it doesn't. End on a concrete noun. Never a mood, never an 'experience', never a recommendation.
- RIGHT: 'Dry and citrus-led — grapefruit and lime over a subtle grassy edge. Built for a hot afternoon more than a rich dinner.'
- WRONG: 'A crisp, refreshing white perfect for those who enjoy lighter wines.' (never places it on dry vs. sweet; perfect-for filler)
${longRules}
- write in plain English, like a smart human curator.
- avoid critic language, film-school jargon, and review-speak.
- avoid starting descriptions with "The story of..."
- prefer strong but less obvious titles over the most famous mainstream picks when possible.
${longFitRule}
- avoid repeating the same very famous titles across different searches.

Rules:
- Aim for exactly ${count} items.
- It is better to return strong real recommendations than force bad filler.
- Use plain strings only.
- year must be numeric.
- Keep the set coherent but not repetitive.
- Do not include any title from the avoid list.
- ${backfill ? "This is a single replacement/backfill moment after a thumbs action. Give the next best discoveries." : "This is a fresh recommendation set."}

Category guidance:
${categoryInstructions[category]}

User path context:
${context}

Seed title:
${seedTitle ? seedTitle : "(none)"}

Recent likes:
${likedTitles.length ? likedTitles.slice(-10).join(", ") : "(none)"}

Recent dislikes:
${dislikedTitles.length ? dislikedTitles.slice(-10).join(", ") : "(none)"}

Current visible titles:
${currentTitles.length ? currentTitles.slice(-15).join(", ") : "(none)"}

Avoid these already-used titles:
${avoidTitles.length ? avoidTitles.join(", ") : "(none)"}
`.trim();
}

async function generateAIReks(args: {
  category: Category;
  count: number;
  context: string;
  seedTitle?: string;
  likedTitles?: string[];
  dislikedTitles?: string[];
  currentTitles?: string[];
  seenTitles?: Set<string>;
  backfill?: boolean;
}): Promise<Rek[] | null> {
  const seen = new Set<string>(
    Array.from(args.seenTitles ?? []).map((t) => t.toLowerCase())
  );

  const out: Rek[] = [];
  const dedupe = new Set<string>();
  // Tripwire counters (RC-4): when a set ships short, the log below names
  // what filtered it — silent failures get named.
  let produced = 0;
  const drops = { sanitize: 0, dupe: 0, seen: 0 };

  // One generation round-trip: build the prompt, fetch, fold survivors into
  // `out`. Two passes share `out`/`dedupe`/`seen`, so a top-up can never
  // re-admit a first-pass title. Returns false on a transport/parse miss.
  const runPass = async (
    count: number,
    currentTitles: string[]
  ): Promise<boolean> => {
    const prompt = buildAIPrompt({
      category: args.category,
      count,
      context: args.context,
      seedTitle: args.seedTitle,
      likedTitles: args.likedTitles,
      dislikedTitles: args.dislikedTitles,
      currentTitles,
      seenTitles: Array.from(args.seenTitles ?? []),
      backfill: args.backfill,
    });

    // Only the backfill path runs under a hard timeout: it must stay
    // bounded — on failure the slot stays empty and the caller shows the
    // honest running-dry notice (no pool fallback exists). 10s, up from
    // 6s: the backfill ask grew from 2 items to 5 (RC-3), and the route is
    // non-streamed gpt-4o-mini whose completion time scales with output —
    // a 2-item batch fit 6s, a 5-item batch lands ~5-8s plus network, so
    // 6s would abort the very generations the larger ask exists to
    // produce. Non-backfill generations (fresh search, MLT, the top-up)
    // still run untimed, as before.
    const controller = args.backfill ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), 10000)
      : null;
    let res: Response;
    try {
      res = await fetch("/api/openai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          ...(args.backfill ? { temperature: 0.5, jsonResponse: true } : {}),
        }),
        ...(controller ? { signal: controller.signal } : {}),
      });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    if (!res.ok) return false;

    const raw = await res.text();
    const arr = extractJsonArray(raw);
    if (!arr || arr.length === 0) return false;

    produced += arr.length;
    for (const item of arr) {
      if (out.length >= args.count) break;

      const safe = sanitizeGeneratedRek(item, args.category);
      if (!safe) {
        drops.sanitize++;
        continue;
      }

      const titleKey = safe.title.toLowerCase();
      if (dedupe.has(titleKey)) {
        drops.dupe++;
        continue;
      }
      if (seen.has(titleKey)) {
        drops.seen++;
        continue;
      }

      dedupe.add(titleKey);
      out.push(safe);
    }
    return true;
  };

  try {
    await runPass(args.count, args.currentTitles ?? []);

    // RC-2 floor: ONE top-up when a non-backfill set ships short of five —
    // re-ask for exactly the shortfall, with the first pass's survivors
    // added to the avoid list (currentTitles) on top of everything seen.
    // One retry only, then ship what exists: honest-short over canned-full
    // — never pad, never loop. Backfill keeps its own economics (RC-3).
    if (!args.backfill && out.length < 5) {
      await runPass(5 - out.length, [
        ...(args.currentTitles ?? []),
        ...out.map((r) => r.title),
      ]);
    }

    // Tripwire (RC-4): name the short set — which path, what filtered it.
    if (out.length < Math.min(args.count, 5)) {
      console.warn("[short-sets] AI generation shipped short", {
        path: args.backfill ? "backfill" : "fresh/MLT",
        category: args.category,
        requested: args.count,
        shipped: out.length,
        produced,
        drops,
      });
    }

    return out.length >= 1 ? normalize(out.slice(0, args.count)) : null;
  } catch (err) {
    // Named, not silent (RC-4): transport throws and the backfill's 10s
    // abort both land here.
    console.warn("[short-sets] AI generation threw", {
      path: args.backfill ? "backfill" : "fresh/MLT",
      category: args.category,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
/* ------------------------------------------------------------------
   PER-TILE TAG BRANCH (deterministic helper retained)
------------------------------------------------------------------- */
export async function getSetFromVibeTag(args: {
  tag: string;
  category?: string;
  vertical?: string;
  rawCategory?: string;
}): Promise<Rek[]> {
  const rawCategory =
    args.category || args.vertical || args.rawCategory || "Movies";
  const { category } = parseRawQuery(`${rawCategory}||`);
  const sessionSeen = getSessionSeen(category);

  const tag = (args.tag || "").trim();
  if (!tag) return [];

  const pool = await fetchPool(category);

  const tagged = pool.filter(
    (r) => hasVibeTag(r, tag) && !sessionSeen.has(seenKey(r.title))
  );
  if (tagged.length === 0) return [];

  const used = new Set<string>();
  sessionSeen.forEach((t) => used.add(t));

  let picked = pickCohesiveFive({
    pool: tagged,
    usedTitles: used,
    anchorHint: null,
    preferGenre: null,
  });

  if (picked.length < 5) {
    const usedNow = new Set<string>(picked.map((r) => r.title));
    const filler = pool.filter(
      (r) => !sessionSeen.has(seenKey(r.title)) && !usedNow.has(r.title)
    );
    picked = [...picked, ...filler].slice(0, 5);
  }

  if (picked.length === 0) return [];
  picked.forEach((r) => sessionSeen.add(seenKey(r.title)));
  return normalize(picked);
}

/* ------------------------------------------------------------------
   PRIMARY ENTRY
------------------------------------------------------------------- */
export async function getTop5FromEngine({
  rawQuery,
  starterDeckId = "comfort-core",
  likedTitles = [],
  dislikedTitles = [],
}: {
  rawQuery: string;
  starterDeckId?: string;
  likedTitles?: string[];
  dislikedTitles?: string[];
}): Promise<Rek[]> {
  const { category, clarifier, text, context, mode } = parseRawQuery(rawQuery);
  const sessionSeen = getSessionSeen(category);

  const isVibeClarifier = (clarifier || "")
    .trim()
    .toLowerCase()
    .startsWith("vibe:");

  const deckId = deckFromClarifier(clarifier);
  const vibeTag = tagFromClarifier(clarifier);

  setLastIntent({
    category,
    clarifier,
    text,
    deckId: deckId ?? null,
    vibeTag,
    isVibeClarifier,
    mode,
  });

  /* ------------------ FULL AI DISCOVERY MODE ------------------ */
  if (mode === "ai") {
    const aiGenerated = await generateAIReks({
      category,
      count: MAX_AI_ITEMS,
      context,
      likedTitles,
      dislikedTitles,
      seenTitles: sessionSeen,
    });

    if (aiGenerated && aiGenerated.length > 0) {
      const ranked = rankMovieCandidates(aiGenerated as any, {
        activeLane: clarifier || null,
        likedTitles,
        dislikedTitles,
        moreLikeThisTitle: null,
      }) as Rek[];

      const result = ranked.slice(0, 5);

      result.forEach((r) => sessionSeen.add(seenKey(r.title)));

      return normalize(result);
    }

    // No silent fallback: a failed deliberate path reports empty and the
    // UI shows an honest failure notice. Pool is Play-only.
    console.warn("[short-sets] fresh AI search returned empty", { category });
    return [];
  }

  /* ------------------ POOL / PLAY MODE ------------------ */
  const pool = await fetchPool(category);
  const poolForSelection = applyIntentFilters(pool, getLastIntent(category));

  const textTokens = tokenizeText(text);
  const textFiltered =
    textTokens.length > 0
      ? poolForSelection.filter((r) => matchesTextIntent(r, textTokens))
      : poolForSelection;

  const finalPoolForSelection =
    textTokens.length > 0 && textFiltered.length >= 5
      ? textFiltered
      : poolForSelection;

  const compassEligible =
    category === "Movies" &&
    USE_DEER_TRAILS &&
    !!deckId &&
    sessionSeen.size === 0 &&
    mode === "pool";

  if (compassEligible) {
    const compass = buildCompassTop5FromDeck({
      deckId,
      pool: finalPoolForSelection,
      sessionSeen,
      count: 5,
    });

    if (compass.length > 0) {
      if (compass.length < 5) {
        const used = new Set<string>();
        sessionSeen.forEach((t) => used.add(t));
        compass.forEach((r) => used.add(seenKey(r.title)));

        const fillerPool = finalPoolForSelection.filter(
          (r) => !used.has(seenKey(r.title))
        );
        const fill = pickCohesiveFive({
          pool: fillerPool,
          usedTitles: new Set<string>(),
          anchorHint: compass[0] ?? null,
          preferGenre: null,
        });

        const merged = [...compass, ...fill].slice(0, 5);
        merged.forEach((r) => sessionSeen.add(seenKey(r.title)));
        return normalize(merged);
      }

      compass.forEach((r) => sessionSeen.add(seenKey(r.title)));
      return normalize(compass);
    }
  }

  if (vibeTag) {
    const tagged = finalPoolForSelection.filter(
      (r) => hasVibeTag(r, vibeTag) && !sessionSeen.has(seenKey(r.title))
    );

    if (tagged.length > 0) {
      const used = new Set<string>();
      sessionSeen.forEach((t) => used.add(t));

      let picked = pickCohesiveFive({
        pool: tagged,
        usedTitles: used,
        anchorHint: null,
        preferGenre: null,
      });

      if (picked.length < 5) {
        const usedNow = new Set<string>(picked.map((r) => r.title));
        const filler = pool.filter(
          (r) => !sessionSeen.has(seenKey(r.title)) && !usedNow.has(r.title)
        );
        picked = [...picked, ...filler].slice(0, 5);
      }

      if (picked.length > 0) {
        picked.forEach((r) => sessionSeen.add(seenKey(r.title)));
        return normalize(picked);
      }
    }
  }

  if (USE_DEER_TRAILS && mode === "pool") {
    const chosenDeckId = deckId ?? starterDeckId;
    const fromDeck = getTop5FromDeck(chosenDeckId, finalPoolForSelection, sessionSeen);
    if (fromDeck.length === 5) return normalize(fromDeck);
  }

  const usedTitles = new Set<string>();
  sessionSeen.forEach((t) => usedTitles.add(t));

  const candidates = finalPoolForSelection.filter(
    (r) => !usedTitles.has(seenKey(r.title))
  );

  const tierAnchor =
    pickWithTierBias({ candidates, sessionSeenCount: sessionSeen.size }) ?? null;

  let fallback = pickCohesiveFive({
    pool: finalPoolForSelection,
    usedTitles,
    anchorHint: tierAnchor,
    preferGenre: null,
  });

  if (fallback.length < 5) {
    sessionSeen.clear();

    const usedAfterReset = new Set<string>();
    const candidatesAfterReset = finalPoolForSelection.filter(
      (r) => !usedAfterReset.has(r.title)
    );

    const tierAnchor2 =
      pickWithTierBias({ candidates: candidatesAfterReset, sessionSeenCount: 0 }) ?? null;

    fallback = pickCohesiveFive({
      pool: finalPoolForSelection,
      usedTitles: usedAfterReset,
      anchorHint: tierAnchor2,
      preferGenre: null,
    });
  }

  if (fallback.length < 5) {
    const anyUnseen = finalPoolForSelection.filter(
      (r) => !sessionSeen.has(seenKey(r.title))
    );
    fallback = [...fallback, ...anyUnseen].slice(0, 5);
  }

  fallback.forEach((r) => sessionSeen.add(seenKey(r.title)));
  return normalize(fallback);
}

/* ------------------------------------------------------------------
   BACKFILL
   - AI session: generate fresh picks and take the first good one; on
     failure report {rek:null, exhausted:false} — never a pool fallback
   - Pool (Play) session: deterministic backfill; a drained pool reports
     {rek:null, exhausted:true} so the UI can say so honestly
------------------------------------------------------------------- */
export async function getBackfillRek(args: {
  current: Rek[];
  category?: string;
  vertical?: string;
  rawCategory?: string;
  likedTitles?: string[];
  dislikedTitles?: string[];
  lastAction?: "like" | "dislike";
  lastActionTitle?: string;
  [key: string]: any;
}): Promise<{ rek: Rek | null; exhausted: boolean }> {
  const current = args.current ?? [];
  const rawCategory =
    args.category || args.vertical || args.rawCategory || "Movies";

  const { category } = parseRawQuery(`${rawCategory}||`);
  const sessionSeen = getSessionSeen(category);
  const intent = getLastIntent(category);

  if (intent?.mode === "ai") {
    const context = [
      `Vertical: ${intent.category}`,
      intent.clarifier ? `Lane/Clarifier: ${intent.clarifier}` : "",
      intent.text ? `User text: ${intent.text}` : "",
      args.lastAction ? `Last action: ${args.lastAction}` : "",
      args.lastActionTitle ? `On: ${args.lastActionTitle}` : "",
      "Backfill request after thumbs action. Generate the next best discovery picks.",
    ]
      .filter(Boolean)
      .join(" | ");

    const aiGenerated = await generateAIReks({
      category,
      count: MAX_AI_BACKFILL_OPTIONS,
      context,
      likedTitles: args.likedTitles,
      dislikedTitles: args.dislikedTitles,
      currentTitles: current.map((r) => r.title),
      seenTitles: sessionSeen,
      backfill: true,
    });

    const chosen =
      aiGenerated?.find((r) => !sessionSeen.has(seenKey(r.title))) ?? null;
    if (chosen) {
      sessionSeen.add(seenKey(chosen.title));
      return { rek: chosen, exhausted: false };
    }
    // AI failure: report it — the caller keeps the slot empty. An AI
    // session is never backfilled from the pool.
    return { rek: null, exhausted: false };
  }

  const pool = await fetchPool(category);
  const filteredPool = applyIntentFilters(pool, intent);

  const textTokens = tokenizeText(intent?.text ?? "");
  const textFiltered =
    textTokens.length > 0
      ? filteredPool.filter((r) => matchesTextIntent(r, textTokens))
      : filteredPool;

  const poolForBackfill =
    textTokens.length > 0 && textFiltered.length >= 5 ? textFiltered : filteredPool;

  const used = new Set<string>();
  current.forEach((r) => used.add(seenKey(r.title)));
  sessionSeen.forEach((title) => used.add(title));

  const unseenCandidates = poolForBackfill.filter(
    (r) => !used.has(seenKey(r.title))
  );
  if (unseenCandidates.length === 0) return { rek: null, exhausted: true };

  const candidatePool = unseenCandidates.slice(0, 8);

  const ranked = rankMovieCandidates(candidatePool as any, {
    activeLane: null,
    likedTitles: args.likedTitles ?? [],
    dislikedTitles: args.dislikedTitles ?? [],
    moreLikeThisTitle: args.lastActionTitle ?? null,
  }) as Rek[];

  const candidate =
    ranked[0] ??
    pickWithTierBias({
      candidates: unseenCandidates,
      sessionSeenCount: sessionSeen.size,
    }) ??
    unseenCandidates[0];

  sessionSeen.add(seenKey(candidate.title));
  return { rek: normalize([candidate])[0], exhausted: false };
}

/* ------------------------------------------------------------------
   + MORE LIKE THIS
   - Always seed-aware full AI generation: the tap names a seed, which
     is a deliberate act — it flips the category session to AI mode
     (one-way; only another Play press re-enters pool).
   - Empty result = AI failure, surfaced honestly by the caller. There
     is no pool similarity fallback, so MLT can never exhaust the pool.
------------------------------------------------------------------- */
export async function getMoreLikeThisSet(args: {
  seed: Rek;
  category?: string;
  likedTitles?: string[];
  dislikedTitles?: string[];
  [key: string]: any;
}): Promise<Rek[]> {
  const seed = args.seed;
  const rawCategory = args.category || "Movies";
  const { category } = parseRawQuery(`${rawCategory}||`);
  const sessionSeen = getSessionSeen(category);

  // Promote the session: keep the prior intent's context (lane, text) as
  // flavor, but the mode is now AI — subsequent thumbs backfills follow it.
  const prior = getLastIntent(category);
  const intent: Intent = {
    category,
    clarifier: prior?.clarifier ?? "",
    text: prior?.text ?? "",
    deckId: prior?.deckId ?? null,
    vibeTag: prior?.vibeTag ?? null,
    isVibeClarifier: prior?.isVibeClarifier ?? false,
    mode: "ai",
  };
  setLastIntent(intent);

  const context = [
    `Vertical: ${intent.category}`,
    intent.clarifier ? `Lane/Clarifier: ${intent.clarifier}` : "",
    intent.text ? `User text: ${intent.text}` : "",
    "Action: +MoreLikeThis",
  ]
    .filter(Boolean)
    .join(" | ");

  const aiGenerated = await generateAIReks({
    category,
    count: MAX_AI_ITEMS,
    context,
    seedTitle: seed?.title,
    likedTitles: args.likedTitles,
    dislikedTitles: args.dislikedTitles,
    seenTitles: sessionSeen,
  });

  if (aiGenerated && aiGenerated.length > 0) {
    aiGenerated.forEach((r) => sessionSeen.add(seenKey(r.title)));
    return aiGenerated.slice(0, 5);
  }

  return [];
}


