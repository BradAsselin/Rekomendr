/* ------------------------------------------------------------------
   Rekomendr Engine – V2 (with Intent Persistence – Phase 1)
   - Category-aware pools via /api/recs?category=
   - Supports both "Movies|Comedy|text" AND "Movies||Comedy||text" formats
   - Starter decks (Deer Trails) + safe fallbacks
   - Vibe Play: clarifier = "vibe:<name>" → starterDeckId
   - Pool exhaustion safety valve (soft reset per category)
   - Per-tile vibe tags: rek.vibeTags?: string[]
   - Tier progression bias: rek.tier?: "T1" | "T2" | "T3"

   ✅ NEW (Phase 1): Intent Persistence
   - Engine stores last intent per category (clarifier + typed text + deck/tag)
   - Backfill and +MoreLikeThis use that intent to prevent lane drift

   ✅ FIX: Robust genre tokenization
   - Split genre strings on bullets, commas, pipes, slashes, etc.
------------------------------------------------------------------- */

import { getTop5FromDeck } from "./deckSelector";

/**
 * Feature flag
 * true  = Starter Decks (Deer Trails)
 * false = AI-only (V1 behavior)
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

  // per-tile vibe tags (navigation-only, 1–2)
  vibeTags?: string[];

  // tier progression (trust → refined → discovery)
  tier?: "T1" | "T2" | "T3";
}

export type Category = "Movies" | "TV Shows" | "Books" | "Wine";

/* ------------------------------------------------------------------
   SESSION-LEVEL MEMORY (NO REPEATS PER SESSION, PER CATEGORY)
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

/* ------------------------------------------------------------------
   ✅ INTENT PERSISTENCE (PHASE 1)
------------------------------------------------------------------- */
type Intent = {
  category: Category;
  clarifier: string; // raw clarifier string (may be "vibe:...")
  text: string; // typed query text (e.g., "sports")
  deckId: string | null; // if locked vibe maps to a deck
  vibeTag: string | null; // if vibe:<X> is NOT a locked vibe, treat as tag branch
  isVibeClarifier: boolean; // startsWith("vibe:")
};

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
   ✅ TIER PROGRESSION (TRUST → REFINED → DISCOVERY)
   - Pure bias helper. Never hard-filters.
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

/* ------------------------------------------------------------------
   TAG FROM CLARIFIER (vibe:<tag>) IF NOT A LOCKED VIBE
------------------------------------------------------------------- */
function tagFromClarifier(clarifier: string): string | null {
  const c = (clarifier || "").trim();
  if (!c) return null;
  if (!c.toLowerCase().startsWith("vibe:")) return null;

  const name = c.slice(5).trim();
  if (!name) return null;
  if (VIBE_TO_DECK[name]) return null; // locked vibe => deck path, not tag branch
  return name;
}

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

