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

// Screen-media reference categories — these anchors complete with Trailer +
// Where-to-watch instead of the product default. Books/music/games stay in
// NON_CONSUMABLE_WORDS below: "Trailer" doesn't fit them, so they keep the
// product verbs.
const MEDIA_WORDS = [
  "movie", "movies", "film", "films", "tv", "television", "tv show",
  "tv shows", "show", "shows", "streaming",
];

// Non-consumable reference categories these snaps already return and that
// never had recipes (books, products/car-care, etc.). Not exported:
// nothing gates on non-consumables alone.
const NON_CONSUMABLE_WORDS = [
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

export const MEDIA_CATEGORIES = new Set<string>(MEDIA_WORDS);

// Recipe-link gate: the DENY half. Anything here can never get a recipe,
// whatever else matches (health ∪ media ∪ other non-consumables —
// identical membership to the pre-split list).
export const NON_RECIPE_CATEGORIES = new Set<string>(
  HEALTH_MEDICAL_WORDS.concat(MEDIA_WORDS, NON_CONSUMABLE_WORDS)
);

/* ------------------------------------------------------------------
   S1.5 — THE RECIPE GATE FLIPS TO AN ALLOW-LIST.

   Session 0 logged this as found-not-fixed: a snapped app icon read as
   "Nextdoor Logo" got a "View recipe" button, and the field has since
   produced the same thing on a snapped ad. The cause is the posture, not
   the word list — a DENY-list shows the button for everything it has not
   been taught to suppress, and the space of non-food things a camera can
   see is infinite. Every leak was a category nobody had thought to ban.

   The original comment above argued against an allow-list because the
   vision model's category is unstable ("food" 3x, "eggs" 1x across four
   snaps of the same eggs). That instability is real, but it is WITHIN the
   food domain — an advert and a logo never come back as a food word. So
   the allow-list is written wide across food and drink, and the failure
   it can still produce is the mild one (a recipe button missing from an
   oddly-labelled food snap) rather than the one Brad keeps seeing (a
   recipe button on an advert).

   UNKNOWN NOW SUPPRESSES. That is the actual fix.
------------------------------------------------------------------- */
const FOOD_DRINK_WORDS = [
  // Umbrella labels the model reaches for most often
  "food", "foods", "drink", "drinks", "beverage", "beverages",
  "ingredient", "ingredients", "produce", "grocery", "groceries",
  "snack", "snacks", "dessert", "desserts", "candy", "sweets", "chocolate",
  "baking", "baked goods", "bread", "pastry", "pastries",
  "condiment", "condiments", "sauce", "sauces", "spice", "spices",
  "herb", "herbs", "seasoning", "oil", "vinegar", "syrup", "honey", "jam",
  "pantry", "canned goods", "cereal", "pasta", "noodles", "rice", "grain",
  "grains", "flour", "sugar",
  // Proteins and fresh
  "meat", "beef", "pork", "chicken", "poultry", "seafood", "fish",
  "shellfish", "egg", "eggs", "dairy", "milk", "cheese", "yogurt", "butter",
  "fruit", "fruits", "vegetable", "vegetables", "veggies", "salad",
  "tofu", "beans", "legumes", "nuts",
  // Prepared
  "meal", "meals", "dish", "dishes", "recipe", "recipes", "cuisine",
  "takeout", "leftovers", "soup", "pizza", "sandwich", "burger",
  // Drinks, soft and hard — a vodka "uses" snap returns cocktails, which
  // ARE recipes, so alcohol belongs here exactly as it always did
  "coffee", "tea", "juice", "soda", "smoothie", "water",
  "wine", "wines", "beer", "beers", "cider", "spirits", "spirit",
  "liquor", "alcohol", "vodka", "gin", "rum", "whiskey", "whisky",
  "bourbon", "scotch", "tequila", "mezcal", "brandy", "liqueur",
  "cocktail", "cocktails", "mixer", "mixers", "champagne", "prosecco",
  "sake", "kombucha",
];

const FOOD_DRINK_CATEGORIES = new Set<string>(FOOD_DRINK_WORDS);

// The one gate both the anchor card and the rek cards call. Deny always
// wins over allow, so a word that somehow lands in both lists (or a
// health word that also reads as food) is suppressed — the health wall is
// structural, never conditional (charter §2.2).
export function categoryGetsRecipe(rawCategory: string | undefined): boolean {
  const c = (rawCategory ?? "").trim().toLowerCase();
  if (!c) return false;
  if (NON_RECIPE_CATEGORIES.has(c)) return false;
  return FOOD_DRINK_CATEGORIES.has(c);
}
