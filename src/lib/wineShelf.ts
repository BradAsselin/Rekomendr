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