/* ------------------------------------------------------------------
   QUERY PARSE (SUPPORTS "|" AND "||")
------------------------------------------------------------------- */
function parseRawQuery(rawQuery: string): {
  category: Category;
  clarifier: string;
  text: string;
  context: string;
} {
  const q = (rawQuery ?? "").trim();
  const parts = q.includes("||") ? q.split("||") : q.split("|");

  const rawCategory = (parts[0] ?? "Movies").trim();
  const clarifier = (parts[1] ?? "").trim();
  const text = (parts[2] ?? "").trim();

  const c = rawCategory.toLowerCase();
  let category: Category = "Movies";
  if (c === "tv" || c === "tv shows" || c === "tv show") category = "TV Shows";
  if (c === "books" || c === "book") category = "Books";
  if (c === "wine" || c === "wines") category = "Wine";

  const context = [
    `Vertical: ${category}`,
    clarifier ? `Clarifier: ${clarifier}` : "",
    text ? `User text: ${text}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  return { category, clarifier, text, context };
}

/* ------------------------------------------------------------------
   FETCH FULL POOL (CATEGORY-AWARE)
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
   NORMALIZATION
------------------------------------------------------------------- */
function normalize(list: Rek[]): Rek[] {
  return list.map((r) => ({
    ...r,
    isFavorite: r.isFavorite ?? false,
    trailerUrl:
      r.trailerUrl ||
      `https://www.youtube.com/results?search_query=${encodeURIComponent(
        r.title + " trailer"
      )}`,
  }));
}

/* ------------------------------------------------------------------
   ✅ ROBUST GENRE TOKENIZATION (FIXES DRIFT)
------------------------------------------------------------------- */
function tokensFromGenre(genre?: string): string[] {
  return (genre ?? "")
    .toLowerCase()
    // normalize separators into commas
    .replace(/[•|/]+/g, ",")
    .replace(/\s*&\s*/g, ",")
    // also split on commas
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/* ------------------------------------------------------------------
   CLARIFIER FILTER (data-only enforcement, graceful fallback)
------------------------------------------------------------------- */
function applyClarifierFilter(pool: Rek[], clarifier: string): Rek[] {
  const c = (clarifier || "").trim().toLowerCase();
  if (!c) return pool;

  const filtered = pool.filter((r) => tokensFromGenre(r.genre).includes(c));
  return filtered.length >= 5 ? filtered : pool;
}

/* ------------------------------------------------------------------
   TEXT (TYPED) INTENT FILTER (SOFT, FAILS OPEN)
------------------------------------------------------------------- */
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

  // require at least 1 token hit
  return tokens.some((t) => hay.includes(t));
}

function applyIntentFilters(pool: Rek[], intent: Intent | null): Rek[] {
  if (!intent) return pool;

  // Tag branch (hardest constraint, but fail-open)
  if (intent.vibeTag) {
    const tagged = pool.filter((r) => hasVibeTag(r, intent.vibeTag!));
    if (tagged.length >= 5) return tagged;
    // if too small, fail open to full pool
  }

  // Clarifier (non-vibe)
  if (!intent.isVibeClarifier && intent.clarifier) {
    return applyClarifierFilter(pool, intent.clarifier);
  }

  // Vibe-deck clarifier: do NOT apply clarifier filter (vibe is not a genre)
  return pool;
}

/* ------------------------------------------------------------------
   AI SELECTS TITLES ONLY (V1 FALLBACK)
------------------------------------------------------------------- */
async function getAITop5Titles(
  pool: Rek[],
  context: string,
  sessionSeen: Set<string>
): Promise<string[] | null> {
  try {
    const availableTitles = pool
      .filter((r) => !sessionSeen.has(r.title))
      .map((r) => r.title);

    if (availableTitles.length < 5) return null;

    const prompt = `
You are a taste-based recommendation engine.

User context:
"${context}"

Available titles:
${availableTitles.join(", ")}

Rules:
- Select EXACTLY 5 titles
- Only from the list above
- No repeats
- Respond ONLY with a valid JSON array

