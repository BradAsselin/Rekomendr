// src/lib/wineReks.ts — server only. S8b: the wine shelf engine's model
// calls (docs/s8-wine-shelf-plan.md).
//
//   readShelf()        — vision: what is READABLE in the photo (scene,
//                        bottles, tag prices, shelf talkers, staff picks).
//   generateWineReks() — text: the wine picks for one anchor, shelf-first,
//                        inside a price band, with taste positions and the
//                        favorite comparison.
//
// Voice (§2.3): rek descriptions are written under DIFFERENTIATOR_VOICE,
// passed in VERBATIM by the route (where the locked constant lives). What
// this file adds is task framing (where picks come from, the price range,
// exclusions) and data fields (price, taste, vs_favorite). Blocks are
// assembled conditionally — a favorite block only when there is a
// favorite, a shelf block only with a shelf — because the model dodges into
// any register present anywhere in the prompt (prompt-tuning law).
//
// Every guarantee lives in finishWineReks (wineShelf.ts), not here: the
// prompt is pressure, the response site is law (§2.12).
if (typeof window !== "undefined") {
  throw new Error("wineReks.ts was imported in a browser bundle.");
}
import { jsonText, llmCall } from "./llm";
import {
  bandText,
  cleanShelfRead,
  formatPrice,
  needsReferenceTaste,
  type PriceBand,
  type RawWineRek,
  type ShelfBottle,
  type WineFavorite,
  type WineScene,
} from "./wineShelf";

// ---------------------------------------------------------------------------
// THE SHELF READ
// ---------------------------------------------------------------------------
export const SHELF_READ_PROMPT =
  "You are reading a photo taken in a wine shop, a grocery aisle, or at home. Report only what is READABLE in the photo. Never guess, never fill in from memory.\n" +
  "\n" +
  "scene — one of:\n" +
  "- \"single\": one or two bottles are the subject.\n" +
  "- \"shelf\": a store shelf or display with several different bottles to choose from.\n" +
  "- \"haul\": bottles the person has bought or is buying — in a shopping cart, a basket, a bag, on a checkout belt, or lined up together at home after shopping.\n" +
  "- \"other\": anything else.\n" +
  "\n" +
  "bottles — every different wine whose label you can read well enough to name, as producer + wine the way the label prints it (\"Josh Cellars Cabernet Sauvignon\", \"La Marca Prosecco\"). A row of identical bottles is ONE entry. Top shelf first, left to right. Up to 40. Skip anything you cannot read; never invent a name to fill a gap. Shelf talkers, score cards, price tags and store signs are NOT bottles — never list one as a bottle.\n" +
  "For each bottle:\n" +
  "- price: the shelf tag price for THAT bottle exactly as printed (17.99) — only when you can read the digits AND can see which bottle the tag belongs to. Otherwise null. Never estimate a price here.\n" +
  "- talker_points / talker_source: only when a shelf talker or score card at that bottle PRINTS a score (\"90 POINTS\", \"Wine Enthusiast 90\"): the number, and the publication if it is printed. Otherwise null. Never supply a score from memory.\n" +
  "- staff_pick: true only when a store sign at that bottle says it is a staff pick, an employee or manager favorite, or someone's favorite (\"John's Favorite Wine!!!\"). Otherwise false.\n" +
  "\n" +
  "anchor_price — the tag price of the MAIN bottle (the one the photo centers on, or the nearest and largest), only if readable. Otherwise null.\n" +
  "\n" +
  'Return JSON only: { "scene": "single"|"shelf"|"haul"|"other", "anchor_price": number|null, "bottles": [ { "name": string, "price": number|null, "talker_points": number|null, "talker_source": string|null, "staff_pick": boolean } ] }';

export type ShelfRead = {
  scene: WineScene;
  bottles: ShelfBottle[];
  anchorPrice: number | null;
};

