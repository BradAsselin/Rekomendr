// src/lib/snapTitleGuard.ts — server-only.
//
// S1.5 — THE REAL-TITLE GUARD, SNAP SIDE.
// Shared by the vision response, the snap backfill and the chain, so the
// three can never drift. Lives here rather than inside the route because
// a Next route module may only export route handlers and route config —
// and because a guard this consequential should be directly testable.
//
// The ANCHOR is never verified: a brand-new release the model cannot
// place is precisely the case this guard exists to answer honestly, and
// dropping it would delete the user's question.

import { MEDIA_CATEGORIES } from "./categoryGates";
import {
  verifyTitles,
  logFakeTitles,
  normalizeTitle as tmdbKey,
  type TitleKind,
} from "./tmdbVerify";

// Honest-short, plain voice — machinery, not Reks Ray (charter §6 S0:
// "the persona owns AI moments, plain voice owns failures"). Shown when
// verification emptied a list: the app knows the anchor, it just will not
// invent neighbours for it.
export const NEW_TO_ME_NOTICE =
  "This one's new to me. Here's what I know about the lane — I'd rather tell you that than make up titles.";

// Which rek categories get checked. The model labels every rek with its
// OWN short lowercase category, so a cocktail under a vodka anchor is
// "cocktails" and is left alone, while a film under a film anchor is
// "movies" and is checked.
export function mediaKindFor(category: string | undefined): TitleKind | null {
  const c = (category ?? "").trim().toLowerCase();
  if (!c || !MEDIA_CATEGORIES.has(c)) return null;
  if (c === "movie" || c === "movies" || c === "film" || c === "films") return "movie";
  if (
    c === "tv" ||
    c === "television" ||
    c === "tv show" ||
    c === "tv shows" ||
    c === "show" ||
    c === "shows"
  ) {
    return "tv";
  }
  // "streaming" and anything else media-ish: could be either.
  return "any";
}

export type GuardedRek = { name: string; category?: string };

// Returns the survivors, in order. Snap-lane reks carry no year, so the
// match is title-only there — which is the right strictness: an invented
// title returns nothing from TMDb whatever year you pair it with.
export async function dropUnresolvedMediaReks<T extends GuardedRek>(
  reks: T[],
  ctx: {
    path: "snap" | "snap-backfill" | "chain";
    anchor: string;
    anchorCategory?: string;
  }
): Promise<T[]> {
  const checkable = reks.filter((r) => mediaKindFor(r.category) !== null);
  if (checkable.length === 0) return reks;

  const { enabled, verdicts } = await verifyTitles(
    checkable.map((r) => ({
      title: r.name,
      year: null,
      kind: mediaKindFor(r.category) ?? "any",
    }))
  );

  const resolved = new Map<string, boolean>();
  for (const v of verdicts) resolved.set(tmdbKey(v.title), v.resolved);

  const survivors = enabled
    ? reks.filter(
        (r) =>
          mediaKindFor(r.category) === null ||
          resolved.get(tmdbKey(r.name)) === true
      )
    : reks;

  logFakeTitles({
    path: ctx.path,
    anchor: ctx.anchor,
    category: ctx.anchorCategory,
    dropped: verdicts
      .filter((v) => !v.resolved)
      .map((v) => ({ title: v.title, reason: v.reason })),
    kept: survivors.length,
    enabled,
  });

  return survivors;
}