Example:
["A","B","C","D","E"]
`;

    const res = await fetch("/api/openai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    const raw = await res.text();
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return Array.isArray(parsed) && parsed.length === 5 ? parsed : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------
   COHESION HELPERS (Top-5 feel)
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
  pool: any[];
  usedTitles: Set<string>;
  anchorHint: any | null;
  preferGenre: string | null;
}): any[] {
  const { pool, usedTitles, anchorHint, preferGenre } = args;

  const candidates = pool.filter((r) => r?.title && !usedTitles.has(r.title));
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

  const picked: any[] = [anchor];
  for (const s of scored) {
    if (picked.length >= 5) break;
    picked.push(s.r);
  }

  return picked.slice(0, 5);
}

/* ------------------------------------------------------------------
   ✅ PER-TILE TAG BRANCH (DETERMINISTIC)
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
    (r) => hasVibeTag(r, tag) && !sessionSeen.has(r.title)
  );
  if (tagged.length === 0) return [];

  const used = new Set<string>();
  sessionSeen.forEach((t) => used.add(t));

  let picked = pickCohesiveFive({
    pool: tagged,
    usedTitles: used,
    anchorHint: null,
    preferGenre: null,
  }) as Rek[];

  if (picked.length < 5) {
    const usedNow = new Set<string>(picked.map((r) => r.title));
    const filler = pool.filter(
      (r) => !sessionSeen.has(r.title) && !usedNow.has(r.title)
    );
    picked = [...picked, ...filler].slice(0, 5);
  }

  if (picked.length === 0) return [];
  picked.forEach((r) => sessionSeen.add(r.title));
  return normalize(picked);
}

/* ------------------------------------------------------------------
   PRIMARY ENTRY
------------------------------------------------------------------- */
export async function getTop5FromEngine({
  rawQuery,
  starterDeckId = "comfort-core",
}: {
  rawQuery: string;
  starterDeckId?: string;
}): Promise<Rek[]> {
  const { category, clarifier, text, context } = parseRawQuery(rawQuery);
  const sessionSeen = getSessionSeen(category);

  const pool = await fetchPool(category);

  const isVibeClarifier = (clarifier || "")
    .trim()
    .toLowerCase()
    .startsWith("vibe:");

  const deckId = deckFromClarifier(clarifier);
  const vibeTag = tagFromClarifier(clarifier);

  // ✅ Store intent for this category so +MoreLikeThis/backfill obey it
  setLastIntent({
    category,
    clarifier,
    text,
    deckId: deckId ?? null,
    vibeTag,
    isVibeClarifier,
  });

  // Start with raw pool, then apply intent filters (tag/clarifier)
  const poolForSelection = applyIntentFilters(pool, getLastIntent(category));

  // If typed text exists, bias selection to it (fails open)
  const textTokens = tokenizeText(text);
  const textFiltered =
    textTokens.length > 0
      ? poolForSelection.filter((r) => matchesTextIntent(r, textTokens))
      : poolForSelection;

  const finalPoolForSelection =
    textTokens.length > 0 && textFiltered.length >= 5
      ? textFiltered
      : poolForSelection;

  /* ------------------ TAG BRANCH (vibe:<tag>) ------------------ */
  if (vibeTag) {
    const tagged = finalPoolForSelection.filter(
      (r) => hasVibeTag(r, vibeTag) && !sessionSeen.has(r.title)
    );

    if (tagged.length > 0) {
      const used = new Set<string>();
      sessionSeen.forEach((t) => used.add(t));

      let picked = pickCohesiveFive({
        pool: tagged,
        usedTitles: used,
        anchorHint: null,
        preferGenre: null,
      }) as Rek[];

      if (picked.length < 5) {
        const usedNow = new Set<string>(picked.map((r) => r.title));
        const filler = pool.filter(
          (r) => !sessionSeen.has(r.title) && !usedNow.has(r.title)
        );
        picked = [...picked, ...filler].slice(0, 5);
      }

      if (picked.length > 0) {
        picked.forEach((r) => sessionSeen.add(r.title));
        return normalize(picked);
      }
    }
  }

  /* ------------------ V2: STARTER DECK PATH ------------------ */
  if (USE_DEER_TRAILS) {
    const chosenDeckId = deckId ?? starterDeckId;
    const fromDeck = getTop5FromDeck(chosenDeckId, finalPoolForSelection, sessionSeen);
    if (fromDeck.length === 5) return normalize(fromDeck);
  }

  /* ------------------ V1: AI FALLBACK ------------------ */
  const aiTitles = await getAITop5Titles(finalPoolForSelection, context, sessionSeen);
  if (aiTitles) {
    const chosen = aiTitles
      .map((t) => finalPoolForSelection.find((r) => r.title === t))
      .filter(Boolean) as Rek[];

    if (chosen.length === 5) {
      chosen.forEach((r) => sessionSeen.add(r.title));
      return normalize(chosen);
    }
  }

  /* ------------------ HARD FALLBACK (COHESIVE + TIER BIAS) ------------------ */
  const usedTitles = new Set<string>();
  sessionSeen.forEach((t) => usedTitles.add(t));

  const candidates = finalPoolForSelection.filter((r) => !usedTitles.has(r.title));

  const tierAnchor =
    pickWithTierBias({ candidates, sessionSeenCount: sessionSeen.size }) ?? null;

  let fallback = pickCohesiveFive({
    pool: finalPoolForSelection,
    usedTitles,
    anchorHint: tierAnchor,
    preferGenre: null,
  });

  // Safety valve: if we can't make 5, soft-reset and try once
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
    const anyUnseen = finalPoolForSelection.filter((r) => !sessionSeen.has(r.title));
    fallback = [...fallback, ...anyUnseen].slice(0, 5);
  }

  fallback.forEach((r) => sessionSeen.add(r.title));
  return normalize(fallback as Rek[]);
}

/* ------------------------------------------------------------------
   BACKFILL (NO AUTO-RESET — LET UI HANDLE EXHAUSTION)
   ✅ obeys last intent for that category
------------------------------------------------------------------- */
export async function getBackfillRek(args: {
  current: Rek[];
  category?: string;
  vertical?: string;
  rawCategory?: string;
  [key: string]: any;
}): Promise<Rek | null> {
  const current = args.current ?? [];
  const rawCategory =
    args.category || args.vertical || args.rawCategory || "Movies";

  const { category } = parseRawQuery(`${rawCategory}||`);
  const sessionSeen = getSessionSeen(category);

  const pool = await fetchPool(category);

  const intent = getLastIntent(category);
  const filteredPool = applyIntentFilters(pool, intent);

  const textTokens = tokenizeText(intent?.text ?? "");
  const textFiltered =
    textTokens.length > 0
      ? filteredPool.filter((r) => matchesTextIntent(r, textTokens))
      : filteredPool;

  const poolForBackfill =
    textTokens.length > 0 && textFiltered.length >= 5 ? textFiltered : filteredPool;

  const used = new Set<string>();
  current.forEach((r) => used.add(r.title));
  sessionSeen.forEach((title) => used.add(title));

  const unseenCandidates = poolForBackfill.filter((r) => !used.has(r.title));
  if (unseenCandidates.length === 0) return null;

  const candidate =
    pickWithTierBias({
      candidates: unseenCandidates,
      sessionSeenCount: sessionSeen.size,
    }) ?? unseenCandidates[0];

  sessionSeen.add(candidate.title);
  return normalize([candidate])[0];
}

/* ------------------------------------------------------------------
   + MORE LIKE THIS (NO AUTO-RESET — LET UI HANDLE EXHAUSTION)
   ✅ obeys last intent for that category
------------------------------------------------------------------- */
export async function getMoreLikeThisSet(args: {
  seed: Rek;
  category?: string;
  [key: string]: any;
}): Promise<Rek[]> {
  const seed = args.seed;
  const rawCategory = args.category || "Movies";
  const { category } = parseRawQuery(`${rawCategory}||`);
  const sessionSeen = getSessionSeen(category);

  const pool = await fetchPool(category);

  const intent = getLastIntent(category);
  const filteredPool = applyIntentFilters(pool, intent);

  // Apply typed text bias if present (sports, etc.)
  const textTokens = tokenizeText(intent?.text ?? "");
  const textFiltered =
    textTokens.length > 0
      ? filteredPool.filter((r) => matchesTextIntent(r, textTokens))
      : filteredPool;

  const poolForSet =
    textTokens.length > 0 && textFiltered.length >= 5 ? textFiltered : filteredPool;

  // If we're in a locked vibe deck lane, prefer staying on that deck
  // (This is the simplest “stay in vibe lane” enforcement without touching UI.)
  if (USE_DEER_TRAILS && intent?.deckId) {
    const fromDeck = getTop5FromDeck(intent.deckId, poolForSet, sessionSeen);
    if (fromDeck.length === 5) return normalize(fromDeck);
    // fail open to similarity below
  }

  // Similarity: seed genre tokens (now robust)
  const seedGenres = tokensFromGenre(seed.genre);
  const seedGenreSet = new Set(seedGenres);

  let matches: Rek[] = [];

  if (seedGenres.length) {
    const genreMatches = poolForSet.filter((r) => {
      if (sessionSeen.has(r.title)) return false;
      const g = tokensFromGenre(r.genre);
      return g.some((x) => seedGenreSet.has(x));
    });

    const used = new Set(matches.map((r) => r.title));
    for (const r of genreMatches) {
      if (matches.length >= 5) break;
      if (!used.has(r.title)) {
        matches.push(r);
        used.add(r.title);
      }
    }
  }

  // Fallback within intent-filtered pool (NOT full pool)
  if (matches.length < 5) {
    const anyUnseen = poolForSet.filter((r) => !sessionSeen.has(r.title));
    const used = new Set(matches.map((r) => r.title));
    for (const r of anyUnseen) {
      if (matches.length >= 5) break;
      if (!used.has(r.title)) {
        matches.push(r);
        used.add(r.title);
      }
    }
  }

  const result = matches.slice(0, 5);
  if (result.length === 0) return [];

  result.forEach((r) => sessionSeen.add(r.title));
  return normalize(result);
}
