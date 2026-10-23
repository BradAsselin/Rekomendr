// src/lib/mediaReks.ts — server-only. S3.0: the five reks under a media
// anchor (movies/TV, snapped or typed), Brad's architecture of 2026-10-12:
//   (a) the anchor's description is TMDb's overview, verbatim — no model;
//   (b) candidates are TMDb recommendations + similar for the anchor;
//   (c) the model's job is to CHOOSE the best five for this user (likes,
//       dislikes, watched, lane) and write one comparison line each,
//       grounded in each candidate's TMDb overview;
//   (d) one wildcard slot may come from the model's own knowledge,
//       verified against TMDb before it ships (the S1.5 rule).
// Wine and every other category keep their existing paths.
//
// Two-tier exclusion canon (§2.12): disliked, watched, already-liked and
// the anchor are removed from the candidate pool BEFORE the model sees it
// and checked again on the wildcard — the guarantee. The taste lists in
// the prompt are pressure.

if (typeof window !== "undefined") {
  throw new Error("mediaReks.ts was imported in a browser bundle.");
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { jsonText, llmCall } from "./llm";
import { normalizeTitle, logFakeTitles } from "./tmdbVerify";
import {
  mediaCategoryFor,
  resolveExactTitle,
  type MediaKind,
  type TmdbCandidate,
} from "./tmdbMedia";

export type MediaRek = {
  name: string;
  // The comparison line — the card's short.
  description: string;
  // TMDb's overview, verbatim — the card's "Show details".
  long: string;
  year: number | null;
  category: string;
  rank: number;
  // Diagnostic only; the client ignores it.
  source: "tmdb" | "wildcard";
};

export type Taste = {
  liked: string[];
  disliked: string[];
  watched: string[];
};

export const EMPTY_TASTE: Taste = { liked: [], disliked: [], watched: [] };

const OVERVIEW_CHARS = 280;
const TASTE_TITLES = 15;

const CHOOSER_PROMPT =
  "You pick and explain recommendations for one person who just looked up a title — the ANCHOR. You get the anchor's official synopsis and a numbered list of CANDIDATES, each with its official synopsis.\n" +
  "\n" +
  "YOUR JOB:\n" +
  "1. Choose the five candidates this person will most want to watch next, best first. Fit to the anchor comes first; then their taste — lean toward what they LIKED, away from what they DISLIKED, and toward the LANE when one is given. Prefer titles a well-read friend would actually name over obscure filler.\n" +
  "2. For each pick write ONE line: a single sentence of at most 24 words saying how it compares to the anchor.\n" +
  "3. WILDCARD (optional): if you know a real title that is NOT in the list and fits this person better than your fifth pick, give it with its release year and a line. Otherwise null.\n" +
  "\n" +
  "THE LINE:\n" +
  "- Ground it. Use only what the two synopses say plus the title's widely known tone. Never invent a plot point, a character or an ending.\n" +
  "- Open on the comparison itself — a bare comparative or a same-but: 'Same CIA-recruit-goes-undercover pressure, but the mole is inside the Agency.' / 'Lighter and funnier, with the band-as-escape plot moved to an American high school.'\n" +
  "- The anchor is on screen directly above. Never name it; never write 'than the one you looked up'.\n" +
  "- Name ONE concrete thing from the candidate's own synopsis — a person, a job, a place, an event. Never a list of genre adjectives.\n" +
  "- BANNED: 'fans of', 'perfect for', 'ideal for', 'if you enjoyed', 'if you liked', 'explores', 'delves into', 'journey', 'must-watch', 'gripping', 'captivating', 'compelling', 'a classic', 'known for', and 'experience' as a noun.\n" +
  "- RIGHT: 'Swaps the battlefield for a Dublin bedroom — a teenager forms a band to win a girl, and the songs carry the story.'\n" +
  "- WRONG: 'A heartfelt and compelling coming-of-age journey that fans of music films will love.' (no comparison, no concrete thing, banned words)\n" +
  "\n" +
  'Return JSON only: { "picks": [ { "n": number, "line": string } ], "wildcard": { "title": string, "year": number, "line": string } | null }\n' +
  "picks: five DISTINCT candidate numbers from the list (fewer only when the list is shorter), best first.";

// When TMDb's web is thin (a brand-new title with no neighbours yet), the
// own-knowledge slots grow to fill five — every one still verified.
// S13d — the chooser's reply shape, for Claude's structured outputs (the
// prompt's own "Return JSON only" line, as a schema; OpenAI ignores it).
const titleLine = {
  type: "object",
  additionalProperties: false,
  properties: { title: { type: "string" }, year: { type: "integer" }, line: { type: "string" } },
  required: ["title", "year", "line"],
};
const CHOOSER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    picks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { n: { type: "integer" }, line: { type: "string" } },
        required: ["n", "line"],
      },
    },
    wildcard: { anyOf: [titleLine, { type: "null" }] },
    own: { type: "array", items: titleLine },
  },
  required: ["picks", "wildcard"],
};

