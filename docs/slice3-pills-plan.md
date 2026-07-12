# Slice Three — Clarify Pills (trait steering): PLAN

> **Parked July 12 pending 50-person test — placement decision: bottom of
> frontier, whiff-recovery fallback. Watch for: users stalling at the
> bottom of a set with nowhere to go.**
>
> Status: design decision pending, not cancelled. Nothing below is
> implemented. Drafted against `a102e3d` (main). Slice Two reference:
> `d41039f`.

## Context

The steering arc's final slice. Chaining (steer by example) and
thumbs-down (steer away) shipped in `d41039f`. Pills add steer-by-trait.
Ledger #5 governs: pills BEND the running session vector, never branch.
The regeneration machinery is chain-shaped: reuse the epoch guards,
wipe/skeleton flow, everShownRef exclusion, and fail-soft patterns from
Slice Two. No parallel plumbing.

## 0. Affected files

| File | Change |
|---|---|
| `app/api/reksnap/route.ts` | Pill grammar const, `kind: "pill"` branch inside `handleChain`, pills in chain/vision response shapes, pill sanitizer, vision-path health strip |
| `src/lib/reksnapSignals.ts` | `'pill_tap'` action + `pillLabel`/`pillMode` params → new columns |
| `src/components/RekSnapResults.tsx` | `pills` state, reset wiring, pill row render, `handlePillTap`, pills consumption in `fetchChainSet` |
| Supabase (no repo file — migrations run in console, as 2026-07-03/07-10 were) | Migration SQL below |

**Not touched:** `RekCard.tsx`, `RekTrail.tsx`, trail/graduation handlers,
mode-switch, search lane, all description grammar (voice constants
consumed via the existing `mode === "uses" ? USES_VOICE :
DIFFERENTIATOR_VOICE` fork).

## 1. SQL migration (step 1 of implementation — code ships only after readback)

The 07-10 migration was run in the console, so the live constraint
name/definition is not in the repo. **Run the discovery SELECT first** and
review the output before the ALTER, so the recreate can't silently drop an
unknown action value:

```sql
-- STEP 0 — discovery (read-only, run first, review output):
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.reksnap_signals'::regclass AND contype = 'c';
```

```sql
-- STEP 1 — migration (assumes the conventional constraint name and the
-- seven known actions; adjust from STEP 0 output if either differs):
ALTER TABLE public.reksnap_signals
  DROP CONSTRAINT IF EXISTS reksnap_signals_action_check;
ALTER TABLE public.reksnap_signals
  ADD CONSTRAINT reksnap_signals_action_check CHECK (action IN
    ('like','dislike','save','context_flip','detail_expand',
     'chain','anchor_reroll','pill_tap'));

ALTER TABLE public.reksnap_signals
  ADD COLUMN IF NOT EXISTS pill_label text;
ALTER TABLE public.reksnap_signals
  ADD COLUMN IF NOT EXISTS pill_mode text
    CONSTRAINT reksnap_signals_pill_mode_check
    CHECK (pill_mode IN ('similar','uses','alternatives'));
```

```sql
-- STEP 2 — verification readback:
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'reksnap_signals'
  AND column_name IN ('pill_label','pill_mode');

SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.reksnap_signals'::regclass AND contype = 'c';
```

Column decisions: `pill_label text` (new), `pill_mode text` (new — NOT
reusing `flip_to_mode`; it's owned by `context_flip` per the
one-column-one-action convention in the insert comments), and
**`chain_depth` reused** for depth-at-fire-time (0 allowed for pill rows —
chain rows stay 1-based; note it in the lib comment).

## 2. Response JSON — where pills live, riding the eager call

- **Vision response** (initial snap): `pills: Record<SnapMode, string[]>`
  as a top-level sibling of `results` — the model names the axes **per
  list** in the same completion. Mode flips are instant-correct with zero
  extra round-trips: all three pill sets arrive with the three lists.
  Uses-mode pills are effort/outcome bends (Faster / Fancier / Fewer
  ingredients) — same grammar, that mode's axes.
- **Chain / re-roll / pill responses**: `{ reks, pills }` — one set, one
  pill row, from the same completion.
- **Backfill**: unchanged, no pills. A backfill swaps one card; pills
  regenerate with new **sets** only. The row persists through a backfill.

## 3. Server design (`route.ts`)

**Reuse `handleChain`, add `kind: "pill"`** — not a parallel handler.
Inherits for free: the 400 validation shape, the **health/medical 403
twin**, `excludeNames`/`rejectedNames` cleaning, the weighted-trail
serialization (`commonTail`), filter-and-return-survivors validation, and
502-only-on-zero (Ledger #16). Payload adds `pill: string` (validated:
non-empty, ≤ 40 chars) instead of `chained`; validation requires `pill`
when `kind === "pill"` exactly as `chained` is required for `"steer"`.

