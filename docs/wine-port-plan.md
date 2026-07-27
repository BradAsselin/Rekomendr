# Wine Port Plan — Verdict Grammar into the Search Lane

**Status: PLAN — no code.** Written 2026-07-19 (overnight) against `main` @ `48317fa`. Small, self-contained prompt-tune session: port the snap lane's validated consumable verdict grammar to the search lane's wine spec.

## Current wine spec, verbatim from disk

Short spec (`src/engine/rekomendrEngine.ts:626-628`):

```
- For Wine, short is exactly two sentences. Sentence 1 MUST open by placing the wine on dry vs. sweet, then signature notes in concrete decision words (grapefruit, grassy, oaky, buttery). Sentence 2: a concrete moment or contrast — when it shines and when it doesn't. End on a concrete noun. Never a mood, never an 'experience', never a recommendation.
- RIGHT: 'Dry and citrus-led — grapefruit and lime over a subtle grassy edge. Built for a hot afternoon more than a rich dinner.'
- WRONG: 'A crisp, refreshing white perfect for those who enjoy lighter wines.' (never places it on dry vs. sweet; perfect-for filler)
```

Long spec — wine falls into the non-media branch (`rekomendrEngine.ts:562-564`, `577`, `580`):

```
  const longFormat = mediaLong
    ? "..."
    : "One sentence explaining why it is worth watching (Rotten Tomatoes style).";
```
```
    : "- long must be ONE sentence explaining why it is worth watching.";
```
```
    : "- long = why it fits.";
```

Two problems: the wine long is a one-sentence recommendation-register blurb ("Rotten Tomatoes style" is the exact register the July grammar work banned everywhere else), and — the wart — it literally says **"worth watching"** for a beverage.

## The replacement (July-12 verdict grammar, adapted)

Source grammar: the snap lane's consumable clause (`app/api/reksnap/route.ts:140-147`, Katrina-validated) — three sentences: axis placement / what it DOES (behavior, not a descriptor inventory) / the verdict beat. The snap version's verdict is anchored to a snapped item; the search lane has no snapped anchor, so the verdict beat anchors to **the searcher's own line** (lane + typed seed), which `buildAIPrompt` already carries as context.

**Short spec: unchanged.** The axis-first two-sentence short is already correct and shipped; this port touches the long only.

**Proposed exact replacement** for the three non-media branch strings (wine is the only non-media category in the search lane's four verticals):

`longFormat` (replaces "One sentence explaining why it is worth watching (Rotten Tomatoes style).")
```
"EXACTLY 3 sentences: the axis deepened, what the wine DOES, then the verdict beat — see the wine long rules."
```

`longRules` non-media branch (replaces "- long must be ONE sentence explaining why it is worth watching."):
```
- long is EXACTLY 3 sentences, one job each:
  - Sentence 1: deepen the short's dry-vs-sweet placement with finer CONCRETE decision words (grapefruit pith, toasted oak, clover honey) — never re-characterize on a different axis, never contradict the short.
  - Sentence 2: what the wine DOES, as behavior, never an inventory of notes — where the fruit sits, when the oak arrives, what the finish does ('The fruit rides up front and the oak stays out of the way until the finish.'). A bag of descriptors that could hang on half the category is the named failure.
  - Sentence 3: the verdict beat — where this lands relative to the line the search is walking: keeps it with a difference, trades it for something else, or doubles down ('If crisp is what the search is chasing, this keeps the spine and adds salt air'; 'Trades the plushness for structure — leaner, but longer'). An honest not-for-this-search steer is a SUCCESS. Never a rating, never 'perfect/ideal for', never an occasion, never a person-type.
  - The FINAL WORD must be a concrete noun — a food, a moment, a place. Never end on a mood.
- RIGHT: 'The dryness runs bone-deep — lime pith and crushed stone with no fruit-sweetness padding it. The acidity hits first and the body stays out of the way, so it finishes fast and clean. Doubles down on the crispness this lane is chasing — if you wanted roundness, this is the wrong door, but with oysters it sings.'
- WRONG: 'A well-balanced and elegant wine with notes of citrus and minerality, perfect for those who enjoy crisp whites.' (descriptor inventory; rating register; person-type; never places the verdict against the search's line)
```

`longFitRule` non-media branch (replaces "- long = why it fits."):
```
- long, sentence 3, carries the fit: the verdict is stated AGAINST the searcher's line (lane, typed seed) — never announce it ('since you searched...'); let the relationship carry it.
```

## Single-site confirmation — all paths inherit

`buildAIPrompt` (`rekomendrEngine.ts:524`) is the **only** prompt source in the search lane. Its sole consumer is `generateAIReks` (`rekomendrEngine.ts:681`), which is called from exactly three places, all in the same file: fresh search (`getTop5FromEngine`, `:831`), backfill (`getBackfillRek`, `:1038`), and MLT (`getMoreLikeThisSet`, `:1145`). `/api/openai` relays `body.prompt` verbatim (`app/api/openai/route.ts:24-47`) — no server-side prompt to touch. One edit site; every wine generation inherits.

(The canned wine pool is the other wine-copy surface — handled separately in `docs/pool-copy-rewrite.md`; the Play path never runs this prompt.)

## Validation plan

Test wines must NOT appear in any prompt example (examples use: citrus/grassy Sauvignon-Blanc style, off-dry peach Riesling style, the RIGHT/WRONG strings above). Test set:
1. Typed seed "Meiomi" in Wine, lane empty — plush/jammy verdict territory.
2. Lane "Red", typed "Chianti" — savory/acid territory; sentence 3 must place against the Chianti line, not generic red.
3. Lane "Sparkling", empty GO — Prosecco/Cava territory; axis for sparkling (the model must still open on dry-vs-sweet: Brut/off-dry).
4. Lane "Sweet" — dessert territory; confirms sentence 1 states sweetness plainly rather than euphemizing.
5. MLT from any result card — confirms the inherited path speaks the same grammar (single-site check made live).

Grade each long: three sentences? behavior in sentence 2 (no inventory)? verdict beat placed against the line, no rating register? ends on a concrete noun? Judge at the Katrina bar; two RIGHT/WRONG contrast pairs in the spec are the tuning lever if any test reads flat ([[prompt-tuning-lever]] discipline).

**Scope fence when built:** `src/engine/rekomendrEngine.ts` only, three string regions (`:562-564`, `:577`, `:580`); STOP if git status shows anything else.
