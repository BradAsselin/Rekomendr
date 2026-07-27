# Search-lane short-sets trace (read-only diagnosis)

**Date:** 2026-07-23 · **Scope:** desktop search lane · **No code changed.**

Two field symptoms, both on the query "crime":

- **A)** "crime" lane + a **vibe** ("Goofy / Silly Fun") → **ONE** rek returned.
- **B)** "crime" (no vibe) → **FOUR** reks; each thumb-up graduated the card to
  the trail; after 4 likes the frontier was empty and **no new cards arrived,
  no message shown**.

Bottom line up front: neither symptom is a parse/format bug and neither is the
`/api/prefs` migration. Both trace to the same two design facts — **the AI lane
has no floor that guarantees 5**, and **AI-mode backfill failure is silent by
design**. Symptom A adds a third: the **vibe is injected as the model's PRIMARY
text signal**, over-constraining an already-narrow lane.

---

## 1. VIBE PATH — how vibe + category compose into the request

### The exact construction

Picking a vibe requires a lane to already exist, then encodes the vibe **as the
text slot** and forces AI mode:

`src/components/SearchBar.tsx:230-254` (`runVibe`):
```ts
const lane = clarifierRef.current;
if (!lane) return;                         // :236-238  vibe needs a lane
...
const q = buildQuery(cat, lane, vibeName, "ai");   // :249  vibe → text, mode ai
startSearch(q, cat);
```

`src/components/SearchBar.tsx:109-113` (`buildQuery`):
```ts
const buildQuery = (cat, clar, text, mode) => {
  const safeText = text.trim();
  const clarPart = clar ?? "";
  return `${cat}||${clarPart}||${safeText}||mode:${mode}`;
};
```

Menu wiring: `src/components/SearchBar.tsx:511-514` → `runVibe(v, categoryRef.current, idx)`.

So "Crime" lane + "Goofy / Silly Fun" vibe produces the literal query string:

```
Movies||Crime||Goofy / Silly Fun||mode:ai
```

The engine parses that into three separate fields —
`src/engine/rekomendrEngine.ts:221-254` (`parseRawQuery`): `category="Movies"`,
`clarifier="Crime"`, `text="Goofy / Silly Fun"`, `mode="ai"` — and builds the
model context at `:244-251`:

```
Vertical: Movies | Lane/Clarifier: Crime | User text: Goofy / Silly Fun | Mode: ai
```

### Why this over-constrains to ~1

The vibe lands in **`text`**, and the prompt treats `text` as the hard primary
signal — `src/engine/rekomendrEngine.ts:600-603`:

```
- The user's explicit text input is the PRIMARY signal — build recommendations
  around it first, then apply taste preferences as a secondary filter.
```

So the model is told: build around the literal phrase **"Goofy / Silly Fun"**
first, *and* stay in the **Crime** lane. Crime ∩ goofy/silly is a real but thin
intersection; gpt-4o-mini returns only a handful of genuine crime-comedies, and
whatever it returns is then thinned further by the shrink points in §2 (dedup +
already-seen). The result is not malformed — it is **semantically
over-constrained**, and there is no floor to backfill it up to 5 (§2, §3).

Note two dead paths that make this worse, not better:
- The structured vibe machinery (`VIBE_TO_DECK`, `vibeTag`) only fires when the
  **clarifier** slot starts with `"vibe:"` — `deckFromClarifier`
  (`:162-172`) and `tagFromClarifier` (`:174-183`). `runVibe` never writes that
  prefix (it puts the raw lane "Crime" in slot 2 and the vibe in slot 3), so the
  vibe is **pure free-text**, never a tag/deck bias.
- `rankMovieCandidates` scores `candidate.lane`, but AI reks never carry a
  `lane` field (`sanitizeGeneratedRek` sets genre/vibeTags/tier only —
  `:510-521`), so the lane-affinity score is inert here too.

---

## 2. SET SIZE — requested count and every shrink point

