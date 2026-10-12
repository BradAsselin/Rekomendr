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
//
// EXCEPT THE HEALTH WALL (S2.7, Brad 2026-10-11): exact match leaked live —
// the same Tylenol photo came back "medication", "pain relief", "health",
// and "pain relief" walked straight past the list. The wall now matches
// STEMS and fails closed (isHealthMedical below); food false positives are
// excused by a short, named allow-list instead.

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

// The pre-S2.7 exact list, kept as the recipe deny set's health half and as
// a regression fixture: every one of these words must still hit the wall.
export const LEGACY_HEALTH_WORDS: readonly string[] = HEALTH_MEDICAL_WORDS;

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
  if (isHealthMedical(c)) return false;
  return FOOD_DRINK_CATEGORIES.has(c);
}

// S2.5 (Brad, 2026-10-11) — a health anchor's short is built in code, never
// taken from the model. The vision prompt asks for one plain identifying
// sentence and the model writes benefit claims anyway ("antioxidant support
// for immune health"), so the description is replaced outright: the
// product's category, nothing a model wrote about it. S2.6 (Brad): the
// category alone ("Medication") — the card's title already names the
// product. The server signs THIS text (so save/backfill/detail attest it);
// the client renders the same string as a twin against an older server.
// S2.7 (Brad): the model's category word drifts between snaps of the same
// bottle, so the shown word is a fixed label, derived from the same stems
// that decide the wall (one source: a category is walled exactly when it
// has a label).
export function healthAnchorShort(rawCategory: string): string {
  return healthLabel(rawCategory) ?? "Health";
}

/* ------------------------------------------------------------------
   S2.7 — THE HEALTH WALL MATCHES STEMS, FAIL-CLOSED.

   A category is health when, after the allow-list is stripped out:
     - any STEM appears anywhere in it (substring: "multivitamin",
       "painkiller", "antihistamines", "pain relief" all hit), or
     - any SHORT TOKEN is a whole word in it (rx, otc, flu, cbd, spf —
       too short to substring: "fluid", "influencer"), or
     - any PHRASE appears in it ("first aid", "skin care").
   Ambiguous means walled. The allow-list holds only known, named food /
   drink / household false positives; anything not on it that touches a
   stem is walled. To excuse a new false positive, add the narrowest
   phrase or token here and a harness case for it.

   The stems are grouped by the label the card shows. The first group
   that matches wins, in this order: Supplements (an explicit "vitamin" or
   "supplement" is the strongest signal of what the thing is), Medication,
   Skincare, Beauty, Health.
------------------------------------------------------------------- */
type HealthLabel = "Supplements" | "Medication" | "Skincare" | "Beauty" | "Health";

const HEALTH_GROUPS: {
  label: HealthLabel;
  stems: string[];
  tokens?: string[];
  phrases?: string[];
}[] = [
  {
    label: "Supplements",
    stems: ["vitamin", "supplement", "mineral", "probiotic", "melatonin", "collagen"],
  },
  {
    label: "Medication",
    stems: [
      "pain", "relief", "analges", "medic", "drug", "pharma", "prescri",
      "allerg", "antihist", "sleep", "cold", "cough", "antacid", "laxative",
      "ointment", "topical", "antisept", "antibiot", "antifung", "decongest",
      "ibuprofen", "acetaminophen", "paracetamol", "aspirin", "naproxen",
      "hydrocort", "lozenge", "nasal", "remed", "nsaid",
    ],
    tokens: ["rx", "otc", "flu"],
    phrases: ["eye drop"],
  },
  {
    label: "Skincare",
    stems: ["skincare", "cream", "creme", "lotion", "balm", "serum", "sunscreen", "moistur", "derma", "acne"],
    tokens: ["spf"],
    phrases: ["skin care"],
  },
  {
    label: "Beauty",
    stems: ["cosmetic", "beauty", "makeup"],
    phrases: ["make up"],
  },
  {
    label: "Health",
    stems: ["health", "wellness", "hygiene", "tincture", "cannabis", "hemp", "kratom", "bandage"],
    tokens: ["cbd"],
    phrases: ["first aid", "personal care", "essential oil", "oral care"],
  },
];

// Known false positives, stripped BEFORE matching. Phrases are removed
// whole; tokens are dropped when a whole word matches. Deliberately NOT
// excused (fail-closed, Brad to overrule): "wellness tea", "health food",
// "hemp seeds", "probiotic drink", "vitamin water", "lemon balm".
const HEALTH_ALLOW_PHRASES = [
  // cream / creme as food and drink
  "ice cream", "sour cream", "cream cheese", "whipped cream", "heavy cream",
  "irish cream", "cream liqueur", "cream sherry", "cream soda", "cream ale",
  "cream of", "creme brulee", "creme fraiche", "creme de",
  // cold as temperature, not illness
  "cold brew", "cold cuts", "cold drink", "cold beverage", "cold coffee",
  "cold press", "cold smoked",
  // mineral as water
  "mineral water",
];
const HEALTH_ALLOW_TOKENS = [
  /^healthy$/,      // "healthy snacks"
  /^paint/,         // paint, painting, paints, painter
  /^spain$/, /^spanish$/,
  /^creamer$/, /^creamy$/, /^creamery$/,
  /^sleepwear$/,
  /^comedic$/,      // "medic" inside it
];

const normalizeCategory = (raw: string | null | undefined): string =>
  (raw ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // crème → creme
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function healthLabel(rawCategory: string | null | undefined): HealthLabel | null {
  let c = ` ${normalizeCategory(rawCategory)} `;
  if (!c.trim()) return null;
  for (const phrase of HEALTH_ALLOW_PHRASES) {
    c = c.split(` ${phrase}`).join(" ");
  }
  const tokens = c
    .split(" ")
    .filter((t) => t && !HEALTH_ALLOW_TOKENS.some((re) => re.test(t)));
  const text = ` ${tokens.join(" ")} `;
  for (const g of HEALTH_GROUPS) {
    if (g.stems.some((stem) => text.includes(stem))) return g.label;
    if (g.tokens?.some((t) => tokens.includes(t))) return g.label;
    if (g.phrases?.some((ph) => text.includes(` ${ph}`))) return g.label;
  }
  return null;
}

// THE wall test. Every health gate (vision response, backfill, chain,
// Show details, save, share, completion, public read, client twins, the
// recipe deny) calls this one function.
export const isHealthMedical = (rawCategory: string | null | undefined): boolean =>
  healthLabel(rawCategory) !== null;
