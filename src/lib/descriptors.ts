export type DescriptorKind = "experience" | "structural" | "new";

export type Descriptor = {
  kind: DescriptorKind;
  label: string;
};

export type RekCategory = "Movies" | "TV" | "Books" | "Wine";

/**
 * Locked rules (Display):
 * - display up to 3 items
 * - Structural leads (up to 2)
 * - Experience (0–1) is last “taste”
 * - "New" is secondary only and never standalone
 * - Never invent mappings; only tight + honest
 */

/* ---------------------------------------------
 * MOVIES: VIBE TAG → EXPERIENCE (locked set)
 * --------------------------------------------- */
export const VIBE_TO_EXPERIENCE_MOVIES: Record<string, string | null> = {
  "Weird / Offbeat": "Offbeat",
  "Suspense / Edge-of-Seat": "Thrilling",
  "Action / Adrenaline": "Thrilling",
  "Feel-Good Crowd Pleaser": "Uplifting",
  "Comfort Watch": "Uplifting",
  "Thought-Provoking / Meaningful": "Idea-Driven",
  "Goofy / Silly Fun": "Whimsical",
  "Romantic / Heartfelt": null, // intentionally unmapped (not in locked set)
};

// Backwards-compat export (existing imports won’t break)
export const VIBE_TO_EXPERIENCE = VIBE_TO_EXPERIENCE_MOVIES;

/* ---------------------------------------------
 * TV: VIBE TAG → EXPERIENCE (TV-native)
 * Keys must match your stored vibeTags.
 * --------------------------------------------- */
export const VIBE_TO_EXPERIENCE_TV: Record<string, string | null> = {
  "Bingeable": "Bingeable",
  "Comfort Watch": "Comfort Watch",
  "Cozy": "Cozy",
  "Slow Burn": "Slow-Burn",
  "High Tension": "High-Tension",
  "Twisty": "Twisty",
  "Mind Game": "Mind-Game",
  "Idea-Driven": "Idea-Driven",
  "Offbeat": "Offbeat",
  "Emotional": "Emotional",

  // Safe bridges if TV vibe tags reuse Movie labels:
  "Weird / Offbeat": "Offbeat",
  "Suspense / Edge-of-Seat": "High-Tension",
  "Action / Adrenaline": "High-Tension",
  "Feel-Good Crowd Pleaser": "Comfort Watch",
  "Thought-Provoking / Meaningful": "Idea-Driven",
  "Goofy / Silly Fun": null, // avoid “Whimsical” bleed
  "Romantic / Heartfelt": "Emotional",
};

/* ---------------------------------------------
 * BOOKS: VIBE TAG → EXPERIENCE (books-native)
 * --------------------------------------------- */
export const VIBE_TO_EXPERIENCE_BOOKS: Record<string, string | null> = {
  "Page Turner": "Page-Turner",
  "Slow Burn": "Slow-Burn",
  "Idea-Driven": "Idea-Driven",
  "Atmospheric": "Atmospheric",
  "Reflective": "Reflective",
  "Dark": "Dark",
  "Offbeat": "Offbeat",
  "Comfort Read": "Comfort Read",
  "Twisty": "Twisty",
  "Voice-Forward": "Voice-Forward",

  // Safe bridges if Book vibe tags reuse Movie labels:
  "Weird / Offbeat": "Offbeat",
  "Suspense / Edge-of-Seat": "Page-Turner",
  "Feel-Good Crowd Pleaser": "Comfort Read",
  "Comfort Watch": "Comfort Read",
  "Thought-Provoking / Meaningful": "Idea-Driven",
  "Goofy / Silly Fun": null, // no Whimsical bleed
  "Romantic / Heartfelt": null, // keep honest unless you add a books-native mapping later
};

/* ---------------------------------------------
 * WINE: VIBE TAG → EXPERIENCE (wine-native)
 * KEY POINT: NO “Whimsical” in Wine.
 * --------------------------------------------- */
export const VIBE_TO_EXPERIENCE_WINE: Record<string, string | null> = {
  "Crisp": "Crisp",
  "Refreshing": "Crisp",
  "Bright Acid": "Bright Acid",
  "Zesty": "Zesty",
  "Mineral": "Mineral-Driven",
  "Mineral-Driven": "Mineral-Driven",
  "Floral": "Floral",
  "Citrus": "Citrus-Driven",
  "Citrus-Driven": "Citrus-Driven",
  "Stone Fruit": "Stone-Fruit",
  "Stone-Fruit": "Stone-Fruit",
  "Tropical": "Tropical-Lean",
  "Tropical-Lean": "Tropical-Lean",
  "Round": "Round",
  "Lush": "Lush",
  "Food Friendly": "Food-Friendly",
  "Food-Friendly": "Food-Friendly",
  "Sipper": "Sipper",
  "Porch Wine": "Porch-Wine",
  "Porch-Wine": "Porch-Wine",
  "Dinner Wine": "Dinner-Wine",
  "Dinner-Wine": "Dinner-Wine",

  // Deliberately refuse movie-ish vibe tags:
  "Goofy / Silly Fun": null,
  "Weird / Offbeat": null,
  "Suspense / Edge-of-Seat": null,
  "Action / Adrenaline": null,
  "Feel-Good Crowd Pleaser": null,
  "Thought-Provoking / Meaningful": null,
  "Comfort Watch": null,
  "Romantic / Heartfelt": null,
};

/* ---------------------------------------------
 * EXPERIENCE PRIORITY (pick ONE)
 * --------------------------------------------- */
const EXPERIENCE_PRIORITY_MOVIES = [
  "Thrilling",
  "Offbeat",
  "Idea-Driven",
  "Uplifting",
  "Whimsical",
];

