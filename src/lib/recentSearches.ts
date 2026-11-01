// src/lib/recentSearches.ts — S36 (docs/S35_RECENT_SEARCHES.md): every
// search leaves an entry in Recent — what started it, when, and the five
// it found — so a title someone watched without tapping can still be found
// the next morning.
//
// Per device and NEVER sent anywhere (charter §0: the person keeps their
// own path). This module makes no network call. Each entry also holds the
// set as it was shown, so tapping it reopens that set from here, with no
// model call and no request at all.
//
// localStorage can be missing, throw or be full: every read and write is
// wrapped; a full store drops the oldest entries until the newest fits,
// and a blocked one keeps the list in memory for this tab.

import type { Rek } from "../engine/rekomendrEngine";
import type { MltSeed } from "../components/MltCompare";
import type { SnapResult } from "../components/RekSnapResults";
import type { ScreenTitles } from "./screenClient";
import type { RefIn, SlotRequest } from "./slotsClient";

export type SearchKind = "voice" | "typed" | "chips" | "snap" | "mlt";

export type CardFacts = { facts: string[]; posterPath: string | null };
export type FactsByTitle = Record<string, CardFacts>;

export type EntryPick = {
  title: string;
  year: number | null;
  tmdbId: number | null;
  posterPath: string | null;
  // The pick's own category ("Movies", "Wine", "Whiskey"…) when it has one.
  category: string | null;
};

export type SearchRestore =
  | {
      lane: "search";
      reks: Rek[];
      header: string | null;
      mltSeed: MltSeed | null;
      screen: { titles: ScreenTitles; service: string | null } | null;
      // What a Compare to change or a thumbs-down replacement re-runs from
      // (the person's own act — never the reopen itself).
      last: { query: string; cat: string; meta?: unknown; parsedMood?: unknown } | null;
      slot: { req: SlotRequest; named: RefIn | null; refs: RefIn[]; standalone?: boolean } | null;
    }
  | {
      lane: "snap";
      // results hold the five as shown (a typed title's late five merged in).
      result: SnapResult;
      mltSeed: MltSeed | null;
      mltWine: boolean;
    };

export type SearchEntry = {
  id: string;
  kind: SearchKind;
  // Exactly what the entry says: “the words”, "Comedy · Feel-good",
  // "Snapped: …", "More like …".
  label: string;
  // The set's category as the cards name it.
  category: string;
  at: string;
  picks: EntryPick[];
  restore: SearchRestore;
  // Card facts and posters the cards learned (TMDb), so a reopened set asks
  // for nothing and the entry can show posters.
  facts: FactsByTitle;
};

export const SEARCHES_MAX = 50;
export const PICKS_SHOWN = 5;
const KEY = "rekomendr.recent_searches";
const EVENT = "rekomendr:recent-searches";
let memo: SearchEntry[] | null = null;

export const titleKey = (t: string) => t.trim().toLowerCase();

const isEntry = (e: any): e is SearchEntry =>
  !!e &&
  typeof e.id === "string" &&
  typeof e.label === "string" &&
  typeof e.at === "string" &&
  Array.isArray(e.picks) &&
  !!e.restore &&
  (e.restore.lane === "search" || e.restore.lane === "snap");

export function getSearchEntries(): SearchEntry[] {
  if (memo) return memo;
  try {
    const list = JSON.parse(window.localStorage.getItem(KEY) || "[]");
    memo = Array.isArray(list) ? list.filter(isEntry).slice(0, SEARCHES_MAX) : [];
  } catch {
    memo = [];
  }
  return memo;
}

function write(list: SearchEntry[]) {
  memo = list;
  try {
    if (!list.length) {
      window.localStorage.removeItem(KEY);
    } else {
      // Full storage: the oldest go first, the newest always tries to stay.
      let keep = list;
      for (;;) {
        try {
          window.localStorage.setItem(KEY, JSON.stringify(keep));
          break;
        } catch (err) {
          if (keep.length <= 1) throw err;
          keep = keep.slice(0, Math.max(1, Math.floor(keep.length * 0.75)));
          console.warn("[recent-searches] storage full — dropping the oldest", { kept: keep.length });
        }
      }
    }
  } catch {
    // storage blocked: the list holds for this tab only
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {}
}

export const newEntryId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// A search's set landed (or filled in: its lines, a typed title's late
// five). The same id replaces its own entry in place; a new id goes on top.
export function upsertSearchEntry(entry: SearchEntry): void {
  if (typeof window === "undefined" || entry.picks.length === 0) return;
  const list = getSearchEntries();
  const at = list.findIndex((e) => e.id === entry.id);
  const picks = entry.picks.slice(0, PICKS_SHOWN).map((p) => withFacts(p, entry.facts));
  const next = { ...entry, picks };
  if (at >= 0) {
    const copy = [...list];
    copy[at] = { ...next, at: list[at].at, facts: { ...list[at].facts, ...next.facts } };
    write(copy);
    return;
  }
  write([next, ...list].slice(0, SEARCHES_MAX));
}

const withFacts = (p: EntryPick, facts: FactsByTitle): EntryPick => {
  const f = facts[titleKey(p.title)];
  return f && !p.posterPath && f.posterPath ? { ...p, posterPath: f.posterPath } : p;
};

// The cards on screen learned their facts and posters: keep them with the
// entry that set came from (posters for the entry, nothing to ask on reopen).
export function noteEntryFacts(id: string | null, facts: FactsByTitle): void {
  if (!id || typeof window === "undefined" || !Object.keys(facts).length) return;
  const list = getSearchEntries();
  const at = list.findIndex((e) => e.id === id);
  if (at < 0) return;
  const e = list[at];
  const merged = { ...e.facts, ...facts };
  const restore: SearchRestore =
    e.restore.lane === "search"
      ? {
          ...e.restore,
          reks: e.restore.reks.map((r) => {
            const f = merged[titleKey(r.title)];
            return f && r.facts === undefined ? { ...r, facts: f.facts, posterPath: r.posterPath ?? f.posterPath } : r;
          }),
        }
      : e.restore;
  const copy = [...list];
  copy[at] = { ...e, facts: merged, restore, picks: e.picks.map((p) => withFacts(p, merged)) };
  write(copy);
}

export function clearSearchEntries(): void {
  write([]);
}

export function onSearchEntriesChange(fn: () => void): () => void {
  const h = () => fn();
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

// Picks from either lane's cards.
export const picksFromReks = (reks: Rek[], category: string): EntryPick[] =>
  reks.slice(0, PICKS_SHOWN).map((r) => ({
    title: r.title,
    year: r.year || null,
    tmdbId: r.tmdbId ?? null,
    posterPath: r.posterPath ?? null,
    category,
  }));

export const picksFromSnap = (
  list: { name: string; year?: number | null; category?: string }[],
  anchorCategory: string
): EntryPick[] =>
  list.slice(0, PICKS_SHOWN).map((r) => ({
    title: r.name,
    year: r.year ?? null,
    tmdbId: null,
    posterPath: null,
    category: r.category || anchorCategory || null,
  }));

// "10:22 PM" today, "Last night 10:22 PM" for yesterday evening, else
// "Oct 28" ("Oct 28, 2025" in another year).
export function entryWhen(at: string, now: Date = new Date()): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(now) - day(d)) / 86_400_000);
  if (days === 0) return time;
  if (days === 1 && d.getHours() >= 17) return `Last night ${time}`;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}
