// src/lib/recent.ts — S24a: the last ~30 cards this person opened,
// shared, saved or marked, newest first, every category
// (docs/s22-compare-to-plan.md). Per device and NEVER sent anywhere
// (charter §0 rule 6): this module makes no network call.
//
// localStorage can be missing or throw: every read and write is wrapped,
// and the list then lives in memory for this tab.

export type RecentCategory = "Movies" | "TV Shows" | "Books" | "Wine";

export type RecentItem = {
  category: RecentCategory;
  title: string;
  year: number | null;
  tmdbId: number | null;
  posterPath: string | null;
  // TV: the card's season count ("3 seasons"), when the card knew it.
  seasons: string | null;
  at: string;
};

export const RECENT_MAX = 30;
const KEY = "rekomendr.recent";
const EVENT = "rekomendr:recent";
let memo: RecentItem[] | null = null;

export function recentCategoryOf(raw: unknown): RecentCategory | null {
  const c = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (c === "movies" || c === "movie" || c === "film") return "Movies";
  if (c === "tv shows" || c === "tv show" || c === "tv") return "TV Shows";
  if (c === "books" || c === "book") return "Books";
  if (c === "wine" || c === "wines") return "Wine";
  return null;
}

export function getRecent(): RecentItem[] {
  if (memo) return memo;
  try {
    const list = JSON.parse(window.localStorage.getItem(KEY) || "[]");
    return Array.isArray(list)
      ? list.filter((r) => r && typeof r.title === "string" && recentCategoryOf(r.category)).slice(0, RECENT_MAX)
      : [];
  } catch {
    return [];
  }
}

function write(list: RecentItem[]) {
  memo = list;
  try {
    if (list.length) window.localStorage.setItem(KEY, JSON.stringify(list));
    else window.localStorage.removeItem(KEY);
  } catch {
    // storage blocked: the list holds for this tab only
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {}
}

// The commitment fact reads "3 seasons · 30 episodes" (tmdbMedia.ts).
export const seasonsOf = (facts?: string[] | null): string | null => {
  for (const f of facts ?? []) {
    const m = /\b(\d+)\s+seasons?\b/i.exec(f);
    if (m) return `${m[1]} season${m[1] === "1" ? "" : "s"}`;
  }
  return null;
};

// A card was opened, shared, saved or marked. A repeat moves to the top
// and keeps the best poster and id it has been seen with.
export function noteRecent(card: {
  category: unknown;
  title: string;
  year?: number | null;
  tmdbId?: number | null;
  posterPath?: string | null;
  facts?: string[] | null;
}): void {
  const category = recentCategoryOf(card.category);
  const title = (card.title ?? "").trim();
  if (!category || !title || typeof window === "undefined") return;
  const list = getRecent();
  const key = title.toLowerCase();
  const had = list.find((r) => r.category === category && r.title.trim().toLowerCase() === key);
  const item: RecentItem = {
    category,
    title,
    year: card.year || had?.year || null,
    tmdbId: card.tmdbId ?? had?.tmdbId ?? null,
    posterPath: card.posterPath ?? had?.posterPath ?? null,
    seasons: seasonsOf(card.facts) ?? had?.seasons ?? null,
    at: new Date().toISOString(),
  };
  write([item, ...list.filter((r) => r !== had)].slice(0, RECENT_MAX));
}

export function clearRecent(): void {
  write([]);
}

export function onRecentChange(fn: () => void): () => void {
  const h = () => fn();
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}
