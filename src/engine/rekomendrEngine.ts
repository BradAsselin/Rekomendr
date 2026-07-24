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
  // The active vibe (picker string) — a TONE INSTRUCTION on the genre
  // subject, never a keyword. Rides its own query segment (vibe:), so it
  // can never collide with the user's typed text.
  vibe: string | null;
  mode: IntentMode;
};

/* ------------------------------------------------------------------
   FEATURE TOGGLES / CONSTANTS
------------------------------------------------------------------- */
const MAX_AI_ITEMS = 6;
// Backfill keeps only the first unseen item. The old narrow ask (2) starved
// tight lanes ("crime"): the seen-filter routinely ate the whole batch and
// the slot silently stayed empty (RC-3). This is the KEEP count, not the
// ask — under exclusion pressure the actual request is sized up by
// sizedAsk in generateAIReks (the marked cull zeroed out a raw 5-ask the
// same way RC-3's narrow ask starved on the seen-filter).
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
// deckSelector (normalizeTitle) mirrors this normalization.
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
   VIBE → TONE CLAUSE (tone on genre, never intersection)
   A vibe is a TONE INSTRUCTION applied to the genre subject — "crime
   played for laughs" (The Nice Guys, Game Night), never a second
   keyword the results must intersect (that overlap produced ONE rek
   in the field). Keyed by the picker string; the picker is category-
   scoped (VIBES_BY_CATEGORY in SearchBar), so wine clauses can never
   surface on media and vice versa. Names shared across categories
   (Dark & Twisty, Smart & Witty) share one medium-neutral clause.
   Unknown names fail soft: no tone line, lane-only behavior.
------------------------------------------------------------------- */
const TONE_BY_VIBE: Record<string, string> = {
  // Movies
  "Comfort Watch":
    "played warm and familiar — low stakes, rewatchable, gentle humor — not bleak, cruel, or anxiety-inducing",
  "Goofy / Silly Fun":
    "played for laughs — capers, buddy energy, bumbling schemers, absurd escalation — not grim or brooding",
  "Feel-Good Crowd Pleaser":
    "played big-hearted and winning — underdogs, warm ensembles, against-the-odds payoffs — not cynical or downbeat",
  "Smart & Witty":
    "played sharp and verbal — rapid-fire dialogue, verbal sparring, dry wit — not broad slapstick or solemn",
  "Romantic / Heartfelt":
    "played tender and sincere — longing, chemistry, earned emotional beats — not raunchy parody or cold irony",
  "Dark & Twisty":
    "played grim and serpentine — moral rot, unreliable surfaces, dread that tightens — not jokey or cozy",
  "Suspense / Edge-of-Seat":
    "played taut — ticking clocks, traps closing, held-breath set pieces — not leisurely or meandering",
  "Epic / Immersive":
    "played vast — sweeping scale, world-swallowing stakes, long-arc grandeur — not small-scale or contained",
  "Action / Adrenaline":
    "played kinetic — chases, set-piece momentum, physical stakes — not talky or static",
  "Thought-Provoking / Meaningful":
    "played weighty and probing — moral questions that linger, ideas over spectacle — not disposable or glib",
  "Weird / Offbeat":
    "played strange — left-field premises, tonal risk, cult sensibility — not conventional or safe",
  // Format constraint, not strictly tone — flagged in the plan review.
  "Documentary / Real Stories":
    "grounded in real events — documentaries or true-story tellings, actual people and stakes — not fictional inventions",
  // TV
  "Binge & Chill":
    "played easy and propulsive — episode-to-episode pull, low homework, comfortable momentum — not dense or demanding",
  "Comfort Rewatch":
    "played warm and familiar — ensemble hangouts, gentle stakes, episodes you can live inside — not harrowing or heavy",
  "Prestige Drama":
    "played serious and crafted — novelistic arcs, heavyweight performances, patient build — not disposable or campy",
  "Reality Escape":
    "played unscripted and moreish — competition or docusoap energy, personalities you pick sides on — not scripted drama",
  "Edge-of-Seat":
    "played taut — cliffhanger construction, traps closing, held-breath momentum — not leisurely or meandering",
  // Books (Can’t Put Down keeps the picker's curly apostrophe)
  "Can’t Put Down":
    "played propulsive — short chapters, hooks that yank, one-more-page construction — not meandering or ornamental",
  "Thought-Provoking":
    "played weighty and probing — ideas that linger, moral questions over plot candy — not disposable or glib",
  "Comfort Read":
    "played warm and familiar — gentle stakes, beloved-shelf feel, prose that soothes — not harrowing or bleak",
  // Wine (wine-only by picker scoping; "played" reads as palate register)
  "Crisp & Dry":
    "lean and bone-dry — high acid, citrus and mineral, unoaked — not rich, buttery, or sweet",
  "Easy Sipper":
    "easygoing — soft tannins, smooth fruit, no-decoder-ring drinking — not tannic, oaky, or hot with alcohol",
  "Special Occasion":
    "built to impress — structured, cellar-worthy, worth-the-splurge bottles — not everyday quaffers",
  "Bright & Fresh":
    "vivid and zesty — snappy acidity, fresh fruit, lift — not heavy, jammy, or flat",
  "Rich & Cozy":
    "plush and warming — full body, dark fruit, round texture — not lean, sharp, or austere",
};