export async function readShelf(images: string[]): Promise<ShelfRead | null> {
  const started = Date.now();
  try {
    const completion = await llmCall({
      step: "shelf",
      temperature: 0,
      maxTokens: 2500,
      system: SHELF_READ_PROMPT,
      user: [
        ...(images.length > 1
          ? [
              {
                type: "text" as const,
                text: `This is ONE photo, cut into ${images.length} horizontal strips shown top to bottom. Neighbouring strips overlap slightly, so a bottle on a cut line can appear twice — list it once.`,
              },
            ]
          : []),
        ...images.map((url) => ({ type: "image" as const, url, detail: "high" as const })),
      ],
    });
    const read = cleanShelfRead(JSON.parse(jsonText(completion.text)));
    console.info("[wine] shelf read", {
      scene: read.scene,
      bottles: read.bottles.length,
      tagPrices: read.bottles.filter((b) => b.price != null).length,
      talkers: read.bottles.filter((b) => b.talkerPoints != null).length,
      staffPicks: read.bottles.filter((b) => b.staffPick).length,
      anchorPrice: read.anchorPrice,
      strips: images.length > 1 ? images.length : 0,
      provider: completion.provider,
      ms: Date.now() - started,
    });
    return read;
  } catch (err) {
    // Fail-soft, never silent: the snap ships without shelf facts.
    console.warn("[wine] shelf read failed — no shelf facts this snap", {
      error: err instanceof Error ? err.message : String(err),
      ms: Date.now() - started,
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// THE PICKS
// ---------------------------------------------------------------------------
export type WineGenKind = "set" | "backfill" | "steer";

export type WineGenContext = {
  kind: WineGenKind;
  count: number;
  anchor: { name: string; description: string; category: string };
  // The anchor's price as known BEFORE generation (a tag, or a previous
  // response's figure). Null = the model estimates it.
  anchorPrice: number | null;
  anchorPriceSource: "tag" | "estimate" | null;
  // Null with no anchor price: "±35% of your own estimate".
  band: PriceBand | null;
  shelf: ShelfBottle[] | null;
  shelfSnap: boolean;
  seen: string[];
  disliked: string[];
  favorite: WineFavorite | null;
  chained: { name: string; description?: string } | null;
  kept: string[];
};

// The pressure tier is capped (§2.12); the response site holds the rest.
const PROMPT_SEEN_CAP = 120;
const PROMPT_DISLIKED_CAP = 60;

export function buildWineReksPrompt(voice: string, ctx: WineGenContext): string {
  const lines: string[] = [];
  lines.push(
    `You are a taste-aware wine recommendation engine. The user snapped a wine — the ANCHOR below${
      ctx.shelfSnap ? ", standing at a store shelf" : ""
    }. Recommend exactly ${ctx.count} wines.`,
    ""
  );
  lines.push("WHERE THE PICKS COME FROM:");
  if (ctx.shelf && ctx.shelf.length > 0) {
    lines.push(
      "- ON THE SHELF (listed below) is what is physically in front of the user. Pick from it FIRST, best fit to the anchor first, staying inside the price range.",
      ctx.kind === "set"
        ? "- Only when no remaining shelf bottle fits, add wines NOT on the shelf: widely distributed labels of the same grape or region, at a similar price, that a typical US grocery or big-box store (Kroger, Safeway, Target, Costco, Total Wine) stocks."
        : "- While ON THE SHELF lists ANY bottle inside the price range, your picks MUST come from it — closest fit first, even when the fit is loose. Only once it has none left, add wines NOT on the shelf: widely distributed labels of the same grape or region, at a similar price, that a typical US grocery or big-box store (Kroger, Safeway, Target, Costco, Total Wine) stocks."
    );
  } else {
    lines.push(
      "- Favor widely distributed labels that a typical US grocery or big-box store (Kroger, Safeway, Target, Costco, Total Wine) stocks over rare, allocated or winery-only bottles."
    );
  }
  lines.push(
    "- Name every pick as producer + wine, the way its label reads (\"Josh Cellars Cabernet Sauvignon\") — never a bare grape, region or style.",
    ""
  );
  if (ctx.band) {
    lines.push(
      `PRICE: every pick's US retail price must sit inside ${bandText(ctx.band)}. price_usd = the shelf tag price when the pick is an ON THE SHELF bottle with a price, otherwise its typical US retail.`
    );
  } else {
    lines.push(
      "PRICE: first estimate the anchor's typical US retail price and return it as anchor.price_usd. Keep every pick within 35% of it, above or below. price_usd = the shelf tag price when the pick is an ON THE SHELF bottle with a price, otherwise its typical US retail."
    );
  }
  lines.push(
    "",
    "TASTE POSITION — approximate, for the anchor and for every pick: dry_sweet from 1 (bone dry) to 5 (sweet); light_bold from 1 (light-bodied) to 5 (full and bold).",
    ""
  );
  if (ctx.favorite) {
    lines.push(
      `THE USER'S GO-TO WINE is ${ctx.favorite.name}. For every pick, write vs_favorite: how the pick compares to the go-to, as two to four short comparative phrases — lowercase, comma-separated, no name, not a sentence. Shape: "drier, less vanilla, similar body".`,
      ""
    );
  }
  // S26b — conditional, so every other request stays byte-identical: only
  // a reference whose taste the client doesn't know asks for it.
  const askGoTo = needsReferenceTaste(ctx.favorite, ctx.anchor.name);
  if (askGoTo) {
    lines.push(
      `Also return go_to, at the top level beside "anchor": { "dry_sweet": number, "light_bold": number } — the go-to wine's own approximate taste position on the same two scales.`,
      ""
    );
  }
  if (ctx.kind === "steer" && ctx.chained) {
    lines.push(
      `DIRECTION: the user tapped "+ More like this" on ${ctx.chained.name}. The anchor is where they started; ${ctx.chained.name} is where they walked. Continue that line beyond ${ctx.chained.name} — never back toward the anchor. REFERENT OVERRIDE: descriptions compare against ${ctx.chained.name} (implicit — do not repeat its name), not the anchor.`,
      ""
    );
  }
  if (ctx.kind === "backfill") {
    lines.push(
      "The user dismissed a pick. These are replacements: same anchor, same rules — and lean away from what the DISLIKED wines share.",
      ""
    );
  }
  lines.push(voice, "");
  lines.push(
    "Hard rules:",
    "- NEVER recommend the anchor itself" + (ctx.favorite ? ", the go-to wine" : "") + ", or any wine in NEVER REPEAT.",
    "- NEVER recommend a wine from any producer in DISLIKED; lean away from what those wines share.",
    "- Every pick is a distinct wine; no two picks share a name.",
    "Each pick carries its own category (a short lowercase label, e.g. wine).",
    `Return JSON only: { "anchor": { "price_usd": number, "dry_sweet": number, "light_bold": number }, "reks": [ { "name": string, "description": string, "category": string, "price_usd": number, "dry_sweet": number, "light_bold": number${
      ctx.favorite ? ', "vs_favorite": string' : ""
    } } ] } — exactly ${ctx.count} reks.`
  );
  return lines.join("\n");
}

export function buildWineReksUser(ctx: WineGenContext): string {
  const lines: string[] = [];
  lines.push(`ANCHOR: ${ctx.anchor.name}`);
  if (ctx.anchor.description) lines.push(`Its signature profile: ${ctx.anchor.description}`);
  if (ctx.anchor.category) lines.push(`Category: ${ctx.anchor.category}`);
  const ap = formatPrice(ctx.anchorPrice, ctx.anchorPriceSource);
  if (ap) lines.push(`Anchor price: ${ap}${ctx.anchorPriceSource === "tag" ? " (shelf tag)" : ""}`);
  if (ctx.favorite) {
    lines.push(
      `GO-TO WINE: ${ctx.favorite.name}` +
        (ctx.favorite.description ? ` — ${ctx.favorite.description}` : "")
    );
  }
  if (ctx.kind === "steer" && ctx.chained) {
    lines.push(
      `DIRECTION (newest pursued pick): ${ctx.chained.name}` +
        (ctx.chained.description ? ` — ${ctx.chained.description}` : "")
    );
  }
  if (ctx.shelf && ctx.shelf.length > 0) {
    lines.push("ON THE SHELF (still unshown):");
    for (const b of ctx.shelf) {
      const bits = [b.name];
      if (b.price != null) bits.push(`$${b.price.toFixed(2)}`);
      lines.push(`- ${bits.join(" — ")}`);
    }
  }
  if (ctx.kept.length) lines.push(`KEPT (the user liked or saved these): ${ctx.kept.join(", ")}`);
  lines.push(
    `NEVER REPEAT: ${ctx.seen.slice(-PROMPT_SEEN_CAP).join(", ") || "(none)"}`,
    `DISLIKED: ${ctx.disliked.slice(0, PROMPT_DISLIKED_CAP).join(", ") || "(none)"}`
  );
  return lines.join("\n");
}

export async function generateWineReks(
  voice: string,
  ctx: WineGenContext
): Promise<{ anchor: unknown; goTo: unknown; reks: RawWineRek[] }> {
  const completion = await llmCall({
    step: "wine",
    temperature: 0.7,
    maxTokens: Math.min(4000, 400 + ctx.count * 260),
    system: buildWineReksPrompt(voice, ctx),
    user: buildWineReksUser(ctx),
  });
  const parsed = JSON.parse(jsonText(completion.text));
  return {
    anchor: parsed?.anchor ?? null,
    goTo: parsed?.go_to ?? null,
    reks: Array.isArray(parsed?.reks) ? parsed.reks : [],
  };
}