**`buildChainPillPrompt(mode)`** — chain-branch shape, consuming the same
voice fork:

> "…They tapped a steering pill — the TRAIT DIRECTION below. The user
> asked for **[the pill]** — BEND the current line in that direction. Same
> origin, same accumulated signals, adjusted heading. Do NOT restart from
> the anchor; do NOT branch to a new line — this is a course correction at
> the current position, not a hop."
> SET COMPOSITION — exactly 5: positions 1–4 on the BENT line; exactly ONE
> of positions 4–5 an honest tangent (adjacent direction, never a category
> leap). Zero duds. [voice] + the steer prompt's REFERENT OVERRIDE
> equivalent: comparisons stay against the detected item (there is no
> chained item — the pill bends, the anchor grounds), non-uses modes only.

User content mirrors the reroll branch (anchor + profile + category +
`commonTail`) plus a `TRAIT DIRECTION: [pill]` line and `CHAIN DEPTH at
fire time: n`.

**Pill generation (all set-generating prompts).** One shared const:

```
PILL_RULE = "Alongside the set, return STEERING PILLS: 4-5 short trait
directions naming the axes THIS set was just placed on — the bends a user
might ask for next (wine: Bolder / Softer / More fruit / Cheaper; movies:
Funnier / Darker / Slower burn). Each pill is 1-3 words, no punctuation,
starts with a capital. Pills describe the CURRENT set's frontier — never
generic category words, never a direction this session already rejected."
```

- Appended to `buildChainSteerPrompt`, `buildChainRerollPrompt`,
  `buildChainPillPrompt`; `CHAIN_SET_SHAPE` becomes
  `'{ "reks": [...], "pills": [string] }'` (one line still owns the shape).
- ⚠️ **Flagged: touches the Katrina-validated vision `SYSTEM_PROMPT`** —
  one additive block (per-list phrasing of `PILL_RULE`) and the JSON-shape
  line extended with
  `"pills": { "similar": [...], "uses": [...], "alternatives": [...] }`.
  No existing rule line changes. Unavoidable for feature point 1.

**Server pill sanitizer** (shared): keep strings only, trim, drop >3 words
or any punctuation, dedupe case-insensitively, cap at 5. **Fail-soft at
every tier**: invalid/missing pills → `pills: []` in the response, never
an error — a set with no pill row is fully valid. Vision path:
`max_tokens` stays 4000 (15 short labels is noise against the budget).

**Health gate, server side**: `kind:"pill"` hits `handleChain`'s existing
403. Vision path additionally **strips pills to `[]` for health/medical
anchors before responding** — the payload never carries pills the client
must suppress.

## 4. Client state model (`RekSnapResults.tsx`)

New state — deliberately minimal, everything else is reuse:

```ts
const [pills, setPills] = useState<Record<SnapMode, string[]>>({ similar: [], uses: [], alternatives: [] });
```

- **New-snap reset effect**: `setPills(result.pills ?? empty)` alongside
  the existing resets (race R-P4).
- **`fetchChainSet`** (shared by chain/reroll/pill): on success,
  `setPills(prev => ({ ...prev, [mode]: sanitized(data.pills) }))` —
  mode-captured like `setLists`, empty array when absent. **On failure,
  pills untouched** — the restored list is the old set, and the old pills
  still describe it (restore symmetry).
- **`handlePillTap(pill)`** — the reroll handler's shape:
  - `chainBusyRef` synchronous bounce (set at tap) — same guard, no new ref.
  - **No `chainDepthRef` increment** (course correction, not pursuit),
    **no `pursuedNamesRef` add**, **`activeMode` unchanged**, **no
    `chainedRek`** passed to the wipe — nothing graduates from the tap.
  - `recordSnapSignal({ action:'pill_tap', pillLabel: pill, pillMode: mode, chainDepth: chainDepthRef.current })`
    — depth at fire time.
  - `commitChainWipe({ mode })` → epoch bump, pending zeroed, wipe, five
    skeletons (`chainingMode`), and the R1 flush of any mid-animation
    already-marked card to the trail. That flush is mark-preservation (the
    same race chain has when the list dies), not pill-caused graduation —
    the trail "not moving" means the pill adds nothing to it.
  - `fetchChainSet({ kind:'pill', pill, detectedItem, mode, trail, rejectedNames, excludeNames }, mode, restoreList)`
    — `everShownRef` union, resultRef staleness, restore +
    `CHAIN_FAILED_MSG` amber notice all inherited.

