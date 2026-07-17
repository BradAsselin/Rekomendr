# Category Mislabel Diagnosis — rek signals inherit the anchor's category

**Discovered:** July 12, 2026, via a live whiskey/cognac snap session, immediately
after signal-consumption (cross-session dislike shading, `1d10a49`) shipped.

**Root cause is structural, not a bug in a lookup:** `SnapRek` has no category
field, so all nine signal call sites inherit the anchor's detected category, and
the chain prompt asserts the anchor's category as the frame. There is nothing to
look up — the rek's own category never exists anywhere in the system.

**Live evidence:** a Hennessy Cognac snap wrote EVERY signal with
`item_category='cognac'` — including dislikes on Talisker, Lagavulin, and
Highland Park (scotch), Bulleit (bourbon), and a chain on Glenlivet.

---

## Finding 1 — Signal writes: the category is anchor-inherited by construction

**The insert** — `src/lib/reksnapSignals.ts:49-52` writes whatever the caller passes:

```ts
const { error } = await supabase.from('reksnap_signals').insert({
  client_id: clientId,
  item_name: params.itemName,
  item_category: params.itemCategory,
```

**Every caller passes the anchor's detected category.** All nine call sites in
`src/components/RekSnapResults.tsx` pass `result.detected_item.category` (or its
ref twin `forResult.detected_item.category`), never anything derived from the
tapped card:

| Tap | Handler | Category source |
|---|---|---|
| Dislike on a frontier rek (Talisker, Bulleit…) | `handleDislikeRek`, RekSnapResults.tsx:440-444 | `result.detected_item.category` |
| Like/dislike via thumb toggle | `toggleThumb`, :402-406 | `result.detected_item.category` |
| Save | `handleSave`, :426-430 | `result.detected_item.category` |
| Dislike from the trail | `handleDislikeFromTrail`, :358-362 | `result.detected_item.category` |
| Chain on a frontier card (Glenlivet) | `handleChainRek`, :756-762 | `forResult.detected_item.category` |
| Chain from the trail | `handleChainTrail`, :811-817 | `forResult.detected_item.category` |
| context_flip / anchor_reroll / detail_expand | :234, :849, :921 | same (these ARE anchor signals, so correct there) |

(A tenth site lives in `RecipeModal.tsx:75`, hardcoded `itemCategory: "food"` —
out of scope here but worth remembering during the fix.)

**Why it can't be otherwise today:** the card type has no category field.
`SnapRek` is `{ name, description, rank }` (RekSnapResults.tsx:19-23), and the
API only attaches a category to the anchor — the response shape in the vision
prompt (`app/api/reksnap/route.ts:85`) is
`detected_item: { name, description, category }` with rek entries as
`{ name, description, rank }`. Chain and backfill responses are the same:
`handleChain` returns `{ name, description }` per rek (route.ts:791-794), and
`fetchChainSet` maps them into `SnapRek`s with no category
(RekSnapResults.tsx:718-723).

So in the Hennessy session: anchor detected as `category: 'cognac'`, and every
signal that snap — including dislikes on Talisker/Lagavulin/Highland Park
(scotch), Bulleit (bourbon), and the Glenlivet chain — wrote
`item_category='cognac'` because that's the only category any handler can reach.

**Downstream consequence (dislike shading):** `racePriorDislikes` scopes recall
by category with case-insensitive equality (route.ts:430-435). Those scotch
dislikes stored as `'cognac'` will (a) shade **future cognac snaps** against
Talisker/Lagavulin, and (b) **never** surface when the user snaps a scotch. The
mislabeling isn't just cosmetic — it mis-routes the cross-session taste memory
in both directions.

---

## Finding 2 — Chain prompt: the anchor's category is the only category in the prompt, and the "lane" line frames the task around the anchor

**Client side** — `buildSteerPayload` (RekSnapResults.tsx:661-689) always sends
the **original snap's anchor** regardless of chain depth or the chained card's
real identity:

