// src/lib/wineShelf.ts — S8: the wine shelf (docs/s8-wine-shelf-plan.md).
//
// Pure helpers, shared by /api/reksnap and the snap results, testable in
// isolation (scripts/validate-s8a.cjs). No network, no React.

// ---------------------------------------------------------------------------
// Which anchors are wine. The model's category word drifts ("wine", "red
// wine", "sparkling wine", "prosecco"), so membership is by stem, not by an
// exact word. Beer, spirits and cider are NOT wine: none of this applies.
// ---------------------------------------------------------------------------
const WINE_WORDS = new Set<string>([
  "champagne", "prosecco", "cava", "rosé", "rose", "sparkling", "port",
  "sherry", "madeira", "vinho verde", "lambrusco", "moscato",
]);

export function isWineCategory(raw: string | null | undefined): boolean {
  const c = (raw ?? "").trim().toLowerCase();
  if (!c) return false;
  if (c.includes("wine")) return true;
  return WINE_WORDS.has(c);
}

// ---------------------------------------------------------------------------
// S8a — THE PAIRING SENTENCE, DELETED (Brad's voice decision, 2026-10-16).
//
// A wine anchor's description is two sentences by the vision prompt's
// grammar: (1) dry↔sweet placement + signature notes, (2) "one concrete
// moment or contrast", which on wine comes out as a food pairing in the
// "Built for X, not Y" mold ten times out of ten ("Built for a grilled steak
// dinner, not a light salad."). Brad: delete it, keep the rest as is.
//
// Deleted here, deterministically, rather than banned in the prompt: the
// prompt stays byte-identical (the locked voice, §2.3), a ban is also a
// mention (prompt-tuning law), and a deterministic cut is something a test
// can hold at zero. Sentence 1 is never touched, whatever it says.
// ---------------------------------------------------------------------------