**Requested count (fresh AI search):** `MAX_AI_ITEMS = 6`
(`src/engine/rekomendrEngine.ts:60`), passed at `:833`
(`count: MAX_AI_ITEMS`). Final output is then **capped to 5** at `:848`
(`ranked.slice(0, 5)`).

Every place the set can shrink between "6 requested" and what the user sees:

| # | Shrink point | Receipt | Effect |
|---|---|---|---|
| S1 | **Model under-delivers** (returns < 6, or < 5 usable) | `generateAIReks` loops the array, no retry/top-up; returns `out.slice(0, count)` with **min 1** — `:726-742` | fewer than 5, silently |
| S2 | **JSON parse fail** → whole batch dropped | `extractJsonArray` returns `null` on unparseable text (`:436-453`); caller returns `null` (`:719-720`); engine returns `[]` (`:840, :857`) | 0 (honest page error, §4) |
| S3 | **sanitize drop** — empty/garbage title → `null`, skipped | `sanitizeGeneratedRek` `:455-457`; loop `continue` at `:729-732` | −1 each |
| S4 | **in-batch dedupe** | `dedupe` set, `:727, :736-739` | −1 per repeat |
| S5 | **already-seen filter** (session memory) | `seen` built from `sessionSeen` `:722-724`; `if (seen.has(titleKey)) continue` `:737` | −1 per already-shown title |
| — | ranker | `rankMovieCandidates` **sorts only, drops nothing** (`movieProfileScorer.ts:106-112`) | not a shrink point |

**Key structural fact:** there is **no floor and no retry**. Whatever survives
S1–S5 (as few as 1) is what ships; the only "empty" branch is 0 → `[]` (§4).
The engine adds the surviving titles to `sessionSeen` at `:850`, so a short set
also permanently narrows the pool for every later backfill (§6).

For symptom **B** ("crime", fresh) the model simply returned ≤ 5 usable unique
crime titles (S1, plus S4/S5) → **4**. Nothing tops it back to 5.

---

## 3. GRADUATION REGENERATION — does the search lane regenerate on a like?

**Yes — regeneration-on-like is built (not missing). It fires, then silently
under-delivers.** This is a "misfiring," not a "never built."

Thumb-up path:
`ResultsV4.tsx:401-410` (`handleLike`) → `migrateToTrail` (`:303-307`) →
`commitMigration` (`:309-349`). The backfill decision:

`ResultsV4.tsx:338-340`:
```ts
const needBackfill =
  !mltLoadingRef.current &&
  list.length - 1 + pendingBackfillsRef.current < 5;
```
`ResultsV4.tsx:342-348`:
```ts
compensatedCommit(refEl, () => {
  setReks((prev) => prev.filter((r) => r.id !== rek.id));
  setTrail((prev) => (prev.some((r) => r.id === rek.id) ? prev : [...prev, rek]));
  if (needBackfill) void handleBackfill(rek);   // <-- regen on graduation
});
```
Save graduates identically (`handleSave` `:432-441`). Thumb-down also backfills
(`handleDislike` `:414-426` → `handleBackfill`). So **like, save, and dislike
all call the same `handleBackfill`.**

`handleBackfill` (`:180-227`) → `getBackfillRek`. For an **AI session** (a
deliberate "crime" search is `mode:ai`), the backfill is AI —
`rekomendrEngine.ts:1026-1058`:
- requests only **`MAX_AI_BACKFILL_OPTIONS = 2`** (`:63`, `:1040`),
- under a **hard 6-second abort** (`:697-714`, backfill-only),
- `chosen = first item not in sessionSeen` (`:1049-1050`),
- on failure returns **`{ rek: null, exhausted: false }`** (`:1055-1057`).

Back in `handleBackfill`, a `null` with `exhausted:false` hits the **silent**
branch — `ResultsV4.tsx:200-205`:
```ts
} else {
  // AI backfill failure: the slot stays one short ... no false exhaustion
  // notice, no pool fallback.
  console.error("AI backfill failed; slot left empty.");
}
return;
```

