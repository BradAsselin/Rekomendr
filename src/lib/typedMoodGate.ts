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

const STOP = new Set(
  (
    "a an the some something anything any i im i'm me my we us our want wanna need feel feeling feels like " +
    "in into on for to of with and or but that this these is are be it its so just really very pretty " +
    "kind sort type please tonight today mood watch watching see one ones pick give get find show-me " +
    "good great nice bit little lot more most"
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
};

export type MoodGate = { fast: true } | { fast: false; reason: "named_title" | "specific"; residual: string[] };

// `mood` is /api/mood's answer (already validated to the vocabulary).
export function typedMoodGate(text: string, mood: { lane?: { lane: string } | null; refiner?: string | null; goTo?: unknown }): MoodGate {
  if (mood.goTo) return { fast: false, reason: "named_title", residual: [] };
  const covered = new Set<string>(Array.from(STOP).concat(Array.from(CATEGORY)));
  const lane = mood.lane?.lane?.toLowerCase();
  if (lane) {
    covered.add(lane);
    for (const w of LANE_WORDS[lane] ?? []) covered.add(w);
  }
  const refiner = mood.refiner?.toLowerCase();
  if (refiner) for (const w of REFINER_WORDS[refiner] ?? []) covered.add(w);
  const words = text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .split(/[^a-z0-9'-]+/)
    .map((w) => w.replace(/^[-']+|[-']+$/g, ""))
    .filter(Boolean);
  const residual = words.filter((w) => {
    if (covered.has(w)) return false;
    // "feel-good", "sci-fi", "rom-com": a hyphenated word is covered when
    // it, or every part of it, is.
    if (w.includes("-")) return !w.split("-").every((p) => covered.has(p));
    return true;
  });
  return residual.length ? { fast: false, reason: "specific", residual: residual.slice(0, 6) } : { fast: true };
}
