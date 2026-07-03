// src/lib/categoryGates.ts
// Category-exclusion gates for snap-result affordances. One source of truth
// so the recipe gate and the anchor-richness gate can never drift apart.
//
// The vision model returns an UNSTABLE category for the same item (eggs came
// back "food" 3x and "eggs" 1x across 4 snaps), so we never allow-list food
// words — that brittleness is the bug. Rich affordances are ON by default and
// suppressed only for categories in these known exclusion sets.
//
// Matched by EXACT normalized (trim + lowercase) membership so short tokens
// can't collide via substring (e.g. ice "cream" food ≠ cortisone "cream";
// "carrot" ≠ "car"). Add words as real leakers are observed (e.g. "antacid"
// for Tums).

// Health / medical / supplement / ingestible-non-food words. These must NEVER
// get a recipe link, and the anchor card stays structurally thin for them (no
// long tier, no expand affordance, no where-to-buy) — gated in code, not just
// by prompt instruction.
const HEALTH_MEDICAL_WORDS = [
  "medication", "medications", "medicine", "medicines", "drug", "drugs",
  "pharmacy", "prescription", "otc",
  "vitamin", "vitamins", "supplement", "supplements", "probiotic", "probiotics",
  "cbd", "tincture", "tinctures", "cannabis", "hemp", "kratom",
  "skincare", "skin care", "cosmetic", "cosmetics", "beauty", "makeup",
  "cream", "creams", "lotion", "ointment", "balm", "serum", "sunscreen",
  "topical", "essential oil", "essential oils",
  "antacid",
  "health", "medical", "wellness", "first aid", "personal care", "hygiene",
];

// Non-consumable reference categories these snaps already return and that
// never had recipes (movies, books, products/car-care, etc.). Not exported:
// nothing gates on non-consumables alone.
const NON_CONSUMABLE_WORDS = [
  "movie", "movies", "film", "films", "tv", "television", "tv show",
  "tv shows", "show", "shows", "streaming",
  "book", "books", "ebook", "magazine",
  "music", "album", "albums",
  "game", "games", "video game", "video games",
  "car care", "car-care", "carcare", "automotive", "auto", "auto care",
  "cleaning", "cleaning supplies", "cleaning product", "cleaner", "household",
  "detergent", "laundry",
  "electronics", "gadget", "appliance", "appliances",
  "product", "products", "tool", "tools", "hardware",
  "clothing", "apparel", "shoes", "furniture",
];

export const HEALTH_MEDICAL_CATEGORIES = new Set<string>(HEALTH_MEDICAL_WORDS);

// Recipe-link gate: in "uses" mode anything you eat or drink gets
// "View recipe ›" by DEFAULT (food, beverages, AND alcohol — a vodka "uses"
// snap returns cocktails, which ARE recipes); suppress only for this union.
export const NON_RECIPE_CATEGORIES = new Set<string>(
  HEALTH_MEDICAL_WORDS.concat(NON_CONSUMABLE_WORDS)
);
