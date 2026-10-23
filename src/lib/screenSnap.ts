// src/lib/screenSnap.ts — server-only. S15: the streaming-screen snap
// (docs/s15-screen-snap-plan.md).
//
// A photo of a streaming app's row or Top 10 → the titles you can see
// (up to five), each a real TMDb title, ranked against the nearest go-to:
//   1. READ    one vision call (the S14 vision step) lists the legible
//              titles and the service. The prompt is extraction plumbing:
//              it writes no text a person reads.
//   2. GUARD   every title resolves on TMDb (resolveSnappedTitle) or is
//              dropped. What ships is TMDb's title, never the model's.
//   3. RANK    against the nearest go-to (or the one Steer by picked):
//              TMDb's own neighbour links both ways, shared genres, same
//              kind. No go-to → TMDb's rating, weighted by votes.
// The lines ("vs. your Lioness: …") come from linesVsGoTo, the S12 writer.

if (typeof window !== "undefined") {
  throw new Error("screenSnap.ts was imported in a browser bundle.");
}

import { jsonText, llmCall } from "./llm";
import {
  loadMediaBundle,
  resolveSnappedTitle,
  type MediaBundle,
  type MediaKind,
} from "./tmdbMedia";
import { normalizeTitle } from "./tmdbVerify";
import type { LoadedGoTo } from "./slotRecipe";

export const SCREEN_MAX = 5;
const READ_MAX = 8;

export const SCREEN_READ_PROMPT =
  "You read photos of TV, computer and phone screens. Decide whether the photo shows a streaming service's browse screen: a row of titles, a Top 10, a home page or a category page (Netflix, Prime Video, Disney+, Max, Hulu, Apple TV+, Peacock, Paramount+, Tubi and the like) with SEVERAL movie or show tiles.\n" +
  "Rules:\n" +
  "- titles: every movie or show whose NAME you can actually read on the screen (the title art on its tile, or a label on or under it), in reading order: top row first, left to right. At most 8.\n" +
  "- Never guess a title from a face, a scene, a colour or a partial word. If a tile's name is not legible, skip that tile.\n" +
  "- Ignore the service's own name, menu items, row headings ('Top 10 TV Shows in the U.S. Today', 'Continue Watching'), rank numbers and badges ('New Season', 'Recently Added', 'Top 10').\n" +
  "- kind: 'tv' when the tile or its row says it is a series (a 'TV Shows' row, 'New Episodes', 'Limited Series'), 'movie' for a film row, otherwise 'unknown'.\n" +
  "- service: the streaming service the screen belongs to, from its logo or layout, or null if unsure.\n" +
  "- A single poster, a DVD box, a TV showing one programme, or anything that is not a browse screen of several titles: is_screen false and titles empty.\n" +
  'Return JSON only: { "is_screen": boolean, "service": string | null, "titles": [ { "title": string, "kind": "movie" | "tv" | "unknown" } ] }';

export const SCREEN_READ_SCHEMA = {
  type: "object",
  properties: {
    is_screen: { type: "boolean" },
    service: { anyOf: [{ type: "string" }, { type: "null" }] },
    titles: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          kind: { type: "string", enum: ["movie", "tv", "unknown"] },
        },
        required: ["title", "kind"],
        additionalProperties: false,
      },
    },
  },
  required: ["is_screen", "service", "titles"],
  additionalProperties: false,
};

// The services by the names their apps use. A read the list doesn't know
// ships no "on …" (the card says nothing rather than something wrong).
const SERVICES: [RegExp, string][] = [
  [/netflix/i, "Netflix"],
  [/prime|amazon/i, "Prime Video"],
  [/disney/i, "Disney+"],
  [/\bhbo\b|\bmax\b/i, "Max"],
  [/hulu/i, "Hulu"],
  [/apple/i, "Apple TV+"],
  [/peacock/i, "Peacock"],
  [/paramount/i, "Paramount+"],
  [/tubi/i, "Tubi"],
  [/youtube/i, "YouTube"],
  [/crave/i, "Crave"],
  [/starz/i, "Starz"],
  [/showtime/i, "Showtime"],
];
export function canonicalService(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  for (const [re, name] of SERVICES) if (re.test(s)) return name;
  return null;
}

export type ScreenRead = {
  service: string | null;
  titles: { title: string; kind: MediaKind | "any" }[];
};

