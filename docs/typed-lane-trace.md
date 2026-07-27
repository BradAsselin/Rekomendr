# Typed-Lane Trace — Stale Lane Restore (A) + Silent Anchor-Drop (B)

**Status: READ-ONLY TRACE — no fixes implemented.** Performed 2026-07-19 against `main` @ `48317fa`. All quotes verbatim from disk.

---

## Issue A — Stale lane restore (old-grammar results on load)

Observed: on page load, a lane chip like `Comedy · "Tom hanks"` appears with a results set in the pre-July-3 register (e.g. *"leading to comedic chaos"*), deterministic and identical across dev and prod. A fresh GO on the same query produces current-grammar results.

### A.1 There is NO persistence or restore code in the current bundle

Exhaustive inventory of every client-storage read/write in `src/` and `app/` (grep for `localStorage|sessionStorage|getItem|setItem`):

| Key | File | Holds |
|---|---|---|
| `rekomendr.client_id` | `src/lib/userPrefs.ts:11-18` | anonymous identity UUID |
| `rekomendr.tier`, `rekomendr.searches.<date>` | `src/lib/softWall.ts:4-5` | quota tier + daily counters |
| `rekomendr.chain.state` | `src/lib/softWall.ts:6` | legacy chain quota state (see below) |
| `rekomendr.snap_count` (sessionStorage) | `app/page.tsx:53` | snap counter |
| beta unlock key | `src/lib/betaUnlock.ts` | beta status |
| `rekom_anon_id` | `src/components/SurveyModal.tsx:23` | survey identity |

**None hold a lane, a query, or a results set.** The one thing that superficially resembles lane persistence — `softWall.ts`'s `ChainState` (`src/lib/softWall.ts:8-14`, with `vertical` and `baseQuery` fields) — is written only by `beginChain` and read only by `getActiveChain`, and grep shows **zero call sites for either outside `softWall.ts` itself** (`src/lib/quota.ts:108` references a different helper). Dead plumbing.

All three state owners initialize empty on every mount:

- `app/page.tsx:104`: `const [reks, setReks] = useState<Rek[]>([]);`
- `src/components/SearchBar.tsx:65-83`: `input`, `category ("Movies")`, `clarifier (null)`, `lastSearchMode (null)`, `lastTypedSeed ("")` — all fresh `useState` defaults; nothing reads storage or the URL.
- `src/components/ResultsV4.tsx:72`: `const [reks, setReks] = useState<Rek[]>([]);` — synced from props only.

The only URL-restore code in the repo is **dead**: `src/hooks/useLegacySearch.ts:25-36` restores from `?q=` on mount —

```ts
  // Autofocus + ?q=
  useEffect(() => {
    inputRef.current?.focus?.();
    try {
      const url = new URL(window.location.href);
      const q = url.searchParams.get("q");
      if (q && q.trim()) {
        getRecs(q);
      }
    } catch {}
```

— but `useLegacySearch` is imported only by `LegacyResultsView.tsx` (a type import), and `LegacyResultsView` is imported by **nothing**. It cannot run.

**Conclusion: a genuinely fresh page load cannot render a lane chip or a results set.** The chip's presence proves the page was not freshly loaded.

### A.2 The mechanism: a resumed page, showing pool data

**Mechanism (named): installed-PWA / app-switcher session resume.** The app registers a service worker and is installed to the home screen (`src/components/InstallButton.tsx:20-21` registers `/sw.js` on every mount; iOS install tip at lines 78-89). When an installed PWA is re-opened and iOS has not jettisoned the WebKit process, the page **resumes with its entire JS heap intact** — chip state, results state, everything — and this is visually indistinguishable from a page load (splash screen included). Nothing in the code restores state because nothing needs to: it never left.

That explains the chip. The old-grammar deterministic results pin down *what* the frozen results were:

**The results are pool data — canned repo content that the July 3 grammar work never touched.**

- The grammar work is client-side, in the engine's AI prompt: commits `22f1868` and `d6e7758` (both 2026-07-03) rewrote `buildAIPrompt` in `src/engine/rekomendrEngine.ts` — including the explicit ban that matches the observed register, `rekomendrEngine.ts:623`:

```
- short must end on a concrete noun or stake. BANNED endings: 'leading to...' in any form ('leading to humorous and poignant situations', 'leading to unexpected romance', 'leading to a series of comedic events'), ...
```