const ownSlotsNote = (candidates: number) =>
  candidates >= 5
    ? ""
    : `\nThe list has only ${candidates} candidate${candidates === 1 ? "" : "s"}. Return them all as picks, and instead of a single wildcard return "own": up to ${5 - candidates} real titles from your own knowledge, each { "title", "year", "line" }, best first.`;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function buildUserMessage(args: {
  anchor: { title: string; year: number | null; kind: MediaKind; overview: string };
  lane: string | null;
  taste: Taste;
  candidates: TmdbCandidate[];
}): string {
  const { anchor, lane, taste, candidates } = args;
  const kindWord = anchor.kind === "movie" ? "movie" : "TV show";
  const recent = (list: string[]) => list.slice(-TASTE_TITLES).join("; ") || "(none)";
  return [
    `ANCHOR (${kindWord}): ${anchor.title}${anchor.year ? ` (${anchor.year})` : ""}`,
    `Synopsis: ${anchor.overview || "(no synopsis available)"}`,
    `LANE: ${lane || "(none)"}`,
    `LIKED: ${recent(args.taste.liked)}`,
    `DISLIKED: ${recent(taste.disliked)}`,
    "",
    "CANDIDATES:",
    ...candidates.map(
      (c, i) => `${i + 1}. ${c.title}${c.year ? ` (${c.year})` : ""} — ${clip(c.overview, OVERVIEW_CHARS)}`
    ),
  ].join("\n");
}

const lineOf = (raw: unknown): string => {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim();
};

type OwnPick = { title: string; year: number | null; line: string };

const asOwn = (raw: any): OwnPick | null => {
  if (!raw || typeof raw.title !== "string" || !raw.title.trim()) return null;
  const line = lineOf(raw.line);
  if (!line) return null;
  const y = Number(raw.year);
  return { title: raw.title.trim(), year: Number.isFinite(y) && y > 1880 ? y : null, line };
};