## 5. Placement + visual grammar

**Decision at parking time: bottom of frontier — whiff-recovery
fallback.** Directly below the last card/skeletons, above "Snap another".
Rationale: (a) steering is a decision made **after** reading the set — the
row sits where that question arises; (b) stacking a second pill row
against the mode pills is the confusion the spec warns about — separation
by the whole frontier is the strongest "different job" signal; (c) the
mode row is the section separator between trail and frontier.
**50-person test watch item: users stalling at the bottom of a set with
nowhere to go.** Visual distinction from mode pills: left-aligned row,
smaller (`text-xs`), gray outline chips with a leading non-interactive
`Steer` micro-label and a `↳`-style glyph per chip, hover-blue — mode
pills stay centered/filled/rounded. Render condition:
`!anchorIsHealthMedical && pills[activeMode].length > 0 && chainingMode !== activeMode`
(the row vanishes during regeneration — dead-set pills never sit next to
skeletons — and reappears with the new set's pills).

## 6. Health gate — three entry points + twin

1. **Render gate**: row never renders for health/medical anchors
   (structural, same class as chain affordances).
2. **Handler gate**: `handlePillTap` early-returns on
   `anchorIsHealthMedical` (belt).
3. **Server**: vision path strips pills for health anchors; `kind:"pill"`
   inherits `handleChain`'s 403 (braces).

## 7. Races

| # | Race | Resolution |
|---|---|---|
| R-P1 | Pill tap during in-flight chain/reroll/pill | `chainBusyRef` synchronous bounce — one regeneration in flight per snap, inherited |
| R-P2 | Double-tap re-entrancy | Same ref, set before any async work — inherited |
| R-P3 | Pill tap during in-flight **backfill** | `commitChainWipe` bumps the mode's epoch and zeroes pending; the backfill response hits the existing epoch guard and drops; its `finally` skips the stale decrement — the exact R2/R5 machinery, inherited unchanged |
| R-P4 | Stale pill row after a new snap | Reset effect seeds pills from the new result; late pill-regen responses die on the `resultRef` staleness check before any `setPills` |
| R-P5 | Pill regen arrives after user fired another action | Chain-class actions blocked by R-P1. **Mode flip mid-regen**: response lands in its captured `mode`, not `activeMode` (`setLists`/`setPills` both mode-captured); skeletons render only on the regenerating mode — inherited chain behavior. Dismissals/marks on other modes' lists are epoch-independent and unaffected |
| R-P6 | **Pre-existing, discovered while mapping — NOT pill-specific**: toggle-off `returnToFrontier` into a mode that is mid-chain-regeneration inserts the card into the wiped list, and the arriving set replaces the whole list — the card ends up in neither trail nor frontier (stranded mark). Exists in Slice Two today for chains; pills inherit but don't worsen it. One-line fix (`if (chainingMode === entry.mode) return;` in `returnToFrontier`) touches graduation — recommended as a separate slice-fix commit, disposition undecided at parking time |
| R-P7 | Garbage/empty pills from the model | Server sanitizer + client renders only non-empty validated arrays — no row is fully valid |

## 8. Estimated diff surface

- `route.ts`: ~+100/−10 (PILL_RULE + sanitizer ~25, pill branch + prompt
  ~45, chain-response pills ~10, vision block/shape/strip ~20)
- `reksnapSignals.ts`: ~+12
- `RekSnapResults.tsx`: ~+80/−5 (state/reset ~10, handler ~35, row ~25,
  fetch consumption ~10)
- **Total ≈ +190/−15 across 3 files**, zero new files, zero new
  components.

## 9. Implementation order (SQL-first discipline)

1. Run STEP 0 discovery → review output → confirm/adjust STEP 1 → run it →
   STEP 2 readback confirms.
2. Only then: `reksnapSignals.ts` → `route.ts` → `RekSnapResults.tsx`,
   sweep (grep for stray pill writes outside the gate, verify voice
   constants unedited byte-for-byte, verify no trail/graduation/
   mode-switch lines in the diff), full diff, no commit.

## Open items at parking time

- **(a)** Pills for all three modes incl. uses-mode effort-bends, vs.
  similar/alternatives only — proposed all three, undecided.
- **(b)** Placement — decided at parking: bottom of frontier
  (whiff-recovery fallback), pending 50-person test validation.
- **(c)** R-P6 disposition — separate fix commit or fold in, undecided.
- **(d)** The flagged additive touch to the vision SYSTEM_PROMPT —
  needs explicit approval before implementation.
