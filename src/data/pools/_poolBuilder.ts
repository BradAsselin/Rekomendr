// src/data/pools/_poolBuilder.ts

export type Tier = "T1" | "T2" | "T3";

export type VibeTag =
  | "Feel-Good Crowd Pleaser"
  | "Thought-Provoking / Meaningful"
  | "Smart / Idea-Driven"
  | "Thrilling"
  | "Whimsical"
  | "Offbeat"
  | "Uplifting"
  | "Dark"
  | "Cozy"
  | "Romantic"
  | "Prestige"
  | "Blockbuster"
  | "Underrated Gem"
  | "True Story / Real-World"
  | "Gritty"
  | "Mind-Bendy"
  | "Epic / Immersive";

export interface Rek {
  id: number;
  title: string;
  year: number;
  short: string;
  long: string;
  trailerUrl: string;
  genre: string;
  vibeTags: string[];
  tier?: Tier;
}

export interface RawRekEntry {
  title: string;
  year: number;
  genre: string;
  vibeTags: VibeTag[];
  tier: Tier;

  // Optional overrides (use for Tier-1 anchors)
  short?: string;
  long?: string;
  trailerUrl?: string;
}

/** YouTube search URL (stable, no API keys) */
function ytSearchUrl(title: string) {
  const q = encodeURIComponent(`${title} trailer`);
  return `https://www.youtube.com/results?search_query=${q}`;
}