// The mold and its siblings. Each is a whole-sentence test.
const PAIRING_PATTERNS: RegExp[] = [
  // "Built for a grilled steak dinner…", "Made for…", "Meant for…"
  /^(?:it'?s\s+|this\s+is\s+)?(?:built|made|meant|designed|born|crafted|tailor[- ]made|happiest|at\s+home|at\s+its\s+best|best|shines|works\s+best|works)\b[^.!?]*\b(?:for|with|alongside|on|at|next\s+to)\b/i,
  // "…, not a light salad." / "…, not with a rich pasta." — the contrast tail
  /,\s*(?:and\s+)?not\s+(?:a|an|the|with|for|on|at|by|over|beside|alongside|in)?\b[^.!?]*[.!?]?$/i,
  /\brather\s+than\b[^.!?]*\b(?:dinner|lunch|meal|salad|pasta|steak|fish|seafood|cheese|dessert|board|takeout|barbecue|bbq|picnic|night|afternoon|evening)\b/i,
  // "Pairs with…", "Pour it alongside…", "Save it for…", "Open it with…"
  /^(?:it\s+)?(?:pairs?|pairing)\b/i,
  /^(?:pour|open|serve|save|reach\s+for|uncork|bring)\b(?:\s+it|\s+this(?:\s+one)?)?\s+(?:with|alongside|for|at|next\s+to|beside|when|on)\b/i,
  /\b(?:pairs?|pairing)\s+(?:beautifully\s+|nicely\s+|well\s+)?(?:with|alongside)\b/i,
];

export function isPairingSentence(sentence: string): boolean {
  const s = sentence.trim();
  if (!s) return false;
  return PAIRING_PATTERNS.some((re) => re.test(s));
}

// Split into sentences: a boundary is terminal punctuation followed by
// whitespace and a letter or an opening quote, in either case (a lowercase
// "built for…" is still a sentence of its own). Decimals ("$17.99") never
// split. A stray split elsewhere is harmless: the first piece is always
// kept, and a later piece only goes if it is itself a pairing.
function splitSentences(text: string): string[] {
  return text
    .trim()
    .split(/(?<=[.!?])\s+(?=["'“‘(]?[A-Za-z])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function stripPairingSentence(description: string): string {
  if (typeof description !== "string" || !description.trim()) return description;
  const sentences = splitSentences(description);
  if (sentences.length <= 1) return description.trim();
  const [first, ...rest] = sentences;
  const kept = rest.filter((s) => !isPairingSentence(s));
  return [first, ...kept].join(" ");
}

// S8a — the shelf shot, taught in one line (camera screen + under "Snap
// another" on a wine result). Plain voice: it is about the app's machinery.
export const SHELF_TIP = "Tip: snap one or two shelves to compare bottles";

// ---------------------------------------------------------------------------
// S8a — the bottle, and where to buy it. Plain link handoffs, new tab, no
// availability lookup and no affiliate logic (firewall §2.1). The producer
// rides inside the name the model reads off the label ("Caymus Bonanza
// Cabernet Sauvignon"), so the name IS the exact-bottle query.
// ---------------------------------------------------------------------------
export function bottleImageUrl(name: string): string {
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(
    `${name.trim()} bottle`
  )}`;
}

export function whereToBuyUrl(name: string): string {
  return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(
    `${name.trim()} wine`
  )}`;
}

// S8b — after a single-bottle wine snap, one quiet line toward the shelf.
export const SINGLE_BOTTLE_TIP =
  "Snap the whole shelf next time to compare the bottles side by side.";

// ===========================================================================
// S8b — THE SHELF ENGINE (pure). Shapes, price bands, name matching and the
// response-site guarantees every wine rek passes through, whichever path
// generated it (first set, price chip, replacement, More like this).
// ===========================================================================

export type WineScene = "single" | "shelf" | "haul" | "other";

// One bottle read off the photo. Everything here was READ, never inferred:
// a price only when a tag was legible, a score only when a shelf talker
// printed one, a staff pick only when a store sign said so.
export type ShelfBottle = {
  name: string;
  price: number | null;
  talkerPoints: number | null;
  talkerSource: string | null;
  staffPick: boolean;
};

// What a wine card shows beyond the text. Attached by the server.
export type WineRekInfo = {
  price: number | null;
  // "tag" = read off this shelf; "estimate" = the model's typical retail.
  priceSource: "tag" | "estimate" | null;
  onShelf: boolean;
  // A shelf snap's pick that is NOT on the shelf: the card says so.
  offShelf: boolean;
  talkerPoints: number | null;
  talkerSource: string | null;
  staffPick: boolean;
  // Approximate taste position, 1..5 (dry→sweet, light→bold).
  dry: number | null;
  body: number | null;
  // "drier, less vanilla, similar body" — only with a starred favorite.
  vsFavorite: string | null;
};

export type WineAnchorInfo = {
  price: number | null;
  priceSource: "tag" | "estimate" | null;
  dry: number | null;
  body: number | null;
  talkerPoints: number | null;
  talkerSource: string | null;
  staffPick: boolean;
};

// The favorite as the client holds it (localStorage mirror of wine_marks).
export type WineFavorite = {
  name: string;
  description?: string | null;
  dry?: number | null;
  body?: number | null;
};

// ---------------------------------------------------------------------------
// Price. Default: the anchor's price ±35% (a $23 bottle → $15–31). A chip
// replaces it with a fixed range. Estimates get a little slack at the
// response site (±8%), so an "about $21" isn't thrown out of $15–20 on
// rounding; tag prices are what they are.
// ---------------------------------------------------------------------------
export type PriceChip = "under20" | "20to35" | "35to60" | "splurge";

export const PRICE_CHIPS: { id: PriceChip; label: string; min: number; max: number }[] = [
  { id: "under20", label: "Under $20", min: 0, max: 20 },
  { id: "20to35", label: "$20–35", min: 20, max: 35 },
  { id: "35to60", label: "$35–60", min: 35, max: 60 },
  { id: "splurge", label: "Splurge", min: 60, max: 400 },
];

export type PriceBand = { min: number; max: number; chip: PriceChip | null };

export const BAND_SPREAD = 0.35;

export function bandFor(anchorPrice: number | null, chip: PriceChip | null): PriceBand | null {
  const c = chip ? PRICE_CHIPS.find((p) => p.id === chip) : null;
  if (c) return { min: c.min, max: c.max, chip: c.id };
  if (anchorPrice == null || !(anchorPrice > 0)) return null;
  return {
    min: Math.round(anchorPrice * (1 - BAND_SPREAD)),
    max: Math.round(anchorPrice * (1 + BAND_SPREAD)),
    chip: null,
  };
}

export function inBand(
  price: number | null,
  band: PriceBand | null,
  source: "tag" | "estimate" | null
): boolean {
  if (band == null || price == null) return true;
  const slack = source === "tag" ? 0 : 0.08;
  return price >= band.min * (1 - slack) && price <= band.max * (1 + slack);
}

export function bandText(band: PriceBand): string {
  if (band.chip === "splurge") return `$${band.min} and up`;
  if (band.min <= 0) return `under $${band.max}`;
  return `$${band.min}–$${band.max}`;
}

export const isPriceChip = (v: unknown): v is PriceChip =>
  typeof v === "string" && PRICE_CHIPS.some((p) => p.id === v);

// "$17.99" for a tag, "about $22" for an estimate.
export function formatPrice(
  price: number | null,
  source: "tag" | "estimate" | null
): string | null {
  if (price == null || !(price > 0)) return null;
  if (source === "tag") return `$${price.toFixed(2)}`;
  return `about $${Math.round(price)}`;
}

// ---------------------------------------------------------------------------
// Names. A label read off a shelf ("Cannonball Cabernet"), the model's name
// for a rek ("Cannonball Cabernet Sauvignon 2021") and a thumbed-down name
// must all be recognized as the same bottle. Distinctive tokens (producer,
// cuvée) decide identity; grape and style words only have to agree.
// ---------------------------------------------------------------------------
const NAME_STOP = new Set([
  "the", "wine", "wines", "winery", "vineyards", "vineyard", "estate", "estates",
  "cellars", "cellar", "family", "de", "di", "la", "le", "les", "del", "du", "da",
  "y", "and", "of", "nv", "reserve", "reserva", "riserva", "selection", "series",
  "california", "napa", "valley", "county", "coast", "doc", "docg", "aoc",
]);
const GRAPE_WORDS = new Set([
  "cabernet", "sauvignon", "cab", "merlot", "pinot", "noir", "grigio", "gris",
  "chardonnay", "blanc", "riesling", "zinfandel", "zin", "syrah", "shiraz", "malbec",
  "rose", "prosecco", "moscato", "tempranillo", "sangiovese", "chianti", "red",
  "white", "blend", "brut", "champagne", "cava", "sparkling", "petite", "sirah",
  "grenache", "albarino", "verdejo", "vinho", "verde", "gewurztraminer", "viognier",
  "semillon", "franc", "carmenere", "montepulciano", "nebbiolo", "barbera", "primitivo",
  "lambrusco", "asti", "spumante", "extra", "dry", "sweet", "semi", "rosso", "bianco",
  "tinto", "blanco", "crianza", "cremant", "port", "tawny", "ruby",
]);

export function nameKey(raw: string): string {
  return (raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function nameParts(raw: string): { distinct: string[]; grapes: string[] } {
  const toks = nameKey(raw)
    .split(" ")
    // Single digits count ("7 Deadly Zins", "Cuvée 2"); single letters don't.
    .filter((t) => (t.length > 1 || /^\d$/.test(t)) && !NAME_STOP.has(t));
  return {
    distinct: toks.filter((t) => !GRAPE_WORDS.has(t)),
    grapes: toks.filter((t) => GRAPE_WORDS.has(t)),
  };
}

const subset = (a: string[], b: string[]) => a.every((t) => b.includes(t));

// Same bottle: the producer/cuvée words match (one set inside the other),
// and when both names carry grape words, they share one.
export function sameWine(a: string, b: string): boolean {
  const ka = nameKey(a);
  const kb = nameKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const pa = nameParts(a);
  const pb = nameParts(b);
  if (pa.distinct.length === 0 || pb.distinct.length === 0) return false;
  const distinctMatch = subset(pa.distinct, pb.distinct) || subset(pb.distinct, pa.distinct);
  if (!distinctMatch) return false;
  if (pa.grapes.length && pb.grapes.length) return pa.grapes.some((g) => pb.grapes.includes(g));
  return true;
}

// Same producer. The dislike memory works at this level (Brad: "Remember
// dislikes (e.g. Decoy) so they never return"): one thumbs-down on a Decoy
// keeps every Decoy off the list.
export function sameProducer(a: string, b: string): boolean {
  const da = nameParts(a).distinct;
  const db = nameParts(b).distinct;
  if (!da.length || !db.length) return false;
  return da[0] === db[0] || sameWine(a, b);
}

// "Caymus Bonanza Cabernet Sauvignon" → "Caymus Bonanza": the name a
// person calls their go-to ("vs. your Bonanza…"). Trailing grape, style
// and vintage words go; the producer/cuvée stays. Never empty.
export function shortWineName(raw: string): string {
  const words = (raw || "").trim().split(/\s+/);
  while (words.length > 1) {
    const k = nameKey(words[words.length - 1]);
    if (!k || GRAPE_WORDS.has(k) || NAME_STOP.has(k) || /^\d+$/.test(k)) words.pop();
    else break;
  }
  return words.join(" ") || raw.trim();
}

export function matchShelf(
  name: string,
  shelf: ShelfBottle[] | null | undefined
): ShelfBottle | null {
  if (!shelf) return null;
  return shelf.find((b) => sameWine(name, b.name)) ?? null;
}

// ---------------------------------------------------------------------------
// Cleaning what the models return. Never trust a field's shape.
// ---------------------------------------------------------------------------
const num = (v: unknown): number | null => {
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string"
        ? parseFloat(v.replace(/[$,]/g, ""))
        : NaN;
  return Number.isFinite(n) ? n : null;
};
const taste = (v: unknown): number | null => {
  const n = num(v);
  return n == null ? null : Math.min(5, Math.max(1, Math.round(n)));
};
const cleanPrice = (v: unknown): number | null => {
  const n = num(v);
  return n != null && n >= 2 && n <= 2000 ? Math.round(n * 100) / 100 : null;
};
const text = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

export function cleanShelfRead(raw: unknown): {
  scene: WineScene;
  bottles: ShelfBottle[];
  anchorPrice: number | null;
} {
  const r = (raw ?? {}) as Record<string, unknown>;
  const scene: WineScene =
    r.scene === "single" || r.scene === "shelf" || r.scene === "haul" ? r.scene : "other";
  const bottles: ShelfBottle[] = [];
  for (const b of Array.isArray(r.bottles) ? r.bottles : []) {
    const o = (b ?? {}) as Record<string, unknown>;
    const name = text(o.name, 120);
    if (!name || bottles.some((x) => sameWine(x.name, name))) continue;
    // A score card read as a bottle ("92 Points", "Wine Enthusiast 90").
    if (
      /^\d{2,3}\s*(?:pts?|points?)\b/i.test(name) ||
      /^(?:wine enthusiast|wine spectator|james suckling|wine advocate|vinous)\b/i.test(name)
    ) {
      continue;
    }
    const pts = num(o.talker_points);
    // A score is only kept when a talker printed a believable one.
    const believable = pts != null && pts >= 80 && pts <= 100;
    bottles.push({
      name,
      price: cleanPrice(o.price),
      talkerPoints: believable ? Math.round(pts!) : null,
      talkerSource: believable ? text(o.talker_source, 40) : null,
      staffPick: o.staff_pick === true,
    });
    if (bottles.length >= 40) break;
  }
  return { scene, bottles, anchorPrice: cleanPrice(r.anchor_price) };
}

export type RawWineRek = {
  name?: unknown;
  description?: unknown;
  category?: unknown;
  price_usd?: unknown;
  dry_sweet?: unknown;
  light_bold?: unknown;
  vs_favorite?: unknown;
};

export type WineRekOut = {
  name: string;
  description: string;
  category: string;
  wine: WineRekInfo;
};

// "vs. your Bonanza: drier, …" — the client adds the lead; the model's
// phrase arrives bare. Strip any lead it wrote anyway; keep it short.
export function cleanVsFavorite(v: unknown): string | null {
  const t = text(v, 140);
  if (!t) return null;
  const bare = t
    .replace(/^vs\.?\s+(?:your\s+)?[^:]{1,60}:\s*/i, "")
    .replace(/[.!]+$/, "")
    .trim();
  if (!bare) return null;
  return (bare.charAt(0).toLowerCase() + bare.slice(1)).slice(0, 90);
}

export type WineGuaranteeLog = {
  in: number;
  droppedSeen: number;
  droppedDisliked: number;
  droppedBand: number;
  droppedSelf: number;
  onShelf: number;
  out: number;
};

// ---------------------------------------------------------------------------
// THE RESPONSE-SITE GUARANTEES (two-tier canon §2.12). Whatever the prompt
// said, nothing leaves here that:
//   - the visit already showed;
//   - the person ever thumbed down (by producer);
//   - is the anchor or the favorite;
//   - sits outside the price band.
// On-shelf is DECIDED here by matching the shelf read, never taken from the
// model. Shelf bottles rank first; a shelf snap's off-shelf pick is
// labeled. Prices on shelf bottles are the tag's.
// ---------------------------------------------------------------------------
export function finishWineReks(
  raw: RawWineRek[],
  ctx: {
    anchorName: string;
    anchorCategory: string;
    shelf: ShelfBottle[] | null;
    shelfSnap: boolean;
    band: PriceBand | null;
    seen: string[];
    disliked: string[];
    favoriteName: string | null;
    need: number;
  }
): { reks: WineRekOut[]; log: WineGuaranteeLog } {
  const log: WineGuaranteeLog = {
    in: raw.length,
    droppedSeen: 0,
    droppedDisliked: 0,
    droppedBand: 0,
    droppedSelf: 0,
    onShelf: 0,
    out: 0,
  };
  const kept: WineRekOut[] = [];
  for (const r of raw) {
    const name = text(r?.name, 120);
    if (!name) continue;
    if (
      sameWine(name, ctx.anchorName) ||
      (ctx.favoriteName && sameWine(name, ctx.favoriteName))
    ) {
      log.droppedSelf++;
      continue;
    }
    if (kept.some((k) => sameWine(k.name, name)) || ctx.seen.some((s) => sameWine(s, name))) {
      log.droppedSeen++;
      continue;
    }
    if (ctx.disliked.some((d) => sameProducer(d, name))) {
      log.droppedDisliked++;
      continue;
    }
    const onShelf = matchShelf(name, ctx.shelf);
    const tag = onShelf?.price ?? null;
    const p = tag ?? cleanPrice(r.price_usd);
    const source: "tag" | "estimate" | null = tag != null ? "tag" : p != null ? "estimate" : null;
    if (!inBand(p, ctx.band, source)) {
      log.droppedBand++;
      continue;
    }
    kept.push({
      // The model's fuller name wins unless the shelf's is longer.
      name:
        onShelf && nameKey(onShelf.name).length > nameKey(name).length ? onShelf.name : name,
      description: typeof r.description === "string" ? r.description : "",
      category:
        (typeof r.category === "string" && r.category.trim().toLowerCase()) ||
        ctx.anchorCategory,
      wine: {
        price: p,
        priceSource: source,
        onShelf: !!onShelf,
        offShelf: ctx.shelfSnap && !onShelf,
        talkerPoints: onShelf?.talkerPoints ?? null,
        talkerSource: onShelf?.talkerSource ?? null,
        staffPick: onShelf?.staffPick ?? false,
        dry: taste(r.dry_sweet),
        body: taste(r.light_bold),
        vsFavorite: ctx.favoriteName ? cleanVsFavorite(r.vs_favorite) : null,
      },
    });
  }
  // Shelf first (stable within each group: the model's ranking stands).
  const ordered = ctx.shelfSnap
    ? [...kept.filter((k) => k.wine.onShelf), ...kept.filter((k) => !k.wine.onShelf)]
    : kept;
  const out = ordered.slice(0, ctx.need);
  log.onShelf = out.filter((k) => k.wine.onShelf).length;
  log.out = out.length;
  return { reks: out, log };
}

export function cleanAnchorInfo(
  raw: unknown,
  anchorName: string,
  shelf: ShelfBottle[] | null,
  readPrice: number | null
): WineAnchorInfo {
  const r = (raw ?? {}) as Record<string, unknown>;
  const onShelf = matchShelf(anchorName, shelf);
  const tag = onShelf?.price ?? readPrice;
  const est = cleanPrice(r.price_usd);
  return {
    price: tag ?? est,
    priceSource: tag != null ? "tag" : est != null ? "estimate" : null,
    dry: taste(r.dry_sweet),
    body: taste(r.light_bold),
    talkerPoints: onShelf?.talkerPoints ?? null,
    talkerSource: onShelf?.talkerSource ?? null,
    staffPick: onShelf?.staffPick ?? false,
  };
}
