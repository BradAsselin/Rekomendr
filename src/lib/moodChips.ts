// src/lib/moodChips.ts — S5: mood chips up front (docs/s4-s5-build-plan.md).
//
// Row 1, always visible under the search box: the lanes, one tap each —
// the first tap shows results, no GO. Category-aware: TV gets its own set,
// Wine gets styles. Row 2 appears after the first tap: optional refiners
// that re-run the search.
//
// No prompt text changes (no VOICE work): every chip and refiner rides a
// channel the engine already reads.
//   * a row-1 chip is the LANE (query segment 2), exactly what the retired
//     "+" dropdown set — "Surprise me" is no lane at all (generic discovery,
//     what an empty GO always did);
//   * a tone refiner (Feel-good / Dark / Smart, and wine's styles) is an
//     existing VIBE key, so it reaches the model as the engine's own
//     already-tuned tone clause (TONE_BY_VIBE in rekomendrEngine.ts);
//   * an era refiner (Classic / New) has no tone clause to borrow, so it
//     qualifies the lane string itself ("Classic Comedy", "New releases"),
//     the same free-text lane slot the engine has always passed through.
//
// Why tap-to-search is safe now (the history the build plan asked for):
// the old surface never had visible chips — genres lived behind "+" since
// the first V2 SearchBar (efad30a, 2026-01-03). What was removed was
// AUTOMATIC searching: a 2-second auto-go timer after a lane pick
// (401886b, 2026-06-07 — a late "Comedy" response overwrote a typed "Tom
// Hanks" search on slow mobile) and the category-switch auto-search
// (3eaa04b, 2026-07-10). A chip tap is a deliberate act, not a timer, and
// the page's searchIdRef guard (from 401886b) drops any stale response; a
// category switch still never searches.

export type ChipCategory = "Movies" | "TV Shows" | "Books" | "Wine";

export type Chip = { label: string; lane: string };
export type Refiner =
  | { label: string; kind: "tone"; vibe: string }
  | { label: string; kind: "era"; era: "classic" | "new" }
  | { label: string; kind: "short" };

export const SURPRISE_ME = "Surprise me";

const chip = (label: string, lane = label): Chip => ({ label, lane });

export const CHIPS_BY_CATEGORY: Record<ChipCategory, Chip[]> = {
  // S21 — one scrolling row each, in Brad's approved order (2026-10-25).
  Movies: [
    chip("Comedy"), chip("Drama"), chip("Thriller"), chip("Action"),
    chip("Romance"), chip("Crime"), chip("Sci-Fi"), chip("Horror"),
    chip("Mystery"), chip("Animation"), chip("Family"), chip("Fantasy"),
    chip("Documentary"), chip("War"), chip("Western"), chip(SURPRISE_ME, ""),
  ],
  "TV Shows": [
    chip("Comedy"), chip("Drama"), chip("Crime"), chip("Mystery"),
    chip("Sci-Fi & Fantasy"), chip("Action & Adventure"), chip("Reality"),
    chip("Documentary"), chip("Animation"), chip("Family"), chip("Western"),
    chip(SURPRISE_ME, ""),
  ],
  Books: [
    chip("Mystery"), chip("Thriller"), chip("Romance"), chip("Fantasy"),
    chip("Sci-Fi"), chip("Non-Fiction"), chip(SURPRISE_ME, ""),
  ],
  Wine: [
    chip("Bold Red"), chip("Crisp White"), chip("Bubbles", "Sparkling"),
    chip("Rosé"), chip(SURPRISE_ME, ""),
  ],
};

// Tone refiners map onto vibe keys that already exist in TONE_BY_VIBE.
// S21 — the ten approved vibes (Brad, 2026-10-25). The new tones borrow
// existing keys, so the AI fallback gets an already-tuned tone clause:
// Funny = Goofy / Silly Fun, Cozy = Comfort Watch, Tense = (Suspense /)
// Edge-of-Seat, Epic = Epic / Immersive. Short is a length, not a tone.
const screenVibes = (feelGood: string, tense: string): Refiner[] => [
  { label: "Feel-good", kind: "tone", vibe: feelGood },
  { label: "Funny", kind: "tone", vibe: "Goofy / Silly Fun" },
  { label: "Dark", kind: "tone", vibe: "Dark & Twisty" },
  { label: "Smart", kind: "tone", vibe: "Smart & Witty" },
  { label: "Cozy", kind: "tone", vibe: "Comfort Watch" },
  { label: "Tense", kind: "tone", vibe: tense },
  { label: "Epic", kind: "tone", vibe: "Epic / Immersive" },
  { label: "Classic", kind: "era", era: "classic" },
  { label: "New", kind: "era", era: "new" },
  { label: "Short", kind: "short" },
];
const media = (feelGood: string): Refiner[] => [
  { label: "Feel-good", kind: "tone", vibe: feelGood },
  { label: "Dark", kind: "tone", vibe: "Dark & Twisty" },
  { label: "Smart", kind: "tone", vibe: "Smart & Witty" },
  { label: "Classic", kind: "era", era: "classic" },
  { label: "New", kind: "era", era: "new" },
];

export const REFINERS_BY_CATEGORY: Record<ChipCategory, Refiner[]> = {
  Movies: screenVibes("Feel-Good Crowd Pleaser", "Suspense / Edge-of-Seat"),
  "TV Shows": screenVibes("Comfort Rewatch", "Edge-of-Seat"),
  Books: media("Comfort Read"),
  // Wine's row 2 is its own existing styles of drinking, not film tones.
  Wine: [
    { label: "Easy sipper", kind: "tone", vibe: "Easy Sipper" },
    { label: "Special occasion", kind: "tone", vibe: "Special Occasion" },
    { label: "Crisp & dry", kind: "tone", vibe: "Crisp & Dry" },
    { label: "Rich & cozy", kind: "tone", vibe: "Rich & Cozy" },
  ],
};

export const chipsFor = (category: string): Chip[] =>
  CHIPS_BY_CATEGORY[category as ChipCategory] ?? CHIPS_BY_CATEGORY.Movies;
export const refinersFor = (category: string): Refiner[] =>
  REFINERS_BY_CATEGORY[category as ChipCategory] ?? REFINERS_BY_CATEGORY.Movies;

// The engine query for a chip (+ optional refiner). Same "||" format the
// search bar has always sent; AI mode (a tap is a deliberate search).
export function chipQuery(category: string, c: Chip, refiner: Refiner | null): string {
  let lane = c.lane;
  let vibe: string | null = null;
  if (refiner?.kind === "tone") vibe = refiner.vibe;
  if (refiner?.kind === "era") {
    lane =
      refiner.era === "classic"
        ? lane ? `Classic ${lane}` : "Classics"
        : lane ? `New ${lane} releases` : "New releases";
  }
  // S21 — Short on the AI fallback qualifies the lane, as an era does.
  if (refiner?.kind === "short") {
    const what = category === "TV Shows" ? "limited series" : "movies under 100 minutes";
    lane = lane ? `${lane} ${what}` : what;
  }
  const base = `${category}||${lane}||||mode:ai`;
  return vibe ? `${base}||vibe:${vibe}` : base;
}