export async function chooseMediaReks(args: {
  anchor: { title: string; year: number | null; kind: MediaKind; overview: string };
  candidates: TmdbCandidate[];
  taste: Taste;
  lane?: string | null;
  // Which path asked, for the logs ("typed" | "snap").
  path: "typed" | "snap";
}): Promise<MediaRek[]> {
  const { anchor, taste, path } = args;
  const lane = args.lane?.trim() || null;
  const category = mediaCategoryFor(anchor.kind);

  // THE GUARANTEE: excluded titles never reach the model.
  const excluded = new Set(
    [anchor.title, ...taste.liked, ...taste.disliked, ...taste.watched]
      .map(normalizeTitle)
      .filter(Boolean)
  );
  const candidates = args.candidates.filter((c) => !excluded.has(normalizeTitle(c.title)));
  const droppedByTaste = args.candidates.length - candidates.length;

  const started = Date.now();
  const completion = await llmCall({
    step: "lines",
    schema: CHOOSER_SCHEMA,
    temperature: 0.5,
    maxTokens: 900,
    system: CHOOSER_PROMPT + ownSlotsNote(candidates.length),
    user: buildUserMessage({ anchor, lane, taste, candidates }),
  });
  let parsed: any = null;
  try {
    parsed = JSON.parse(jsonText(completion.text));
  } catch {
    console.warn("[media-reks] chooser returned non-JSON", { path, anchor: anchor.title, model: completion.model, head: completion.text.slice(0, 160) });
    return [];
  }

  // Picks: valid numbers only, distinct, each with a line.
  const picked: MediaRek[] = [];
  const usedIds = new Set<number>();
  let invalidPicks = 0;
  for (const p of Array.isArray(parsed?.picks) ? parsed.picks : []) {
    const n = Number(p?.n);
    const c = Number.isInteger(n) ? candidates[n - 1] : undefined;
    const line = lineOf(p?.line);
    if (!c || usedIds.has(c.id) || !line) {
      invalidPicks++;
      continue;
    }
    usedIds.add(c.id);
    picked.push({
      name: c.title,
      description: line,
      long: c.overview,
      year: c.year,
      category,
      rank: 0,
      source: "tmdb",
    });
    if (picked.length >= 5) break;
  }

  // Own-knowledge titles: the single wildcard, or the "own" fill when the
  // pool was short. Every one is checked against TMDb (title + year ±1)
  // and against the exclusion set; a miss is dropped and logged with the
  // anchor that produced it (the S1.5 tripwire).
  const ownRaw: OwnPick[] = (
    candidates.length >= 5
      ? [asOwn(parsed?.wildcard)]
      : (Array.isArray(parsed?.own) ? parsed.own : []).map(asOwn)
  ).filter((o: OwnPick | null): o is OwnPick => !!o);

  const pickedKeys = new Set(picked.map((r) => normalizeTitle(r.name)));
  const own: MediaRek[] = [];
  const dropped: { title: string; reason?: "no_match" }[] = [];
  for (const o of ownRaw) {
    const k = normalizeTitle(o.title);
    if (!k || excluded.has(k) || pickedKeys.has(k)) continue;
    const hit = await resolveExactTitle(o.title, o.year, anchor.kind);
    if (!hit || excluded.has(normalizeTitle(hit.title)) || usedIds.has(hit.id)) {
      if (!hit) dropped.push({ title: o.title, reason: "no_match" });
      continue;
    }
    usedIds.add(hit.id);
    pickedKeys.add(normalizeTitle(hit.title));
    own.push({
      name: hit.title,
      description: o.line,
      long: hit.overview,
      year: hit.year,
      category,
      rank: 0,
      source: "wildcard",
    });
  }
  if (dropped.length > 0) {
    logFakeTitles({
      path: path === "typed" ? "anchor-typed" : "anchor-snap",
      anchor: anchor.title,
      category,
      dropped,
      kept: picked.length + own.length,
      enabled: true,
    });
  }

  // Assembly: the wildcard takes slot five; a short pool is filled by
  // own picks in order.
  const final =
    candidates.length >= 5
      ? own.length > 0
        ? [...picked.slice(0, 4), own[0]]
        : picked.slice(0, 5)
      : [...picked, ...own].slice(0, 5);
  const ranked = final.map((r, i) => ({ ...r, rank: i + 1 }));

  console.info("[media-reks]", {
    path,
    anchor: anchor.title,
    kind: anchor.kind,
    pool: args.candidates.length,
    droppedByTaste,
    invalidPicks,
    wildcard: own.length > 0 ? own.map((o) => o.name) : null,
    shipped: ranked.length,
    chooserMs: Date.now() - started,
  });
  if (ranked.length < 5) {
    console.warn("[media-reks] short set", { path, anchor: anchor.title, shipped: ranked.length });
  }
  return ranked;
}

/* ------------------------------------------------------------------
   S12 — LINES ONLY, against a go-to. The slot recipe has already chosen
   the five (src/lib/slotRecipe.ts); this asks the SAME chooser — the
   prompt above, verbatim, no new instruction — for one comparison line
   per candidate, with the person's go-to as the anchor. The candidates
   are exactly the five, so its "choose five" job returns them all; its
   own-knowledge wildcard is ignored (the recipe keeps its own). The card
   then leads "vs. your <go-to>: <line>" — the approved wording.
   Returns a line per candidate id; a missing line means that card keeps
   TMDb's synopsis and no lead.
------------------------------------------------------------------- */
export async function linesVsGoTo(args: {
  goTo: { title: string; year: number | null; kind: MediaKind; overview: string };
  candidates: TmdbCandidate[];
  taste: Taste;
  lane?: string | null;
}): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (args.candidates.length === 0) return out;
  const started = Date.now();
  const completion = await llmCall({
    step: "lines",
    schema: CHOOSER_SCHEMA,
    temperature: 0.5,
    maxTokens: 900,
    system: CHOOSER_PROMPT + ownSlotsNote(args.candidates.length),
    user: buildUserMessage({
      anchor: args.goTo,
      lane: args.lane?.trim() || null,
      taste: args.taste,
      candidates: args.candidates,
    }),
  });
  let parsed: any = null;
  try {
    parsed = JSON.parse(jsonText(completion.text));
  } catch {
    console.warn("[slots] line writer returned non-JSON", { goTo: args.goTo.title, model: completion.model, head: completion.text.slice(0, 160) });
    return out;
  }
  for (const p of Array.isArray(parsed?.picks) ? parsed.picks : []) {
    const n = Number(p?.n);
    const c = Number.isInteger(n) ? args.candidates[n - 1] : undefined;
    const line = lineOf(p?.line);
    if (c && line && !out.has(c.id)) out.set(c.id, line);
  }
  console.info("[slots] lines vs go-to", {
    goTo: args.goTo.title,
    asked: args.candidates.length,
    lines: out.size,
    ms: Date.now() - started,
  });
  return out;
}