- The pool files were last touched **2026-01-03** (`efad30a — "V2 working build: enriched pools, stable engine, full copy"`). Their descriptions are six months older than the grammar work, e.g. `src/data/pools/tv.enriched.ts:71`: `"Three interconnected families navigate parenting, relationships, and generational chaos."` — exactly the pre-July register.
- Pool sets are **deterministic and identical across dev and prod by construction**: `/api/recs` returns the repo arrays verbatim (`app/api/recs/route.ts:13-20`), and the Play path selects from them deterministically. For a non-vibe lane like "Comedy", `deckFromClarifier` returns null (`rekomendrEngine.ts:162-172` — only `vibe:` prefixes map to decks), so the compass branch is skipped and the deck fallback runs with the default (`rekomendrEngine.ts:947-951`): `chosenDeckId = deckId ?? starterDeckId` → `"comfort-core"`. `getTop5FromDeck` walks the deck's title list **in fixed order, skipping titles not present in the pool** (`src/engine/deckSelector.ts:53-62` — and four comfort-core titles, The Princess Bride, The Sandlot, The Goonies, and School of Rock, are not in `movies.enriched.ts` at all). A fresh session's first pool set for Movies is therefore always: *Back to the Future, The Shawshank Redemption, Forrest Gump, Ocean's Eleven, Chef* (corrected 2026-07-19; see `docs/pool-copy-rewrite.md`). **Verification for Brad: if the resurrected set is (mostly) these titles, the pool provenance is confirmed on sight.**

How a *typed* chip ends up sitting above a *pool* set: in the current bundle it can't — typed GO always tags `mode: "ai"` (`SearchBar.tsx:341-343`) and pool is Play-only (`rekomendrEngine.ts:236`). But the frozen session need not be running the current bundle: a PWA that resumes across deploys keeps executing the bundle it loaded at open time. Pre-`cc4abe8`/`9820c46` (both 2026-07-04, "no silent pool fallbacks" / "pool is opt-in via Play only") bundles **silently fell back to the pool when AI failed** — a typed `Comedy · "Tom hanks"` search whose AI call failed would render a pool set under the typed chip with no notice. That is the exact fossil observed. (A secondary fossil vector, worth noting while in here: `public/sw.js:1` pins a never-rotated cache name `const CACHE = 'rekomendr-v1';` and falls back to cached responses on network failure (`sw.js:43`) — so a flaky network can boot a months-old shell/bundle. It cannot conjure a chip on a fresh boot, but it can keep old *code* alive the same way process-resume keeps old *state* alive.)

"Fresh GO generates correct current-grammar results" fits both variants: if the resumed heap is a current bundle showing frozen pool-set state (e.g. from a Play press), GO routes AI with the current prompt; if the resumed bundle was stale, the observed fresh-GO correctness implies the shell had by then reloaded onto current code while the earlier screenshot preserved the old state. Either way, **every observed symptom traces to canned pool text surviving unchanged since January plus a session-resume surface that re-presents old screens as if fresh.**

### A.3 Cheapest fix (not implemented)

**A staleness guard on resume — ~10 lines in `app/page.tsx`:** stamp a `lastActivityRef` on every search/snap, and on `pageshow`/`visibilitychange`, if the state is older than N hours (e.g. 6), call the existing `resetToHome()` (`page.tsx:242-260`), which already clears every surface and remounts the SearchBar. This kills every resurrection symptom regardless of which fossil produced it, using machinery that already exists.

Companion content fix, independent: the pool copy itself still speaks the January register and is legitimately reachable today via Play — a data-only rewrite of the pool `short`/`long` fields to current grammar removes the *noticeable* mismatch even when a pool set is shown intentionally. Optional hardening: version the SW cache name per deploy (`sw.js:1`).

---

## Issue B — Silent anchor-drop on unrecognized typed input

Observed: a typed search for an unrecognized brand/title (the "Bonanza" class) never anchors it and proceeds silently — five confident, generic results, no notice. The vision path anchors fine.

### B.1 Where a typed query would become an anchor: nowhere

The typed path, end to end:

1. `SearchBar.tsx:334-343` — typed text becomes the third segment of the query string; mode is always AI:

```ts
   if (trimmed) {
     setLastSearchMode("typed");
     setLastTypedSeed(trimmed);

   // typed should clear vibe modifier (prevents weird “sports + goofy” unless user re-adds)
    setActiveVibe(null);

     const mode: "pool" | "ai" = "ai";
     const q = buildQuery(categoryRef.current, clarifierRef.current, trimmed, mode);
     startSearch(q, categoryRef.current);
```

2. `page.tsx:221` → `getTop5FromEngine({ rawQuery: query, ...prefs })` → `parseRawQuery` folds the text into a free-form context string (`rekomendrEngine.ts:244-251`):

```ts
  const context = [
    `Vertical: ${category}`,
    clarifier ? `Lane/Clarifier: ${clarifier}` : "",
    text ? `User text: ${text}` : "",
    `Mode: ${mode}`,
  ]
```

3. `buildAIPrompt` treats it as steering, never as an entity to resolve (`rekomendrEngine.ts:600`): `- The user's explicit text input is the PRIMARY signal — build recommendations around it first, ...` — and the prompt's seed slot is explicitly empty for fresh searches (`rekomendrEngine.ts:652-653`):

```
Seed title:
${seedTitle ? seedTitle : "(none)"}
```

`seedTitle` is populated on exactly one path in the codebase: `getMoreLikeThisSet` (`rekomendrEngine.ts:1149`, `seedTitle: seed?.title`) — the MLT chain, where the seed is an already-rendered card, not user text.