So on symptom **B**: 4 cards, all liked one by one. Each like fires a backfill,
but each backfill asks for only 2 fresh **crime** titles while `sessionSeen`
(and the avoid list, §6) already holds the ones shown/liked. The model —
count=2, temp 0.5, 6 s cap — keeps returning the same famous crime films, which
the seen-filter (S5) removes → `out` empty → `null` → **silent empty slot**.
Frontier drains 4 → 3 → 2 → 1 → 0 with no card and no message. Exactly the
report.

---

## 4. EXHAUSTION — what fires when the frontier empties?

Both known message sites, and why **neither** fires for symptom B:

1. **Backfill exhaustion notice** — `ResultsV4.tsx:194-199`:
   ```ts
   if (exhausted) { setExhaustedMessage(`You've seen all our quick picks — type a ${noun}...`); }
   ```
   `exhausted:true` is returned **only in POOL mode** when the pool is drained —
   `rekomendrEngine.ts:1079` (`unseenCandidates.length === 0`). The **AI backfill
   path never returns `exhausted:true`** (`:1057` always `false`). An AI session
   therefore **cannot** reach this notice.

2. **More-Like-This empty** — `ResultsV4.tsx:263-270`: fires only when the user
   taps **"+ More like this"** and the set comes back empty. Not on a like-drain.

3. **Initial-search failure** — `app/page.tsx:225`: `if (next.length === 0)
   setSearchError(...)`. Fires only when the **first** search returns 0. Symptom
   B's first search returned 4, so this stayed quiet; and it is never re-checked
   as the frontier drains.

**Result:** in an AI session the frontier can empty with **nothing rendered** —
`reks` becomes `[]`, the trail shows the 4 graduated cards, and no notice
appears anywhere. That is the silent dead-end the user hit.

---

## 5. RECENT-CHANGE CHECK — /api/prefs (48317fa) and Block B

**Cleared. Neither can change result counts in any path.**

- `loadPrefsForCategory` is **fail-soft**: any network/non-200/bad-JSON returns
  empty prefs and never throws into search — `src/lib/userPrefs.ts:50-66`.
- `/api/prefs` is fail-soft on its side too: missing secret, junk id, or query
  error all return `EMPTY_PREFS` with **status 200**, never a 500 —
  `app/api/prefs/route.ts:81-96`.
- Prefs only feed (a) the prompt's "Recent likes/dislikes" lines
  (`rekomendrEngine.ts:655-659`) and (b) the ranker's **sort** score
  (`movieProfileScorer.ts:99` subtracts for dislikes but **drops nothing**).
  Critically, `dislikedTitles` are **not** added to the dedup `seen` set
  (`generateAIReks` seeds `seen` from `sessionSeen` only — `:722-724`), so prefs
  cannot filter the returned count down.
- `/api/recs` (the pool) is only touched in **pool mode** (`fetchPool` called at
  `:861` and `:1060`); the AI "crime" path never calls it.

If prefs *did* silently fail, the only effect would be slightly worse ordering —
never a smaller set. So the migration is not implicated in either symptom.
(Side note, not implicated here: the `user_likes` category case-gap in the watch
bank — writes and the prefs read both use "Movies" in this flow.)

---

## 6. AVOID-LIST PRESSURE

**Cap = 100**, taken as the **last 100** of currentTitles + seenTitles —
`rekomendrEngine.ts:550-554`:
```ts
const avoidTitles = Array.from(new Set([...(currentTitles ?? []), ...(seenTitles ?? [])]))
  .filter(Boolean)
  .slice(-100);