/* ------------------------------------------------------------------
   TASTE — server-side read of this client's media taste, raced so no
   rek ever waits on history (the same posture as the snap path's prior
   dislikes). user_likes (search lane: like/save/more_like_this, dislike,
   watched) and reksnap_signals (snap lane: like/save, dislike). Any
   failure means no taste, never an error.
------------------------------------------------------------------- */
const TASTE_RACE_MS = 400;
const TASTE_WINDOW_DAYS = 180;
const LIKE_ACTIONS = new Set(["like", "save", "more_like_this"]);

let readerPromise: Promise<SupabaseClient | null> | null = null;
const getReader = (): Promise<SupabaseClient | null> => {
  if (!readerPromise) {
    readerPromise =
      process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
        ? import("./supabaseServer").then((m) => m.supabaseServer).catch(() => null)
        : Promise.resolve(null);
  }
  return readerPromise;
};

const escapeLike = (s: string) => s.replace(/([\\%_])/g, "\\$1");

async function readTaste(clientId: string, kind: MediaKind): Promise<Taste> {
  const reader = await getReader();
  if (!reader) return EMPTY_TASTE;
  const laneLabel = kind === "movie" ? "movies" : "tv shows";
  const snapCats = kind === "movie" ? ["movies", "movie", "film"] : ["tv", "tv shows", "tv show"];
  const cutoff = new Date(Date.now() - TASTE_WINDOW_DAYS * 864e5).toISOString();

  const [likes, signals] = await Promise.all([
    reader
      .from("user_likes")
      .select("title, action, created_at")
      .eq("client_id", clientId)
      .ilike("category", escapeLike(laneLabel))
      .order("created_at", { ascending: false })
      .limit(300),
    reader
      .from("reksnap_signals")
      .select("item_name, item_category, action, created_at")
      .eq("client_id", clientId)
      .in("item_category", snapCats)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const liked: string[] = [];
  const disliked: string[] = [];
  const watched: string[] = [];
  // Newest-first rows → oldest-first arrays, so the prompt's tail slice
  // is the newest (the convention every taste consumer here uses).
  const take = (title: unknown, action: unknown) => {
    if (typeof title !== "string" || !title.trim()) return;
    if (typeof action !== "string") return;
    if (LIKE_ACTIONS.has(action)) liked.unshift(title.trim());
    else if (action === "dislike") disliked.unshift(title.trim());
    else if (action === "watched") watched.unshift(title.trim());
  };
  for (const r of (likes.data ?? []) as any[]) take(r?.title, r?.action);
  for (const r of (signals.data ?? []) as any[]) take(r?.item_name, r?.action);
  if (likes.error || signals.error) {
    console.warn("[media-reks] taste read partial", {
      likes: likes.error?.code ?? null,
      signals: signals.error?.code ?? null,
    });
  }
  const uniq = (a: string[]) => {
    const seen = new Set<string>();
    return a.filter((t) => {
      const k = normalizeTitle(t);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  return { liked: uniq(liked), disliked: uniq(disliked), watched: uniq(watched) };
}

export function raceTaste(clientId: string | null, kind: MediaKind): Promise<Taste> {
  if (!clientId) return Promise.resolve(EMPTY_TASTE);
  return Promise.race([
    readTaste(clientId, kind).catch(() => EMPTY_TASTE),
    new Promise<Taste>((resolve) => setTimeout(() => resolve(EMPTY_TASTE), TASTE_RACE_MS)),
  ]);
}