**There is no anchor-resolution step in the typed lane.** Nothing asks "what is 'Tom hanks' / 'Bonanza'?"; nothing confirms the model recognized it; nothing renders what the search was anchored to. Contrast the vision lane, where the anchor is a *required response field*, structurally validated, with an honest failure voice (`app/api/reksnap/route.ts:947-957`): a response without a valid `detected_item` is a 502 `"Could not read that photo."`.

### B.2 Where the silence lives

Four layers, none of which can distinguish "recognized and anchored" from "free-associated":

1. **The prompt contract** has no recognition field — the model is never asked to state what it understood the text to be, so an unrecognized input degrades into vibes-only generation with no marker.
2. **Client-side sanitization checks shape, not relatedness** — `sanitizeGeneratedRek` (`rekomendrEngine.ts:455-522`) validates title/year/short and even fabricates a fallback short (`rekomendrEngine.ts:491-493`: `"A ${category.toLowerCase()} recommendation chosen to match the current vibe and discovery path."`), so structurally clean nonsense passes.
3. **The engine only reports hard failure** — `getTop5FromEngine` returns `[]` solely when the AI call itself fails (`rekomendrEngine.ts:855-857`: *"No silent fallback: a failed deliberate path reports empty..."*). A successful-but-unanchored generation is indistinguishable from a good one.
4. **The page only alarms on empty** — `page.tsx:225`: `if (next.length === 0) setSearchError(AI_SEARCH_FAILED_MSG);`. Five wrong cards is a success by this test.

**Mechanism (named): missing anchor contract in the typed lane.** The routing rule ("no silent fallbacks") is enforced for *hard* failures but the typed lane has no concept of a *soft* miss — recognition failure produces confident output with zero provenance.

### B.3 The decision Brad needs to make

Three registers, in ascending build cost:

- **Fail loud.** Extend the search response contract with an anchor echo (model returns what it resolved the text to + whether it recognized it); unrecognized → the one failure voice ("Reks Ray doesn't know 'Bonanza' — try a title or a vibe") and no result set. Cleanest honesty; costs a real miss when the model is merely unconfident about something real.
- **Fallback register.** Always render the echo as a provenance line above the results ("interpreted as: the actor Tom Hanks" / "couldn't place 'Bonanza' — showing Comedy picks instead") and proceed. No dead ends; slightly noisier UI; the miss is visible but not blocking.
- **Anchor-card convergence.** The typed lane grows a real anchor card (the snap lane's `detected_item` grammar): the resolved entity renders as the accent card, results hang off it. Biggest change — but it is also the S3-adjacent direction (a typed search of a saved/shared item would then anchor exactly like a snap), and it makes the two lanes' result grammars fully symmetric.

The middle option is the smallest change that ends the silence; the third is where the product grammar has been converging (card unification, behavior unification, reks-carry-category all moved this way).

---

## Do A and B share machinery?

**No shared mechanism — one shared root.** A is stale canned *content* re-surfacing through session-resume; B is a missing *contract* field in live generation. Neither causes the other. But both are the same class of hole: **the typed lane's results carry no provenance.** A screen of cards does not say which era's grammar produced it (A: pool text vs. current AI text look equally authoritative) or what it was anchored to (B: free-association vs. recognition look identical). The snap lane has neither problem because its contract forces provenance: `detected_item` on every result, failure as a typed error. Any fix for B that adds an anchor/provenance line incidentally makes A-class fossils self-identifying too.

## Interaction with S3 (landing page → app handoff)

Per the S3 blueprint, the landing-page CTA hands a new user to `rekomendr.ai` cold — a plain link. On that shape, neither issue does anything new.

They start to matter if the handoff ever deep-links:

- **B bites first and hardest.** The natural "open this in the app" upgrade is a `?q=<item name>` deep-link into typed search (precedent already in the repo, currently dead: `useLegacySearch.ts:25-36`). Shared anchors skew toward exactly the obscure items (an unusual scotch, a niche label) the typed lane is most likely to fail to recognize — so a recipient's *first-ever* experience of the product would be silently unanchored results for the very item their friend shared. **Rule: no typed-lane deep-link handoff until B's anchor contract exists.** With B's third option (anchor-card convergence) built, the handoff becomes natural: the snapshot already carries `item_name` + `category` + descriptions, and could seed the anchor card directly — no re-recognition needed at all.
- **A bites second-hand.** Landing pages are an acquisition surface for the installed PWA (the layout's Install button rides along on `/a/*` via the root layout); new installs inherit `sw.js` and the session-resume behavior, so A-class resurrection becomes a *first-week* impression for share-acquired users rather than a power-user quirk. The A.3 staleness guard is cheap insurance to land before S3 drives installs.

## Fix order implied (not implemented)

1. A.3 staleness guard (~10 lines, kills resurrection symptoms).
2. B's contract decision — Brad picks the register; if S3 deep-linking is ever wanted, B is a prerequisite.
3. Pool copy refresh (data-only, un-gates Play from the January register).
