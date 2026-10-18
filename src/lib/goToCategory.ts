// src/lib/goToCategory.ts — S12: which categories carry a go-to star, and
// the events /api/stats counts. Pure (both bundles import it).
//
// Movies, TV and Books star into go_tos; wine keeps its one go-to in
// wine_marks (S8). Anything else — health above all (§2.2) — has no star:
// the map below is an allow-list, so an unknown category never gets one.

export type GoToCategory = "movies" | "tv" | "books";

export function goToCategoryFor(raw: unknown): GoToCategory | null {
  const c = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (c === "movies" || c === "movie" || c === "film" || c === "films") return "movies";
  if (c === "tv" || c === "tv shows" || c === "tv show" || c === "television") return "tv";
  if (c === "books" || c === "book") return "books";
  return null;
}

// The search bar's label for a go-to category.
export const BAR_CATEGORY: Record<GoToCategory, "Movies" | "TV Shows" | "Books"> = {
  movies: "Movies",
  tv: "TV Shows",
  books: "Books",
};

export const GOTO_EVENT_KINDS = new Set([
  "touchstone_shown",
  "touchstone_star",
  "goto_more",
  "steer_switch",
  "set_shown",
]);
