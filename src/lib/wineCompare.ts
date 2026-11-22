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

// S41 (docs/2026-11-22_get_the_app_launch.md, item 6) — Compare to sorts
// by color: bottles of the result's color first, the rest under "Other
// styles". Nothing is blocked. No color is stored anywhere, so it is read
// from the words on the label (grape, style, region); a bottle whose words
// say nothing is "unknown" and stays in the first group.
export type WineColor = "red" | "white" | "rose" | "sparkling" | "dessert";

export const OTHER_STYLES = "Other styles";

// Checked in this order: a sparkling rosé is sparkling, a port is dessert
// before it is red, "blanc de noirs" is sparkling before it is white.
const COLOR_WORDS: [WineColor, RegExp][] = [
  ["sparkling", /\b(champagne|prosecco|cava|cr[eé]mant|spumante|sekt|franciacorta|lambrusco|sparkling|brut|p[eé]t[- ]?nat|asti|moscato d.asti|blanc de (blancs|noirs))\b/],
  ["dessert", /\b(port|porto|sherry|jerez|madeira|marsala|sauternes|tokaji|ice ?wine|eiswein|late harvest|vin santo|fortified|dessert)\b/],
  ["rose", /\b(ros[eé]|rosado|rosato|blush)\b/],
  ["white", /\b(chardonnay|sauvignon blanc|pinot gri[gs]io|pinot gris|pinot blanc|riesling|moscato|muscat|chenin|viognier|albari[nñ]o|gr[uü]ner|gew[uü]rztraminer|sancerre|chablis|vermentino|soave|vinho verde|torront[eé]s|s[eé]millon|muscadet|verdejo|pouilly|fum[eé] blanc|white|blanc|bianco|blanco|trebbiano|garganega|fiano|assyrtiko|marsanne|roussanne)\b/],
  ["red", /\b(cabernet|merlot|pinot noir|syrah|shiraz|malbec|zinfandel|tempranillo|sangiovese|chianti|rioja|barolo|barbaresco|nebbiolo|grenache|garnacha|red|rouge|rosso|tinto|bordeaux|c[oô]tes du rh[oô]ne|ch[aâ]teauneuf|petite? sirah|carm[eé]n[eè]re|montepulciano|primitivo|beaujolais|gamay|valpolicella|amarone|ripasso|barbera|dolcetto|meritage|mourv[eè]dre|cabernet franc|tannat|pinotage|aglianico|nero d.avola|brunello|priorat|ribera|bonanza)\b/],
];

export function wineColorOf(...texts: (string | null | undefined)[]): WineColor | null {
  for (const t of texts) {
    // Accents off first: a plain \b doesn't see "é" as a letter ("Rosé").
    const s = (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    if (!s.trim()) continue;
    for (const [color, re] of COLOR_WORDS) if (re.test(s)) return color;
  }
  return null;
}

// Same color first (unknown colors count as same), then the rest, each
// keeping its own order. With no known result color nothing moves.
export function sortByColor<T extends { name: string }>(rows: T[], color: WineColor | null): { first: T[]; other: T[] } {
  if (!color) return { first: rows, other: [] };
  const first: T[] = [];
  const other: T[] = [];
  for (const r of rows) {
    const c = wineColorOf(r.name);
    (c == null || c === color ? first : other).push(r);
  }
  return { first, other };
}