/** Split "Drama • Comedy • Romance" into ["Drama","Comedy","Romance"] */
function genreTokens(genre: string): string[] {
  return (genre || "")
    .split("•")
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Simple deterministic hash so wording is stable per title */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

function hasTag(vibes: string[], tag: string) {
  return (vibes || []).includes(tag);
}

function vibePhrase(vibes: string[]) {
  if (hasTag(vibes, "Thrilling")) return "tight momentum and forward motion";
  if (hasTag(vibes, "Mind-Bendy")) return "clever, idea-first energy";
  if (hasTag(vibes, "Uplifting")) return "an easy, uplifting lift";
  if (hasTag(vibes, "Offbeat")) return "a little personality and edge";
  if (hasTag(vibes, "Cozy")) return "comfortable, low-friction viewing";
  if (hasTag(vibes, "Romantic")) return "heartfelt, romantic pull";
  if (hasTag(vibes, "Gritty")) return "a grounded, gritty texture";
  if (hasTag(vibes, "Dark")) return "darker tone and intensity";
  if (hasTag(vibes, "Prestige")) return "strong craft and confidence";
  if (hasTag(vibes, "Epic / Immersive")) return "big-scope immersion";
  return "a solid, in-lane pick";
}

/**
 * IMPORTANT:
 * - We do NOT repeat the title/year in the short line (UI already shows it).
 * - T1 should be overridden with real copy.
 * - T2/T3 use tier-aware templates so it feels like progression, not spam.
 */
function makeShort(args: {
  title: string;
  year: number;
  genre: string;
  vibeTags: string[];
  tier: Tier;
}) {
  const { title, year, genre, vibeTags, tier } = args;
  const seed = hashString(`${title}-${year}-SHORT-${tier}`);

  const g = genreTokens(genre);
  const g1 = (g[0] || "Story").toLowerCase();
  const g2 = (g[1] || "").toLowerCase();
  const lane = g2 ? `${g1}/${g2}` : g1;

  const vibe = vibePhrase(vibeTags);

  const base = [
    `A ${lane} pick with ${vibe}.`,
    `A ${lane} lane choice that keeps the session feeling credible.`,
    `In the ${lane} lane — built for ${vibe}.`,
    `A strong ${lane} option when you want ${vibe}.`,
    `A clean ${lane} pick that’s easy to recommend.`,
    `A reliable ${lane} choice with ${vibe}.`,
  ];

  const refined = [
    `A refined ${lane} pick — familiar, but with more texture.`,
    `A “next-step” ${lane} choice: still accessible, slightly richer.`,
    `Familiar-feeling ${lane}, but with sharper edges and more bite.`,
    `A confident ${lane} pick when you want something a notch above basic.`,
    `A solid upgrade pick in the ${lane} lane — still easy to like.`,
  ];

  const discovery = [
    `A discovery-leaning ${lane} pick — still in-lane, just less obvious.`,
    `Slightly left-of-center ${lane}, but it holds attention.`,
    `A less-overplayed ${lane} pick when you want something fresh.`,
    `A “trust me” ${lane} choice — not weird, just not the usual suspects.`,
    `A deeper-cut ${lane} option with ${vibe}.`,
  ];

  const templates =
    tier === "T3" ? [...base, ...discovery] : tier === "T2" ? [...base, ...refined] : base;

  return pick(templates, seed);
}

function makeLong(args: {
  title: string;
  year: number;
  genre: string;
  vibeTags: string[];
  tier: Tier;
}) {
  const { title, year, genre, vibeTags, tier } = args;
  const seed = hashString(`${title}-${year}-LONG-${tier}`);

  const g = genreTokens(genre);
  const g1 = (g[0] || "story").toLowerCase();
  const g2 = (g[1] || "").toLowerCase();
  const lane = g2 ? `${g1}/${g2}` : g1;

  const vibe = vibePhrase(vibeTags);

  const openersBase = [
    `This one keeps you in the ${lane} lane with ${vibe}.`,
    `If you want ${vibe}, this is a clean pick.`,
    `A dependable choice that stays in-lane without feeling bland.`,
    `It’s accessible, well-made, and doesn’t demand homework.`,
    `This is a “confidence pick” that usually plays well with most people.`,
  ];

  const openersT2 = [
    `A refined step in the ${lane} lane — recognizable, but richer.`,
    `This is where the picks start feeling less obvious and more intentional.`,
    `Still familiar, but it has enough texture to keep you engaged.`,
    `A good “tier-two” choice when you want something better than default.`,
  ];

  const openersT3 = [
    `A deeper-cut pick in the ${lane} lane — fresher, but not a gamble.`,
    `This is the “slightly unfamiliar” zone: still coherent, less overplayed.`,
    `A discovery pick that stays in-lane and rewards attention.`,
    `If you want depth without going fully art-house, this lands nicely.`,
  ];

  const closersBase = [
    `It’s the kind of title that keeps momentum in a session and reduces repeats.`,
    `It tends to work whether you’re watching closely or letting it ride.`,
    `Strong pacing and tone consistency — it doesn’t wobble.`,
    `It fits a lot of moods without feeling generic.`,
    `A good bridge between comfort and discovery.`,
  ];

  const closersT2 = [
    `It’s a nice “upgrade pick” — familiar, but with more bite than the basics.`,
    `It feels credible and specific without turning into a niche pick.`,
    `It stays approachable while giving you something a little smarter or richer.`,
  ];

  const closersT3 = [
    `It keeps the session feeling deep — less obvious, still satisfying.`,
    `It’s a great way to avoid repetition while staying coherent.`,
    `It signals depth without losing the user.`,
  ];

  const openers =
    tier === "T3"
      ? [...openersBase, ...openersT3]
      : tier === "T2"
      ? [...openersBase, ...openersT2]
      : openersBase;

  const closers =
    tier === "T3"
      ? [...closersBase, ...closersT3]
      : tier === "T2"
      ? [...closersBase, ...closersT2]
      : closersBase;

  return `${pick(openers, seed)} ${pick(closers, seed + 11)}`;
}

/**
 * Turn compact entries into full Rek objects with stable ids.
 * Ids are stable by array order. Append new items; avoid reordering after ship.
 */
export function buildPool(raw: RawRekEntry[], startId = 1): Rek[] {
  return raw.map((r, idx) => {
    const trailer = r.trailerUrl || ytSearchUrl(r.title);

    // Use overrides when present (Tier-1 anchors should override)
    const short =
      r.short ||
      makeShort({
        title: r.title,
        year: r.year,
        genre: r.genre,
        vibeTags: r.vibeTags,
        tier: r.tier,
      });

    const long =
      r.long ||
      makeLong({
        title: r.title,
        year: r.year,
        genre: r.genre,
        vibeTags: r.vibeTags,
        tier: r.tier,
      });

    return {
      id: startId + idx,
      title: r.title,
      year: r.year,
      short,
      long,
      trailerUrl: trailer,
      genre: r.genre,
      vibeTags: r.vibeTags,
      tier: r.tier,
    };
  });
}
