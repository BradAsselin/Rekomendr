// src/lib/voiceMood.ts — server-only. S13c: the voice mood parser
// (docs/s13-opus-voice-plan.md, B2).
//
// A spoken mood → { category, lane, refiner, go-to, price chip }, in the
// app's EXISTING vocabulary only: the mood chips and refiners
// (moodChips.ts), the lanes the slot recipe can pool (slotRecipe.ts), and
// wine's price chips (wineShelf.ts). The model proposes; validateMood()
// keeps only what the vocabulary knows, so a made-up tag can never reach
// a search. Results then run through the paths that already exist —
// voice adds no pick logic.
//
// The prompt writes tags, never text a person reads (not VOICE). It is
// built from the vocabulary lists, so a chip added later is understood
// without a prompt edit.

if (typeof window !== "undefined") {
  throw new Error("voiceMood.ts was imported in a browser bundle.");
}

import { CHIPS_BY_CATEGORY, REFINERS_BY_CATEGORY, SURPRISE_ME } from "./moodChips";
import { SLOT_LANES } from "./slotRecipe";
import { PRICE_CHIPS, type PriceChip } from "./wineShelf";

export type VoiceCategory = "Movies" | "TV Shows" | "Wine";
export const VOICE_CATEGORIES: VoiceCategory[] = ["Movies", "TV Shows", "Wine"];

// "sci-fi" → "Sci-Fi", "comedy" → "Comedy" (the chip row's spelling).
const laneLabel = (k: string) => k.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("-");

// Lanes per category: label → the lane string the search sends.
export function lanesFor(cat: VoiceCategory): { label: string; lane: string }[] {
  const chips = CHIPS_BY_CATEGORY[cat].filter((c) => c.label !== SURPRISE_ME);
  if (cat === "Wine") return chips.map((c) => ({ label: c.label, lane: c.lane }));
  const extra = SLOT_LANES[cat === "Movies" ? "movie" : "tv"]
    .map(laneLabel)
    .filter((l) => !chips.some((c) => c.lane.toLowerCase() === l.toLowerCase()))
    .map((l) => ({ label: l, lane: l }));
  return [...chips.map((c) => ({ label: c.label, lane: c.lane })), ...extra];
}
export const refinerLabels = (cat: VoiceCategory): string[] => REFINERS_BY_CATEGORY[cat].map((r) => r.label);

export function buildMoodPrompt(): string {
  const lines: string[] = [
    "You map what a person says they are in the mood for onto a recommendation app's fixed search vocabulary. You never recommend anything yourself; you only choose tags.",
    "",
    "CATEGORIES and their vocabulary:",
  ];
  for (const cat of VOICE_CATEGORIES) {
    lines.push(
      `- ${cat}: lanes [${lanesFor(cat).map((l) => l.label).join(", ")}]; refiners [${refinerLabels(cat).join(", ")}]` +
        (cat === "Wine" ? `; price [${PRICE_CHIPS.map((p) => `${p.id} = ${p.label}`).join(", ")}]` : "")
    );
  }
  lines.push(
    "",
    "Rules:",
    "- category: the category the words clearly ask for (a movie, a show/series, a wine). If the words don't say, return null — the app uses the category the person already has selected (given below).",
    "- lane: the ONE lane from that category's list that best fits the mood, spelled exactly as listed. For a feeling with no genre word, choose the lane that feeling most often means (\"goofy\", \"something to laugh at\" = Comedy). null only when nothing fits.",
    "- refiner: at most ONE refiner from that category's list, only when the words call for it (\"light\", \"uplifting\" = Feel-good; \"dark\", \"twisted\" = Dark; \"clever\" = Smart; \"old\", \"classic\" = Classic; \"new\", \"recent\" = New). Otherwise null.",
    "- go_to: when the person names a specific title or wine as a reference (\"like Lioness but funnier\", \"something like my Bonanza\"), that name as they said it, cleaned up. Otherwise null.",
    "- price: wine only, when money is mentioned (\"cheap\", \"under twenty\" = under20; \"nice bottle\", \"splurge\" = splurge). Otherwise null.",
    "- mapped: false when the words can't be placed in any category's vocabulary at all; then closest = up to three lanes (from the selected category) a person would most likely tap instead. Otherwise mapped true and closest [].",
    "",
    'Return JSON only: { "category": "Movies" | "TV Shows" | "Wine" | null, "lane": string | null, "refiner": string | null, "go_to": string | null, "price": string | null, "mapped": boolean, "closest": string[] }'
  );
  return lines.join("\n");
}