// Null = not a screen of several titles (the normal snap path answers).
export async function readScreen(image: string): Promise<ScreenRead | null> {
  const started = Date.now();
  const completion = await llmCall({
    step: "vision",
    temperature: 0,
    maxTokens: 600,
    system: SCREEN_READ_PROMPT,
    user: [{ type: "image", url: image, detail: "high" }],
    schema: SCREEN_READ_SCHEMA,
  });
  let parsed: any = null;
  try {
    parsed = JSON.parse(jsonText(completion.text));
  } catch {
    console.warn("[screen] read returned non-JSON — normal snap path", {
      model: completion.model,
      head: completion.text.slice(0, 160),
    });
    return null;
  }
  const titles = (Array.isArray(parsed?.titles) ? parsed.titles : [])
    .map((t: any) => ({
      title: typeof t?.title === "string" ? t.title.trim().slice(0, 120) : "",
      kind: (t?.kind === "movie" || t?.kind === "tv" ? t.kind : "any") as MediaKind | "any",
    }))
    .filter((t: { title: string }) => t.title.length > 0)
    .slice(0, READ_MAX);
  console.info("[screen] read", {
    isScreen: parsed?.is_screen === true,
    service: parsed?.service ?? null,
    titles: titles.length,
    ms: Date.now() - started,
  });
  if (parsed?.is_screen !== true || titles.length < 2) return null;
  return { service: canonicalService(parsed?.service), titles };
}

// THE GUARD. Each read title resolves on TMDb or is dropped (named in the
// log); duplicates collapse; the first five survivors, in screen order.
export async function resolveScreen(read: ScreenRead): Promise<MediaBundle[]> {
  const hits = await Promise.all(
    read.titles.map(async (t) => {
      try {
        const hit = await resolveSnappedTitle(t.title, t.kind);
        return hit ? await loadMediaBundle(hit.kind, hit.id) : null;
      } catch {
        return null;
      }
    })
  );
  const out: MediaBundle[] = [];
  const seen = new Set<string>();
  hits.forEach((b, i) => {
    if (!b) {
      console.info("[screen] not on TMDb — dropped", { read: read.titles[i].title });
      return;
    }
    const k = `${b.kind}:${b.id}`;
    if (seen.has(k) || out.length >= SCREEN_MAX) return;
    seen.add(k);
    out.push(b);
  });
  return out;
}

// Re-rank (a Steer by tap): the titles already resolved, by TMDb id.
export async function loadScreenTitles(ids: { kind: MediaKind; id: number }[]): Promise<MediaBundle[]> {
  const bundles = await Promise.all(
    ids.slice(0, SCREEN_MAX).map((t) => loadMediaBundle(t.kind, t.id).catch(() => null))
  );
  return bundles.filter((b): b is MediaBundle => !!b);
}

/* ------------------------------------------------------------------
   RANKING
------------------------------------------------------------------- */
const jaccard = (a: number[], b: number[]) => {
  if (!a.length || !b.length) return 0;
  const A = new Set(a);
  const inter = b.filter((x) => A.has(x)).length;
  return inter / (A.size + b.length - inter);
};

// TMDb's rating, pulled toward the middle when few people voted (an IMDb-
// style weighted rating), so a 9.1 from 40 votes doesn't outrank a 8.4
// from 20,000.
const PRIOR_VOTES = 200;
const PRIOR_MEAN = 6.8;
export const weightedRating = (b: MediaBundle) => {
  const v = b.votes ?? 0;
  const r = b.rating ?? PRIOR_MEAN;
  return (v / (v + PRIOR_VOTES)) * r + (PRIOR_VOTES / (v + PRIOR_VOTES)) * PRIOR_MEAN;
};

// How close a title sits to a go-to: TMDb lists it as the go-to's
// neighbour (or the reverse), the genres they share, the same kind. The
// weighted rating breaks ties.
export function closeness(title: MediaBundle, goTo: MediaBundle): number {
  const linked = goTo.candidates.some((c) => c.id === title.id && c.kind === title.kind) ? 3 : 0;
  const back = title.candidates.some((c) => c.id === goTo.id && c.kind === goTo.kind) ? 3 : 0;
  return (
    linked +
    back +
    2 * jaccard(title.genreIds, goTo.genreIds) +
    (title.kind === goTo.kind ? 0.5 : 0) +
    weightedRating(title) / 100
  );
}

export type Ranked = {
  titles: MediaBundle[];
  steer: LoadedGoTo | null;
  // The go-tos, nearest to this screen first (the Steer by row's order).
  order: LoadedGoTo[];
};

export function rankScreen(titles: MediaBundle[], goTos: LoadedGoTo[], steerName: string | null): Ranked {
  const usable = goTos.filter((g) => g.bundle);
  const total = (g: LoadedGoTo) => titles.reduce((s, t) => s + closeness(t, g.bundle!), 0);
  const recency = (g: LoadedGoTo) => Date.parse(g.at ?? "") || 0;
  const order = usable
    .map((g) => ({ g, s: total(g) }))
    .sort((a, b) => b.s - a.s || recency(b.g) - recency(a.g))
    .map((x) => x.g);
  const asked = steerName ? normalizeTitle(steerName) : null;
  const steer = (asked && order.find((g) => normalizeTitle(g.name) === asked)) || order[0] || null;
  const score = (t: MediaBundle) => (steer?.bundle ? closeness(t, steer.bundle) : weightedRating(t));
  const ranked = titles
    .map((t, i) => ({ t, i, s: score(t) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.t);
  return { titles: ranked, steer, order };
}
