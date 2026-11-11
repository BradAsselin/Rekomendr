// src/lib/watchAsk.ts — S40 (docs/2026-11-10_measure_launch.md, part B).
// "Did you watch one of these?" — asked once, on home, about the person's
// most recent Movies or TV search, when it is 3 hours to 7 days old and
// none of its picks is marked Watched. It uses the search already kept in
// Recent on this device. It asks once per search, ever: the search's id
// is remembered here (this device only) the moment the line shows.
//
// §0: it asks once, takes one tap, and can be waved off. It exists to
// learn what the person chose, not to pull them back in.

import { getSearchEntries, titleKey, type EntryPick, type SearchEntry } from "./recentSearches";
import { recentCategoryOf } from "./recent";

export const ASK_MIN_MS = 3 * 60 * 60 * 1000;
export const ASK_MAX_MS = 7 * 24 * 60 * 60 * 1000;
// Fewer posters than this and the line can't be recognized at a glance.
export const ASK_MIN_POSTERS = 3;
const KEY = "rekomendr.watch_ask";
const KEEP = 100;

export type WatchAsk = { entryId: string; picks: EntryPick[] };

const isMedia = (c: unknown) => {
  const r = recentCategoryOf(c);
  return r === "Movies" || r === "TV Shows";
};

export function askedIds(): string[] {
  try {
    const list = JSON.parse(window.localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function rememberAsked(id: string): void {
  try {
    const list = askedIds().filter((x) => x !== id);
    window.localStorage.setItem(KEY, JSON.stringify([id, ...list].slice(0, KEEP)));
  } catch {}
}

// The one search this open could ask about, before the Watched check:
// the most recent Movies/TV search, inside the window, never asked, with
// enough posters to show. null = nothing to ask.
export function askCandidate(
  entries: SearchEntry[],
  now: number,
  asked: string[]
): WatchAsk | null {
  let newest: SearchEntry | null = null;
  for (const e of entries) {
    if (!isMedia(e.category)) continue;
    const t = Date.parse(e.at);
    if (!Number.isFinite(t)) continue;
    if (!newest || t > Date.parse(newest.at)) newest = e;
  }
  if (!newest) return null;
  const age = now - Date.parse(newest.at);
  if (age < ASK_MIN_MS || age > ASK_MAX_MS) return null;
  if (asked.includes(newest.id)) return null;
  const picks = newest.picks.filter((p) => !!p.posterPath).slice(0, 5);
  if (picks.length < ASK_MIN_POSTERS) return null;
  return { entryId: newest.id, picks };
}

// None of the search's five may already be marked Watched.
export const noneWatched = (entry: SearchEntry | undefined, watchedTitles: string[]): boolean => {
  if (!entry) return false;
  const w = new Set(watchedTitles.map(titleKey));
  return !entry.picks.some((p) => w.has(titleKey(p.title)));
};

export const entryById = (id: string): SearchEntry | undefined => getSearchEntries().find((e) => e.id === id);