// The single tone line every path (fresh search, backfill, MLT) appends
// when a vibe is active — the mapping lives HERE only, never copied per
// path. Unknown vibe → null (fail-soft, lane-only behavior).
function toneLineForVibe(
  vibe: string | null | undefined,
  subject: string
): string | null {
  const clause = vibe ? TONE_BY_VIBE[vibe] : undefined;
  if (!clause) return null;
  return `Tone instruction: the subject stays ${subject}; play it ${clause}. Tone shapes HOW the subject is played — never a second keyword to intersect with.`;
}

/* ------------------------------------------------------------------
   NORMALIZATION HELPERS
------------------------------------------------------------------- */
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
  vibe: string | null;
  context: string;
  mode: IntentMode;
} {
  const q = (rawQuery ?? "").trim();
  const parts = q.includes("||") ? q.split("||") : q.split("|");

  const rawCategory = (parts[0] ?? "Movies").trim();
  const clarifier = (parts[1] ?? "").trim();
  const text = (parts[2] ?? "").trim();
  const maybeMode = (parts[3] ?? "").trim().toLowerCase();
  // Segment 5: the vibe channel ("vibe:Goofy / Silly Fun"). Its own slot
  // so it can never ride the PRIMARY-signal text slot again — that was
  // the intersection bug. Absent on every non-vibe query.
  const rawVibe = (parts[4] ?? "").trim();
  const vibe = rawVibe.toLowerCase().startsWith("vibe:")
    ? rawVibe.slice(5).trim() || null
    : null;

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
    toneLineForVibe(vibe, clarifier || category) ?? "",
    `Mode: ${mode}`,
  ]
    .filter(Boolean)
    .join(" | ");

  return { category, clarifier, text, vibe, context, mode };
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

  if (intent.clarifier) {
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

  // The prompt's never-return list, tiered by how badly truncation hurts:
  // visible cards, then session seen, then marked titles (disliked, then
  // liked; newest first within each) — when the 100-slot cap bites,
  // cross-session likes fall off before anything the user can see on
  // screen. The cap only limits prompt PRESSURE: generateAIReks drops
  // seen AND marked titles from responses uncapped, so a truncated entry
  // still can never ship (frontier shows only unmarked titles).
  const avoidTitles = Array.from(
    new Set(
      [
        ...currentTitles,
        ...seenTitles,
        ...[...dislikedTitles].reverse(),
        ...[...likedTitles].reverse(),
      ].filter(Boolean)
    )
  ).slice(0, 100);

  // Long-tier spec, split by category: Movies/TV/Books earn a 3-4 sentence
  // payoff (the expanded card is the read moment — what it is, who it's
  // for, why this searcher's line points at it), under the same no-spoiler
  // rule as short. Wine keeps its original one-sentence blurb, verbatim.
  const mediaLong =
    category === "Movies" || category === "TV Shows" || category === "Books";
  const longFormat = mediaLong
    ? "3-4 sentences: the setup's concrete situation, the texture, the viewing moment it wins — deepening short's angle, setup only."
    : "EXACTLY 3 sentences: the axis deepened, what the wine DOES, then the verdict beat — see the wine long rules.";
  const longRules = mediaLong
    ? `- long is EXACTLY 3-4 sentences, one job each:
  - Sentence 1: the world and the concrete situation the setup drops you into — specifics only this title has.
  - Sentence 2: the texture — pace, tone, and one vivid element (a performance, a setting, a running device) named concretely.
  - Sentence 3: the viewing situation it wins, and it MUST be phrased as a situation, not a suitability claim — start it with 'One for...', 'Save it for...', or 'Best on...' ('One for a solo weeknight', 'Save it for a slow Sunday'). NEVER 'perfect/ideal/great/made for', never a type of person ('fans of...', 'those who enjoy...').
  - Optional sentence 4: what to expect going in — honest texture (slow burn, talky, violent), the friend-warning a trailer won't give.
- long must DEEPEN the angle short established — never paraphrase or re-say short in different words.
- long never repeats short's placement: long's sentence 3 is the viewing situation ('One for...', 'Save it for...'), a different job than short's comparative — one comparison per card, in short.
- NO SPOILERS in long: setup only, never a twist, a turn, or an ending.
- RIGHT (fictional title, for shape only): 'A night-shift tollbooth operator starts finding handwritten confessions taped inside returned toll baskets and becomes obsessed with identifying the writers. It moves slowly and quietly, most of it shot inside the booth, carried by one wary, wordless lead performance. One for a solo weeknight when you want something small that sticks. Expect long silences — it trusts you to sit in them.'
- WRONG (same shape of title): 'A heartwarming journey of connection that explores themes of loneliness. A refreshing take on the mystery genre, perfect for fans of slow cinema. A must-watch that resonates long after.' (could describe five hundred films; three banned constructions; names nothing this title owns)`
    : `- long is EXACTLY 3 sentences, one job each:
  - Sentence 1: deepen the short's dry-vs-sweet placement with finer CONCRETE decision words (grapefruit pith, toasted oak, clover honey) — never re-characterize on a different axis, never contradict the short.
  - Sentence 2: what the wine DOES, as behavior, never an inventory of notes — where the fruit sits, when the oak arrives, what the finish does ('The fruit rides up front and the oak stays out of the way until the finish.'). A bag of descriptors that could hang on half the category is the named failure.
  - Sentence 3: the verdict beat — where this lands relative to the comparative referent (the seed bottle, the newest kept wine, or the shelf this search names): keeps it with a difference, trades it for something else, or doubles down ('Doubles down on the crispness this lane is chasing'; 'Trades the plushness for structure — leaner, but longer'). An honest not-for-this-search steer is a SUCCESS. Never a rating, never an occasion, never a person-type.
  - The FINAL WORD is a concrete noun — a food, a moment, a place. Never end on a mood.
- RIGHT: 'The dryness runs bone-deep — lime pith and crushed stone with no fruit-sweetness padding it. The acidity hits first and the body stays out of the way, so it finishes fast and clean. Doubles down on the crispness this lane is chasing — if you wanted roundness, this is the wrong door, but with oysters it sings.'
- WRONG: 'A well-balanced and elegant wine with notes of citrus and minerality, perfect for those who enjoy crisp whites.' (descriptor inventory; rating register; person-type; never places the verdict against the search's line)`;
  const longFitRule = mediaLong
    ? "- long, sentence 1 or 2, should tilt its specifics toward the searcher's line where it's natural — the same premise reads differently after a 'funny feel-good' search than after a 'dark thriller' search. Never announce the fit ('since you searched...', 'if you're looking for...'); let the chosen specifics carry it."
    : "- long, sentence 3, carries the fit: the verdict is stated AGAINST the comparative referent — never announce it ('since you searched...'); let the relationship carry it.";

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
- If likes/dislikes are provided, use them to refine the taste lane only after the explicit text input has been satisfied. Liked and disliked titles are DIRECTION ONLY — never candidates.
- Never return a title already shown this session or already on the user's liked/disliked record. A liked title is a taste signal, not a recommendation slot.
- Treat the never-return list as covered ground: this user has already seen the obvious picks for this line. Your job is the next shelf down — adjacent, less-obvious titles of the same quality, not the canon re-served.
- Prefer real titles/items. Do not invent fake media.
- Return ONLY a valid JSON ${backfill ? `object of the form {"results": [ ...items ]}` : "array"}. No commentary. No markdown.

Output format:
${backfill ? `{ "results": [` : "["}
  {
    "title": "Example Title",
    "year": 2014,
    "short": "Three sentences: the setup (characterized role + premise only this title has), the complication (setup only, never a twist), the placement against the comparative referent.",
    "long": "${longFormat}",
    "genre": "Comedy • Drama",
    "vibeTags": ["Witty", "Heartfelt"],
    "trailerUrl": "https://www.youtube.com/results?search_query=Example%20Title%20trailer"
  }
${backfill ? `] }` : "]"}
Rules:
- For Movies, TV Shows, and Books: short is exactly three sentences, one job each.
- Sentence 1 — THE SETUP: a CHARACTERIZED role — a vivid description that sets the tone ('an insurance lawyer who has never lost', 'a wedding DJ who hates music', 'a couple eager to buy their first home'), NEVER a proper name (names mean nothing to someone who hasn't seen it), never a bare 'a man'/'a woman' — then the concrete premise only this title has. A topic is not a premise: the 'Explores/Delves into/Capturing [topic]' register is banned in any form.
- Sentence 2 — THE COMPLICATION: what goes wrong, what's at stake, the turn that makes the setup a story — drawn from the SETUP only, never the twist or the ending. If the hook needs the twist, you chose the wrong sentence; hook from the premise instead.
- Sentence 3 — THE PLACEMENT: place this title against the comparative referent, bare comparative shape — tone, pace, or temperature, naming the DIRECTION of the difference ('Slower and colder than the seed — ...'), or its position on the shelf when no referent title exists ('The talkiest of the smart-witty crime shelf'). Never a rating, never 'similar to' filler, never a person-type.
- Sentences 1 and 2 each end on a concrete noun or stake; sentence 3 ends on the difference, stated concretely.
- RIGHT (fictional title, for shape only): 'A courtroom sketch artist realizes her drawings keep showing details no testimony mentioned. When a defense attorney subpoenas her sketchbook, every case she ever drew comes back into question. Slower and quieter than the seed — the dread builds in pencil strokes, not chases.'
- WRONG (same shape of title): 'A talented artist gets caught up in a legal drama, leading to unexpected revelations amidst the chaos of the courtroom. A gripping story that keeps you on the edge of your seat. Similar to other legal thrillers.' (nothing only this title owns; three banned constructions; sentence 3 rates instead of placing)
- For Wine, short is exactly two sentences. Sentence 1 MUST open by placing the wine on dry vs. sweet, then signature notes in concrete decision words (grapefruit, grassy, oaky, buttery). Sentence 2: a concrete moment or contrast — when it shines and when it doesn't. End on a concrete noun. Never a mood, never an 'experience', never a recommendation.
- RIGHT: 'Dry and citrus-led — grapefruit and lime over a subtle grassy edge. Built for a hot afternoon more than a rich dinner.'
- WRONG: 'A crisp, refreshing white perfect for those who enjoy lighter wines.' (never places it on dry vs. sweet; perfect-for filler)

BANNED REGISTER — applies to every sentence of short and long:
- Trailing endings: 'leading to...' in any form ('leading to unexpected notoriety', 'leading to humorous and poignant situations'), 'resulting in...' in any form ('resulting in a tense hostage situation'), '[anything] ensues' ('hilarity ensues', 'chaos ensues'), 'amidst the chaos', 'nothing will ever be the same', 'a journey of self-discovery'.
- Review-speak and person-types: 'heartwarming', 'a journey of', 'refreshing take', 'must-watch', 'a rollercoaster', 'keeps you on the edge of your seat', 'perfect for', 'fans of', 'those who enjoy', 'explores themes of', 'a testament to', 'resonates', 'ideal for', 'great for', 'lingers long after', 'stays with you', opening with 'The story of...'.
- DELETION TEST, applied before you return: if a phrase could describe half the titles in this category, delete it and write something only this title earns. If nothing survives, you chose the wrong sentence.

${longRules}
- write in plain English, like a smart human curator.
- avoid critic language, film-school jargon, and review-speak.
- prefer strong but less obvious titles over the most famous mainstream picks when possible.
${longFitRule}
- avoid repeating the same very famous titles across different searches.

Rules:
- Aim for exactly ${count} items.
- It is better to return strong real recommendations than force bad filler.
- Use plain strings only.
- year must be numeric.
- Keep the set coherent but not repetitive.
- Do not include any title from the never-return list below.
- ${backfill ? "This is a single replacement/backfill moment after a thumbs action. Give the next best discoveries." : "This is a fresh recommendation set."}

Category guidance:
${categoryInstructions[category]}

User path context:
${context}

Seed title:
${seedTitle ? seedTitle : "(none)"}

Comparative referent (every placement sentence compares against this):
${
  seedTitle
    ? `the seed title, ${seedTitle} — place each rek against it.`
    : likedTitles.length
    ? `the user's newest kept title, ${
        likedTitles[likedTitles.length - 1]
      } — place each rek against it.`
    : `no referent title — place each rek against the shelf this search names, lane and tone: 'The talkiest of the smart-witty crime shelf.'`
}

Recent likes:
${likedTitles.length ? likedTitles.slice(-10).join(", ") : "(none)"}

Recent dislikes:
${dislikedTitles.length ? dislikedTitles.slice(-10).join(", ") : "(none)"}

Current visible titles:
${currentTitles.length ? currentTitles.slice(-15).join(", ") : "(none)"}

Never return these titles (already shown, or already marked by the user):
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
  // Marked titles (liked AND disliked, permanently) are excluded UNCAPPED —
  // this drop-set is the hard guarantee behind the invariant that the
  // frontier only ever shows unmarked titles. The prompt's capped avoid
  // list is merely pressure; a forgotten like resurfacing is the history
  // panel's job, never the frontier's. Separate set from `seen` so the
  // tripwire names marked-exclusion drops distinctly.
  const marked = new Set<string>(
    [...(args.likedTitles ?? []), ...(args.dislikedTitles ?? [])].map((t) =>
      t.trim().toLowerCase()
    )
  );

  // Over-ask sizing at the single site — EVERY path inherits (fresh, RC-2
  // top-up, MLT, and backfill, whose 5-ask was culled to zero by the same
  // mechanism). The marked cull eats candidates AFTER generation, so the
  // ask is sized for the growth curve, not today's snapshot. Field receipt
  // (2026-07-24): fresh ask 6 → produced 8, marked drops 4, shipped 4 —
  // cull ~50% of produced on canon-heavy lanes, and it grows with every
  // like. needed + markedCount rides that curve; the floor of 10 nets ~5
  // survivors at the observed 50% cull; the ceiling of 12 is where
  // 4o-mini list quality and completion-token latency stop paying — the
  // backfill abort ceiling is sized against a 12-ask completion band, so
  // re-run that math before ever raising 12. Extras beyond the needed
  // count are discarded by the fold loop, never shown.
  const sizedAsk = (needed: number): number =>
    marked.size === 0 && seen.size === 0
      ? needed
      : Math.max(10, Math.min(needed + marked.size, 12));

  const out: Rek[] = [];
  const dedupe = new Set<string>();
  // Tripwire counters (RC-4): when a set ships short, the log below names
  // what filtered it — silent failures get named.
  let produced = 0;
  const drops = { sanitize: 0, dupe: 0, seen: 0, marked: 0 };

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

    // Only the backfill path runs under a hard timeout, and the timeout's
    // job is HANG PROTECTION, not a latency SLA — it must sit above the
    // p99 of LEGITIMATE completions (the 10s-inside-the-band outage, then
    // 30s-inside-the-band again when the over-ask landed). Sizing math at
    // the current 12-item ask ceiling, from the measured 5-item band
    // (~1,200-1,500 completion tokens → 10-25s ⇒ ~240-300 tokens/item,
    // slow-tail throughput ~60 tok/s): the model over-delivers ~1.33x
    // (field receipt: ask 6 → produced 8), so a 12-ask can legitimately
    // complete ~16 items ≈ 3,900-4,800 tokens ≈ 65-80s at the slow tail.
    // 90s clears that worst estimate with margin while still bounding a
    // true hang; the UX is covered either way (inline skeleton while
    // waiting, honest running-dry notice on real failure). Re-measure
    // from the field before trusting this band — and re-run this math if
    // the 12-item ask ceiling in sizedAsk ever moves. Non-backfill
    // generations (fresh search, MLT, the top-up) still run untimed.
    const controller = args.backfill ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), 90000)
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
      if (marked.has(titleKey)) {
        drops.marked++;
        continue;
      }

      dedupe.add(titleKey);
      out.push(safe);
    }
    return true;
  };

  try {
    await runPass(sizedAsk(args.count), args.currentTitles ?? []);

    // RC-2 floor: ONE top-up when a non-backfill set ships short of five —
    // sized through the same over-ask (asking exactly the shortfall under
    // cull pressure was RC-3's narrow-ask disease resurfacing here), with
    // the first pass's survivors added to the avoid list (currentTitles)
    // on top of everything seen. One retry only, then ship what exists:
    // honest-short over canned-full — never pad, never loop.
    if (!args.backfill && out.length < 5) {
      await runPass(sizedAsk(5 - out.length), [
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
      // name identifies the class at a glance — an abort is "AbortError",
      // which the message text alone left ambiguous in the field.
      name: err instanceof Error ? err.name : undefined,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
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
  const { category, clarifier, text, vibe, context, mode } =
    parseRawQuery(rawQuery);
  const sessionSeen = getSessionSeen(category);

  setLastIntent({ category, clarifier, text, vibe, mode });

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

  if (USE_DEER_TRAILS && mode === "pool") {
    const fromDeck = getTop5FromDeck(
      starterDeckId,
      finalPoolForSelection,
      sessionSeen
    );
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
    // BANKED (title-recycling trace, layer 2 edge): this clears the whole
    // category's seen set, which the AI lane shares — a drained Play pool
    // wipes AI never-repeat memory too. Session-lifecycle work owns it.
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
  // The session trail (kept cards, marking order oldest→newest). Present,
  // it anchors AI backfill the way a chain steer anchors the snap lane:
  // newest keep = seed, the rest = the line. Absent/empty = the old
  // bare-category behavior, unchanged.
  trailTitles?: string[];
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
    // Trail-anchoring: a bare-category backfill prompt starves narrow
    // lanes (the questionless prompt was the disease, not the seen-
    // filter). With a trail, the newest keep rides the existing seedTitle
    // grammar ("smart more-like-this" — the same anchor MLT uses) and the
    // full line rides one context sentence, chain-steer class: continue
    // the line, newest weigh heaviest, never repeat. Zero trail
    // (dislike-only session) = the previous context, byte-identical.
    const trail = (args.trailTitles ?? []).filter(Boolean);
    const seedTitle = trail.length > 0 ? trail[trail.length - 1] : undefined;

    const context = [
      `Vertical: ${intent.category}`,
      intent.clarifier ? `Lane/Clarifier: ${intent.clarifier}` : "",
      intent.text ? `User text: ${intent.text}` : "",
      // Tone and trail COMPOSE: the backfill continues the liked line
      // WITHIN the tone — subject → tone → trail, one prompt.
      toneLineForVibe(intent.vibe, intent.clarifier || intent.category) ?? "",
      trail.length > 0
        ? `Session trail — titles the user KEPT this session, oldest to newest: ${trail
            .slice(-8)
            .join(
              ", "
            )}. Continue the line these define; the newest weigh heaviest. Never repeat them.`
        : "",
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
      seedTitle,
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
    vibe: prior?.vibe ?? null,
    mode: "ai",
  };
  setLastIntent(intent);

  const context = [
    `Vertical: ${intent.category}`,
    intent.clarifier ? `Lane/Clarifier: ${intent.clarifier}` : "",
    intent.text ? `User text: ${intent.text}` : "",
    // An active vibe survives the chain: MLT extends the line in-tone.
    toneLineForVibe(intent.vibe, intent.clarifier || intent.category) ?? "",
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