const EXPERIENCE_PRIORITY_TV = [
  "High-Tension",
  "Twisty",
  "Mind-Game",
  "Offbeat",
  "Idea-Driven",
  "Slow-Burn",
  "Bingeable",
  "Cozy",
  "Comfort Watch",
  "Emotional",
];

const EXPERIENCE_PRIORITY_BOOKS = [
  "Page-Turner",
  "Twisty",
  "Idea-Driven",
  "Atmospheric",
  "Slow-Burn",
  "Offbeat",
  "Reflective",
  "Voice-Forward",
  "Dark",
  "Comfort Read",
];

const EXPERIENCE_PRIORITY_WINE = [
  "Crisp",
  "Bright Acid",
  "Mineral-Driven",
  "Zesty",
  "Citrus-Driven",
  "Floral",
  "Stone-Fruit",
  "Tropical-Lean",
  "Round",
  "Lush",
  "Food-Friendly",
  "Sipper",
  "Porch-Wine",
  "Dinner-Wine",
];

/* ---------------------------------------------
 * NORMALIZATION (fixed: experience comes back)
 * --------------------------------------------- */
export function normalizeDescriptors(
  input: Descriptor[] | undefined | null,
  experiencePriority: string[] = EXPERIENCE_PRIORITY_MOVIES // default keeps old behavior
): Descriptor[] {
  if (!input || input.length === 0) return [];

  // De-dupe by kind + label (preserve first)
  const seen = new Set<string>();
  const deduped: Descriptor[] = [];

  for (const d of input) {
    const label = (d.label || "").trim();
    if (!label) continue;

    const key = `${d.kind}:${label.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    deduped.push({ kind: d.kind, label });
  }

  /* -------------------------------------------
   * SEMANTIC SUPPRESSION (surgical)
   * -------------------------------------------
   * If "Thriller" exists structurally,
   * drop redundant "Thrilling" experience.
   */
  const hasThrillerStructural = deduped.some(
    (d) => d.kind === "structural" && d.label === "Thriller"
  );

  const semanticallyCleaned = hasThrillerStructural
    ? deduped.filter(
        (d) => !(d.kind === "experience" && d.label === "Thrilling")
      )
    : deduped;

  // Separate by kind
  const structural = semanticallyCleaned.filter((d) => d.kind === "structural");
  const experience = semanticallyCleaned.filter((d) => d.kind === "experience");
  const isNew = semanticallyCleaned.filter((d) => d.kind === "new");

  // Pick ONE experience (by priority)
  let chosenExperience: Descriptor | null = null;
  for (const label of experiencePriority) {
    const match = experience.find((d) => d.label === label);
    if (match) {
      chosenExperience = match;
      break;
    }
  }

  // Assemble in display order
  let result: Descriptor[] = [
    ...structural.slice(0, 2),
    ...(chosenExperience ? [chosenExperience] : []),
  ];

  // Enforce max 3
  result = result.slice(0, 3);

  // Enforce "New" never standalone
  const nonNewCount = result.filter((d) => d.kind !== "new").length;
  if (nonNewCount === 0) return [];

  return result;
}

/* ---------------------------------------------
 * Builders (category-aware, mapping only)
 * --------------------------------------------- */
function buildDescriptors(args: {
  structural?: string[];
  vibeTags?: string[];
  map: Record<string, string | null>;
  experiencePriority: string[];
  isNew?: boolean;
}): Descriptor[] {
  const out: Descriptor[] = [];

  for (const s of args.structural || []) {
    out.push({ kind: "structural", label: s });
  }

  for (const vibe of args.vibeTags || []) {
    const mapped = args.map[vibe];
    if (mapped) out.push({ kind: "experience", label: mapped });
  }

  if (args.isNew) out.push({ kind: "new", label: "New" });

  return normalizeDescriptors(out, args.experiencePriority);
}

/* ---------------------------------------------
 * Adapter: Rek → Descriptors (by category)
 * --------------------------------------------- */
import type { Rek } from "../engine/rekomendrEngine";

function parseStructuralFromGenreString(genre?: string): string[] {
  return (
    genre
      ?.split("•")
      .map((g) => g.trim())
      .filter(Boolean) ?? []
  );
}

export function buildDescriptorsFromRek(
  rek: Rek,
  category: RekCategory
): Descriptor[] {
  const structural = parseStructuralFromGenreString(rek.genre);

  if (category === "Movies") {
    return buildDescriptors({
      structural,
      vibeTags: rek.vibeTags,
      map: VIBE_TO_EXPERIENCE_MOVIES,
      experiencePriority: EXPERIENCE_PRIORITY_MOVIES,
      isNew: false,
    });
  }

  if (category === "TV") {
    return buildDescriptors({
      structural,
      vibeTags: rek.vibeTags,
      map: VIBE_TO_EXPERIENCE_TV,
      experiencePriority: EXPERIENCE_PRIORITY_TV,
      isNew: false,
    });
  }

  if (category === "Books") {
    return buildDescriptors({
      structural,
      vibeTags: rek.vibeTags,
      map: VIBE_TO_EXPERIENCE_BOOKS,
      experiencePriority: EXPERIENCE_PRIORITY_BOOKS,
      isNew: false,
    });
  }

  // Wine
  return buildDescriptors({
    structural,
    vibeTags: rek.vibeTags,
    map: VIBE_TO_EXPERIENCE_WINE,
    experiencePriority: EXPERIENCE_PRIORITY_WINE,
    isNew: false,
  });
}

/* ---------------------------------------------
 * Backward-compat: Movie-only export used today
 * --------------------------------------------- */
export function buildMovieDescriptorsFromRek(rek: Rek): Descriptor[] {
  return buildDescriptorsFromRek(rek, "Movies");
}
