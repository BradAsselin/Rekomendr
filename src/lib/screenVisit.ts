// src/lib/screenVisit.ts — S12b, client side: every movie, show and book
// title shown since this browser session began (sessionStorage: a visit is
// the browser session, as wine's is — S8b). It rides every slot-recipe
// call, where the server's guarantee drops each one, and it is the
// independent check behind /api/stats "Repeats (must be 0)": a set that
// reaches the screen is counted against this list before joining it.

import { goToCategoryFor, type GoToCategory } from "./goToCategory";
import { noteSessionSeen } from "../engine/rekomendrEngine";
import { logGoToEvent } from "./goTos";

const KEY = "rekomendr.screen_visit";
type Visit = Partial<Record<GoToCategory, string[]>>;

const norm = (t: string) => t.trim().toLowerCase();

function read(): Visit {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) || "null");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export function visitSeen(category: unknown): string[] {
  const c = goToCategoryFor(category);
  return c ? read()[c] ?? [] : [];
}

// A set reached the screen: count its repeats (should always be 0), log
// the count, then remember it. Returns the repeat count.
export function noteSetShown(category: unknown, titles: string[]): number {
  const c = goToCategoryFor(category);
  if (!c || titles.length === 0) return 0;
  const v = read();
  const list = v[c] ?? [];
  const have = new Set(list.map(norm));
  const repeats = titles.filter((t) => have.has(norm(t))).length;
  for (const t of titles) {
    if (!have.has(norm(t))) {
      have.add(norm(t));
      list.push(t.trim());
    }
  }
  v[c] = list.slice(-600);
  try {
    sessionStorage.setItem(KEY, JSON.stringify(v));
  } catch {}
  noteSessionSeen(c === "movies" ? "Movies" : c === "tv" ? "TV Shows" : "Books", titles);
  if (repeats > 0) console.warn("[screen-visit] REPEAT on screen", { category: c, repeats });
  logGoToEvent("set_shown", c, repeats);
  return repeats;
}

// On load: the engine's in-memory seen set starts from the visit.
export function seedEngineFromVisit(): void {
  const v = read();
  if (v.movies) noteSessionSeen("Movies", v.movies);
  if (v.tv) noteSessionSeen("TV Shows", v.tv);
  if (v.books) noteSessionSeen("Books", v.books);
}