export function buildMoodUser(args: {
  transcript: string;
  barCategory: string;
  goTos: { movies: string[]; tv: string[]; wine: string | null };
}): string {
  const g = args.goTos;
  const known = [
    ...g.movies.map((n) => `${n} (movie)`),
    ...g.tv.map((n) => `${n} (show)`),
    ...(g.wine ? [`${g.wine} (wine)`] : []),
  ];
  return [
    `Selected category: ${args.barCategory}`,
    known.length ? `The person's starred go-tos: ${known.join(", ")}` : "The person has no starred go-tos.",
    `They said: "${args.transcript}"`,
  ].join("\n");
}

// The words name the category → that category, decided here, not by the
// model (4o-mini held to the selected bar: "a horror movie" said on the
// Wine bar came back as wine, 3/3). The route then hands the model this
// category as the selected one, so it only chooses lanes inside it.
const CATEGORY_WORDS: [VoiceCategory, RegExp][] = [
  ["Movies", /\b(movie|movies|film|films|flick)\b/i],
  ["TV Shows", /\b(show|shows|series|tv|sitcom|docuseries|miniseries)\b/i],
  ["Wine", /\b(wine|wines|bottle|vino|red|reds|white|whites|ros[eé]|bubbly|bubbles|sparkling|prosecco|champagne|cava|cab|cabernet|merlot|pinot|chardonnay|sauvignon|riesling|malbec|zinfandel|crisp|oaky|buttery|tannic|full-?bodied|sipp?er|sipping|glass of)\b/i],
];
// A screen genre with no "movie"/"show" ("a goofy comedy") said on the
// Wine or Books bar is a movie: a wine is never a comedy.
const SCREEN_GENRE = /\b(comedy|comedies|rom-?com|horror|scary|thriller|drama|documentary|sci-?fi|action|romance|romantic|crime|mystery|animated|cartoon)\b/i;

export function categoryFromWords(transcript: string, barCategory?: string): VoiceCategory | null {
  const hits = CATEGORY_WORDS.filter(([, re]) => re.test(transcript)).map(([c]) => c);
  if (hits.length === 1) return hits[0];
  if (hits.length === 0 && barCategory !== "Movies" && barCategory !== "TV Shows" && SCREEN_GENRE.test(transcript)) {
    return "Movies";
  }
  return null;
}

export type MoodResult = {
  category: VoiceCategory | "Books";
  lane: { label: string; lane: string } | null;
  refiner: string | null;
  goTo: string | null;
  price: PriceChip | null;
  mapped: boolean;
  closest: string[];
};

const eq = (a: unknown, b: string) => typeof a === "string" && a.trim().toLowerCase() === b.toLowerCase();

// The guarantee: only the vocabulary survives. An unclear category falls
// back to the bar's; a mood that maps to nothing is honest about it.
export function validateMood(raw: any, barCategory: string, fromWords: VoiceCategory | null = null): MoodResult {
  const bar = barCategory === "TV Shows" || barCategory === "Wine" || barCategory === "Books" ? barCategory : "Movies";
  const asked = VOICE_CATEGORIES.find((c) => eq(raw?.category, c)) ?? null;
  const category: MoodResult["category"] = fromWords ?? asked ?? bar;
  if (category === "Books") {
    // Books is out of v1's scope: the transcript runs as the typed mood
    // search it would have been, nothing mapped.
    return { category, lane: null, refiner: null, goTo: null, price: null, mapped: false, closest: [] };
  }
  const lanes = lanesFor(category);
  const lane = lanes.find((l) => eq(raw?.lane, l.label) || eq(raw?.lane, l.lane)) ?? null;
  const refiner = refinerLabels(category).find((r) => eq(raw?.refiner, r)) ?? null;
  const price = category === "Wine" ? PRICE_CHIPS.find((p) => eq(raw?.price, p.id))?.id ?? null : null;
  const goTo =
    typeof raw?.go_to === "string" && raw.go_to.trim().length >= 2 ? raw.go_to.trim().slice(0, 120) : null;
  const mapped = raw?.mapped !== false && !!(lane || refiner || price || goTo);
  const closest = mapped
    ? []
    : (Array.isArray(raw?.closest) ? raw.closest : [])
        .map((c: unknown) => lanes.find((l) => eq(c, l.label))?.label)
        .filter((c: string | undefined): c is string => !!c)
        .filter((c: string, i: number, all: string[]) => all.indexOf(c) === i)
        .slice(0, 3);
  return { category, lane, refiner, goTo, price, mapped, closest };
}
