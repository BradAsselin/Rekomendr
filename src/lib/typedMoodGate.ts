// src/lib/typedMoodGate.ts — S16b: which typed moods may take the fast
// path (docs/s16-watched-search-plan.md, Part B; pure, both bundles).
//
// The slot recipe speaks a small vocabulary: one lane and one refiner.
// Measured on the preview (10 typed moods, 2026-10-24), routing every
// mapped mood through it painted in ~1.3 s but lost what the words asked
// for: "an uplifting sports movie" became Drama + Feel-good (Forrest Gump,
// The Prestige), "a funny heist movie" became Comedy (The Truman Show),
// "like The Office" became The Office's Comedy-lane web plus touchstones
// (The Rookie). The AI search had all ten on-mood. Fast is no use if the
// five aren't what you asked for (§0), so the fast path takes only moods
// the vocabulary holds WHOLE:
//   - every content word is a category word, the parsed lane's word, or
//     the parsed refiner's word ("a dark crime show", "something funny");
//   - no named title ("like Ted Lasso but darker" → the AI search, which
//     placed it well; the slot steer did not).
// Anything else keeps the AI search, named in the log with its reason and
// the words the vocabulary could not hold.
//
// S19a — the vocabulary widens (docs/s19-fast-moods-plan.md, Part A). A
// word is also covered by:
//   - a word of a keyword tag TMDb resolved ("heist", "gory"~"gore") — the
//     tag has to echo the person's own word, so a broad tag can't swallow
//     a word it doesn't mean;
//   - the named title, when TMDb found it (or it is a starred go-to);
//   - a negator ("isn't too gory"), when an exclusion tag resolved.
// ("for date night" stays residual on purpose: measured on the preview,
// Romance + Feel-good alone served The Fault in Our Stars and Brokeback
// Mountain for "something light and romantic for date night".)
// Such a mood is `strict`: the route builds a mood pool and is the second
// half of the gate (too thin a pool → the AI search).

const STOP = new Set(
  (
    "a an the some something anything any i im i'm me my we us our want wanna need feel feeling feels like " +
    "in into on for to of with and or but that this these is are be it its so just really very pretty " +
    "kind sort type please tonight today mood watch watching see one ones pick give get find show-me " +
    "good great nice bit little lot more most " +
    // S19a — spoken moods are gated too: the fillers people say aloud.
    "um umm uh uhh hmm erm maybe perhaps guess okay ok yeah well let's lets could would you recommend suggest " +
    "how about what what's whats"
  ).split(" ")
);

const CATEGORY = new Set(
  "movie movies film films flick flicks show shows series tv television sitcom sitcoms miniseries".split(" ")
);

// The lane's own words, by the lane string the parse returns (lower-case).
const LANE_WORDS: Record<string, string[]> = {
  comedy: ["comedy", "comedies", "comedic", "funny", "laugh", "laughs", "hilarious", "goofy", "silly", "lighthearted"],
  drama: ["drama", "dramas", "dramatic"],
  thriller: ["thriller", "thrillers", "thrilling", "suspense", "suspenseful", "tense"],
  crime: ["crime", "crimes", "criminal", "gangster", "gangsters", "mob", "mafia"],
  action: ["action", "explosive"],
  romance: ["romance", "romances", "romantic", "romcom", "rom-com", "love"],
  "sci-fi": ["sci-fi", "scifi", "sci", "fi", "science", "fiction"],
  "science fiction": ["sci-fi", "scifi", "sci", "fi", "science", "fiction"],
  reality: ["reality"],
  documentary: ["documentary", "documentaries", "doc", "docs", "docuseries"],
  horror: ["horror", "horrors", "scary", "spooky", "creepy", "frightening", "terrifying"],
  mystery: ["mystery", "mysteries", "whodunit", "whodunnit"],
  fantasy: ["fantasy", "magical", "magic"],
  animation: ["animated", "animation", "cartoon", "cartoons"],
  family: ["family", "kids"],
  western: ["western", "westerns"],
  war: ["war"],
  history: ["history", "historical"],
  music: ["music", "musical", "musicals"],
  adventure: ["adventure", "adventures"],
};

const REFINER_WORDS: Record<string, string[]> = {
  "feel-good": ["feel-good", "feelgood", "light", "uplifting", "happy", "heartwarming", "wholesome", "cheerful", "comforting", "comfort", "fun"],
  dark: ["dark", "darker", "twisted", "twisty", "gritty", "bleak", "grim"],
  smart: ["smart", "clever", "intelligent", "witty", "thoughtful", "thought-provoking", "cerebral"],
  classic: ["classic", "classics", "old", "older", "oldie"],
  new: ["new", "newer", "recent", "latest"],
  // S21 — the new vibes.
  funny: ["funny", "funnier", "hilarious", "goofy", "silly", "laugh", "laughs", "comedic"],
  cozy: ["cozy", "cosy", "comfy", "comforting", "comfort", "gentle", "warm"],
  tense: ["tense", "suspense", "suspenseful", "gripping", "thrilling", "nail-biting", "edge-of-your-seat"],
  epic: ["epic", "sweeping", "grand"],
  short: ["short", "quick", "brief"],
};

