// src/lib/savedLists.ts — S17c: the Saved page's lists, built from this
// client's user_likes rows (newest first). Pure: /api/saved runs it on the
// server, the harness runs it in Node, the sheet imports the types.

import { goToCategoryFor, BAR_CATEGORY } from "./goToCategory";

export type SavedCategory = "Movies" | "TV Shows" | "Books" | "Wine";
export type SavedItem = {
  category: SavedCategory;
  title: string;
  year: number | null;
  at: string | null;
  // Every spelling this title's rows were written under ("Movies",
  // "movie"…): a remove or un-watch clears each one, so nothing is left
  // behind under the other spelling.
  rawCategories: string[];
};

// Rows carry more than one spelling of a category (the Movies/movies gap,
// watch-bank; the snap lane's "movie"/"tv"/"book"/"wine").
export function savedCategoryFor(raw: unknown): SavedCategory | null {
  const g = goToCategoryFor(raw);
  if (g) return BAR_CATEGORY[g];
  return typeof raw === "string" && raw.trim().toLowerCase() === "wine" ? "Wine" : null;
}

export type SavedRow = { category: string; title: string; year: number | null; action: string; created_at: string | null };

// `savedWatched` (S18b): saves the Saved tab hides because the title was
// since watched — the row is still there, so a card shows its bookmark
// filled (the Saved page itself ignores this list).
export function buildSavedLists(rows: SavedRow[]): { saved: SavedItem[]; watched: SavedItem[]; savedWatched: SavedItem[] } {
  const key = (c: SavedCategory, t: string) => `${c}|${t.trim().toLowerCase()}`;
  const newestSave = new Map<string, SavedItem>();
  const newestWatched = new Map<string, SavedItem>();
  const newestDislikeAt = new Map<string, string>();
  for (const r of rows) {
    const category = savedCategoryFor(r?.category);
    if (!category || typeof r.title !== "string" || !r.title.trim()) continue;
    const k = key(category, r.title);
    const item: SavedItem = { category, title: r.title.trim(), year: typeof r.year === "number" ? r.year : null, at: r.created_at ?? null, rawCategories: [r.category] };
    const seen = (m: Map<string, SavedItem>) => {
      const had = m.get(k)!;
      if (!had.rawCategories.includes(r.category)) had.rawCategories.push(r.category);
      if (had.year == null && item.year != null) had.year = item.year;
    };
    // Rows arrive newest first: the first one seen per title is its newest.
    if (r.action === "save") {
      if (newestSave.has(k)) seen(newestSave);
      else newestSave.set(k, item);
    } else if (r.action === "watched") {
      if (newestWatched.has(k)) seen(newestWatched);
      else newestWatched.set(k, item);
    } else if (r.action === "dislike" && !newestDislikeAt.has(k)) newestDislikeAt.set(k, r.created_at ?? "");
  }
  const live = Array.from(newestSave.entries()).filter(([k, s]) => !((newestDislikeAt.get(k) ?? "") > (s.at ?? "")));
  const saved = live.filter(([k]) => !newestWatched.has(k)).map(([, s]) => s);
  const savedWatched = live.filter(([k]) => newestWatched.has(k)).map(([, s]) => s);
  return { saved, watched: Array.from(newestWatched.values()), savedWatched };
}