```ts
return {
  kind: "steer",
  detectedItem: forResult.detected_item,   // ← always Hennessy, category 'cognac'
  mode: args.mode,
  chained: {
    name: args.chained.name,               // ← Glenlivet — name + description only,
    description: args.chained.description, //    no category exists to send
  },
```

**Server side** — `handleChain` derives its one category from the anchor
(route.ts:664-665):

```ts
const category =
  typeof item.category === "string" ? item.category.trim().toLowerCase() : "";
```

and assembles the steer user message (route.ts:722-737):

```ts
kind === "steer"
  ? `ANCHOR (line origin): ${item.name}\n` +
    ...
    (category ? `Category: ${category}\n` : "") +
    `DIRECTION (line endpoint — newest chained item): ${chained.name}` +
    (typeof chained.description === "string" && chained.description
      ? ` — ${chained.description}`
      : "") +
```

So for the Glenlivet chain the model received, verbatim in structure:

```
ANCHOR (line origin): Hennessy V.S Cognac
Its signature profile: <Hennessy's two sentences>
Category: cognac                      ← the ONLY category label in the entire prompt
DIRECTION (line endpoint — newest chained item): Glenlivet 12 — <its description>
```

The system prompt compounds the anchor-framing. `buildChainSteerPrompt` opens
the task with the lane line (route.ts:585, drawing from `CHAIN_MODE_TASK` at
:568-575):

```ts
`The lane: recommend exactly ${CHAIN_MODE_TASK[mode]}\n` +
// similar → "FIVE options that are LIKE the detected item — alternatives to consider."
```

— i.e., the task statement itself says the five results should be *like the
detected item* (the cognac), while the LINE rule two lines later (route.ts:587)
says to extrapolate *beyond the chained item*:

```
THE LINE — core rule: the ANCHOR (detected item) is the origin point; the CHAINED ITEM is
where the user walked to. Two points make a line — EXTRAPOLATE it, do not average it.
```

There is a partial mitigation: the REFERENT OVERRIDE (route.ts:601) redirects
*description comparisons* to the chained item:

```
REFERENT OVERRIDE for this task: comparisons are ALWAYS against the CHAINED ITEM — the
direction being pursued — not the detected item.
```

But that governs the comparative *voice*, not the category frame. **Nothing in
the payload or prompt tells the model the chained item is a scotch.** The
chained item arrives as a bare name plus a description that was itself written
as an anchor-relative differentiator (bare comparative with the cognac as
implicit referent). The model must infer "Glenlivet = scotch" from world
knowledge, against an explicit `Category: cognac` line and a lane instruction
anchored to the detected item.

Two more anchor-category dependencies on this path, for completeness:

- The health/medical 403 gate checks the anchor's category only (route.ts:666),
  so a chain's safety gating also follows the anchor — consistent with the
  pattern, and probably intended.
- The prior-dislike shading on the chain path queries with the anchor's
  category (route.ts:685: `racePriorDislikes({ clientId, category })`), so a
  Glenlivet chain is shaded by prior **cognac** dislikes — which, per Finding 1,
  is also where the scotch dislikes are being filed.

---

## Fix shape — IMPLEMENTED 2026-07-17 (S1, pending live validation)

Two parts:

1. **Reks gain their own category at generation time.** The model that names a
   rek knows its category; ask for it everywhere reks are generated. Touches:
   the response schema, all 4 prompt sites (vision `SYSTEM_PROMPT`, backfill,
   chain steer, chain reroll), server-side validation of the new field, the
   `SnapRek` client type, and all 9 signal call sites (pass the tapped card's
   own category, falling back to the anchor's for anchor-signals).
2. **Chain prompt category framing softened for cross-category chains.** The
   steer prompt should stop asserting the anchor's category as the sole frame
   when the chained item's category differs — carry the chained item's category
   into the payload/prompt so the DIRECTION is category-honest.

## Historical rows — RESOLVED 2026-07-17: leave them

No backfill-correction, no deletion, no read-side windowing. The 60-day
recency window (`PRIOR_WINDOW_DAYS = 60`) is the forgetting mechanism —
mislabeled history ages out naturally, accepting up to two months of
mis-routed shading.
