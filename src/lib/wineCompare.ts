// src/lib/wineCompare.ts — S26b, client side: wine's "Compare to" (Brad's
// S25 brief, items 4–7; docs/S25_HOME_GO_AND_SHELF_COMPARE_LAUNCH_PROMPT.md).
//
// Wine compares to nothing unless the person picks a bottle (up to three,
// the movie limit), with one exception: a single-bottle snap compares to
// the snapped bottle itself. The references live in the snap result's own
// state: a new snap or a category change clears them, and nothing here is
// stored or sent anywhere new. The first reference is the one the "vs."
// lines and the orange ring measure against; the others ride as KEPT
// pressure on the picks.

import { MAX_REFS } from "./compareTo";
import { formatPrice, sameWine, type ShelfBottle } from "./wineShelf";

export type WineRefSource = "shelf" | "favorites" | "recent" | "saved" | "anchor";

export type WineRef = {
  name: string;
  price: number | null;
  priceSource: "tag" | "estimate" | null;
  // Approximate taste position, 1..5; null until known (a shelf bottle's
  // comes back with the first set that compares to it).
  dry: number | null;
  body: number | null;
  from: WineRefSource;
};

export const MAX_WINE_REFS = MAX_REFS;

// The shelf in the order it was read: the read lists top shelf first,
// left to right, so its order is the shelf's.
export function shelfRows(shelf: ShelfBottle[] | null | undefined): ShelfBottle[] {
  return Array.isArray(shelf) ? shelf.filter((b) => b && typeof b.name === "string" && b.name.trim()) : [];
}

export const shelfPriceLine = (b: { price: number | null }) => formatPrice(b.price, "tag");

export const sameRef = (a: { name: string }, b: { name: string }) =>
  a.name.trim().toLowerCase() === b.name.trim().toLowerCase() || sameWine(a.name, b.name);

// The server's wire shape for the reference (the `favorite` slot).
export const refPayload = (r: WineRef | null | undefined, anchorDescription?: string | null) =>
  r
    ? {
        name: r.name,
        description: r.from === "anchor" ? anchorDescription ?? null : null,
        dry: r.dry,
        body: r.body,
      }
    : null;