```

Two things matter at the cliff:

1. The **prompt** avoid list is capped at 100, but the **post-generation
   seen-filter** (S5, `:722-724, :737`) uses the **full uncapped `sessionSeen`**.
   So once the session exceeds 100 seen titles, the model can be *told* a title
   is fine (it fell off the prompt list) yet still have it **removed after
   generation** — the batch quietly empties and backfill returns `null`.

2. For **"crime" specifically you never need to reach 100.** The model's usable
   repertoire of well-known crime films is small; with a growing sessionSeen +
   likes, the count=2 / temp-0.5 / 6 s backfill converges on repeats within a
   handful of picks. Effective exhaustion (the seen-filter emptying every batch)
   arrives **well under the 100 cap**, and the AI branch turns that into a
   **silent** empty slot (§3/§4). So yes — "crime" + accumulated likes plausibly
   hits the effective cliff after only a few graduations, which is precisely the
   4-then-empty shape.

---

## Root causes

- **RC-1 (drives A):** the vibe is injected as the model's **PRIMARY text
  signal** (`SearchBar.tsx:249` → prompt `:600-603`), turning "Crime + goofy"
  into an over-constrained hard filter on an already-thin lane. Few real titles
  come back and nothing tops the set up. → 1 rek.
- **RC-2 (drives B's "4"):** the AI lane has **no floor/retry** — it ships
  whatever survives S1–S5 (min 1), never re-requesting to reach 5
  (`generateAIReks:726-742`, engine `:840-852`).
- **RC-3 (drives B's silent dead-end):** AI-mode backfill is **narrow and
  fragile** (2 items, 6 s abort, seen-filter vs. a growing crime set —
  `:1026-1058`, `:697-714`) **and its failure is silent by design**
  (`ResultsV4.tsx:200-205`). The frontier drains to empty with no card and no
  message.
- **RC-4 (why B is invisible):** the exhaustion notice is structurally
  **pool-only** (`:1079` / `:1057`); an AI session can never surface "I've run
  out," so an empty AI frontier renders as a blank dead-end (§4).

## Smallest safe fix per cause

- **RC-1:** stop putting the vibe in the `text` (PRIMARY) slot. Either pass it as
  a soft "vibe bias" line in `context` (leaving `text` empty so lane stays the
  driver), or soften the prompt so a vibe is a *lean*, not a hard build-around.
  Smallest surface: change the `runVibe` `buildQuery` call so the vibe rides
  `context`, not `text` — no engine change needed.
- **RC-2:** add a single top-up pass when a fresh AI set returns `< 5` (re-ask
  with the shortfall count and the current titles in the avoid list) before
  shipping. One extra request, bounded.
- **RC-3:** for the like/dislike backfill, raise the ask above 2 and/or relax the
  6 s abort so one repeat doesn't empty the slot; keep the seen-filter.
- **RC-4 (visibility, do this regardless):** give the AI-null backfill an honest
  notice (mirror the pool voice) so an empty AI frontier is **never silent** —
  the cheapest, safest change and it would have made both symptoms self-reporting.

## What Brad should test to confirm

1. **Isolate A's over-constraint:** fresh session → Movies → Crime lane → "Goofy
   / Silly Fun" vibe → GO. Open DevTools **Network** and read the `/api/openai`
   response body: count the items the *model* returned. If the model itself
   returned ~1–2, it's RC-1 (over-constraint); if it returned 5–6 and the UI
   shows 1, it's S4/S5 dedup against a pre-seeded `sessionSeen` (had you already
   run crime that session?).
2. **Watch B's backfill fire-or-fail:** fresh session → type "crime" → GO (note
   the initial count is < 5). Thumb-up each card and watch Network: is a
   `/api/openai` backfill firing on every like? Are they returning **repeats**
   (proves seen-filter emptying, RC-3/§6) or **aborting at ~6 s** (proves the
   timeout, RC-3)? Console will show `"AI backfill failed; slot left empty."`
   on each silent failure — that string appearing per-like confirms RC-3+RC-4.
3. **Contrast with a broad lane:** repeat step 2 with a wide query (e.g. type
   "space" or use no lane). Healthy 5-and-refilling behavior there isolates the
   failure to **crime's narrow vocabulary**, confirming §6 rather than a global
   backfill break.

*No fixes applied — diagnosis only.*