const NEGATORS = new Set(
  "not no isn't isnt aren't arent don't dont doesn't doesnt without nothing never too less minus avoid skip overly".split(" ")
);

// "gory"~"gore", "sports"~"sport", "heists"~"heist": a shared start of at
// least three letters that leaves at most two letters over on the shorter.
const stemMatch = (w: string, t: string): boolean => {
  if (w === t) return true;
  let i = 0;
  while (i < w.length && i < t.length && w[i] === t[i]) i++;
  return i >= Math.max(3, Math.min(w.length, t.length) - 2);
};

const wordsOf = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .split(/[^a-z0-9'-]+/)
    .map((w) => w.replace(/^[-']+|[-']+$/g, ""))
    .filter(Boolean);

// S19a — does a keyword tag echo the person's own words? Every content
// word of the tag must stem-match a word they used ("courtroom drama" for
// "a courtroom drama"; not "caper" for "a funny heist movie" — a synonym
// widens the pool past what was asked: Ferris Bueller's Day Off).
export function tagEchoes(tag: string, text: string): boolean {
  const said = wordsOf(text).flatMap((w) => (w.includes("-") ? [w, ...w.split("-")] : [w]));
  const need = tag
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP.has(w));
  return need.length > 0 && need.every((t) => said.some((w) => stemMatch(w, t)));
}

export type MoodGate =
  | { fast: true; strict: boolean }
  | { fast: false; reason: "named_title" | "specific"; residual: string[] };

type GateGoTo = { name?: string; starred?: boolean; tmdbId?: number | null } | string | null | undefined;

// `mood` is /api/mood's answer (already validated to the vocabulary;
// `keywords` holds only concepts TMDb resolved).
export function typedMoodGate(
  text: string,
  mood: {
    lane?: { lane: string } | null;
    refiner?: string | null;
    goTo?: GateGoTo;
    keywords?: { tags: string[]; ids?: number[]; exclude?: boolean; role?: "words" | "title" }[] | null;
  }
): MoodGate {
  // A named title steers only when TMDb found it (or it is a starred go-to).
  const goTo = mood.goTo;
  const goToName = typeof goTo === "string" ? goTo : goTo?.name ?? "";
  const goToKnown = !!goTo && typeof goTo === "object" && (!!goTo.starred || !!goTo.tmdbId);
  if (goTo && !goToKnown) return { fast: false, reason: "named_title", residual: [] };
  const concepts = (mood.keywords ?? []).filter((c) => Array.isArray(c?.tags) && c.tags.length > 0);
  // Only the person's own words' tags cover words; a title's signature
  // tags ("mockumentary" for The Office) describe the title, not the words.
  const tagWords = concepts
    .filter((c) => c.role !== "title")
    .flatMap((c) => c.tags.flatMap((t) => t.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)));
  const covered = new Set<string>(Array.from(STOP).concat(Array.from(CATEGORY)));
  // The named title's words ("Parks and Rec" for Parks and Recreation).
  const nameWords = wordsOf(goToName).flatMap((w) => w.split("-")).filter((w) => w && !STOP.has(w));
  if (concepts.some((c) => c.exclude)) for (const w of Array.from(NEGATORS)) covered.add(w);
  const lane = mood.lane?.lane?.toLowerCase();
  if (lane) {
    covered.add(lane);
    for (const w of LANE_WORDS[lane] ?? []) covered.add(w);
  }
  const refiner = mood.refiner?.toLowerCase();
  if (refiner) for (const w of REFINER_WORDS[refiner] ?? []) covered.add(w);
  const words = wordsOf(text);
  const has = (w: string) =>
    covered.has(w) || tagWords.some((t) => stemMatch(w, t)) || nameWords.some((t) => t.startsWith(w) || stemMatch(w, t));
  const residual = words.filter((w) => {
    if (has(w)) return false;
    // "feel-good", "sci-fi", "rom-com": a hyphenated word is covered when
    // it, or every part of it, is.
    if (w.includes("-")) return !w.split("-").every((p) => has(p));
    return true;
  });
  return residual.length
    ? { fast: false, reason: "specific", residual: residual.slice(0, 6) }
    : { fast: true, strict: concepts.length > 0 || !!goTo };
}
