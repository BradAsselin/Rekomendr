# S24 — Compare to, Recent, top bar, Say it / Snap it (plan, 2026-10-25)

Brad named this file `s22-compare-to-plan.md`. The session runs as **S24**,
because S22 (grants audit) and S23 (grants tightening) already exist in
`docs/SESSION_LOG.md`.

Local agent mode (charter §11). Brad's instructions for this run:
- Merge to main when green. Never release/v2 or Production. §0 and §12 apply.
- Movies, TV and Books are in scope. Wine is unchanged: it keeps its auto go-to compare and its taste bars.
- **Approved wording, and nothing else:** "Compare to", "Compare to…", "vs. [Title]:", "Done", "Favorites", "Watched", "Recent", "Saved", "Clear recent", "Show posters", "Hide posters", "Say it", "Snap it", "Something fun and funny", "A poster, a shelf, the TV", "Watched it".
- Existing approved strings stay where they already live: "vs. your [Title]:" (S12/S20), "Sign in", "Sign out", "Share", the TMDb notice.

## Brad's spec (as given, condensed)

1. **Steering off by default (Movies/TV/Books).**
   - No automatic favorite steering, and no automatic "vs." lines, on chip, typed or spoken results.
   - Cards show the TMDb synopsis only.
   - Favorites shape picks only when chosen in Compare to.
   - Snap and typed-title anchors keep their own anchor behavior.
2. **Compare to.**
   - **Header row:** the chips/mood on the left; on the right, an outlined "Compare to ☐" button with an empty checkbox square.
   - **The sheet:** a bottom sheet titled "Compare to…" with tabs Favorites · Watched · Recent · Saved.
     - Each row has a small poster, the title, "type · year/seasons", and a check circle.
     - Up to 3 picks; "Done" applies.
     - The sheet shows the current category only.
   - **Applied:** a filled chip per reference, "vs. Knives Out ×" (× removes that one), plus a "+" chip that reopens the sheet. Removing the last chip returns to neutral.
   - **Effect:**
     - The mood still decides the lane.
     - The references pull the five toward their TMDb recommendation neighborhoods (S12 logic, driven by the chosen references).
     - Each card gets a highlighted line "vs. X: …". With 2–3 references, a card compares to the closest one, named.
     - "your" appears only for a starred favorite.
     - Early paint: the cards come first, then the lines.
   - **Persistence:** references stay through genre/vibe changes and new searches, until cleared or the category changes. Stored per device.
3. **Recent.**
   - A per-device list (localStorage, try/catch) of the last ~30 cards the person opened, shared, saved or marked.
   - Newest first, all categories.
   - "Clear recent" at the bottom of the Recent tab.
   - Never sent to the server (§0 rule 6).
4. **Top bar.**
   - "Saved [n]" becomes four labeled icon buttons: ★ Favorites · ✓ Watched · ↺ Recent · 🔖 Saved, each with its count. Each opens the Saved page on its tab; the Saved page gets a Recent tab.
   - Share, Sign in, Show/Hide posters and the TMDb attribution move into a ⋯ menu at the top right.
   - The logo stays.
5. **Home.** The big center button splits into **Say it** (mic; starts voice) and **Snap it** (camera; opens the camera). Each has a one-line hint ("Something fun and funny" / "A poster, a shelf, the TV"). The search box keeps its mic and camera.
6. **Watched it** (Movies/TV/Books cards): an outlined pill with a check-circle icon and "Watched it". The filled state reads "Watched". S16 behavior is unchanged.

## Split (charter §3.2: bigger than one PR, so two stacked PRs)

- **S24a — Compare to** (`auto/s24a-compare-to`): items 1, 2, 3. Recent's store and the Saved page's Recent tab ship here, because the Compare sheet reads Recent.
- **S24b — chrome** (`auto/s24b-top-bar`): items 4, 5, 6.

Each PR merges when green: tsc and lint clean, every harness green, the new harness green, and Playwright acceptance at iPhone size on its own preview (§10.3, §11.4/11.5).

## Mechanism — S24a

### Data: references (`src/lib/compareTo.ts`, new)
- **A reference** = `{ category: "Movies"|"TV Shows"|"Books", name, year, tmdbKind, tmdbId, posterPath, at }`.
- **One applied set per device:** `rekomendr.compare_to` = `{ category, refs: Ref[] }` (≤3), in localStorage with try/catch. If storage fails, the set holds in memory for this tab. A change event lets the header and page follow.
- **Category rule:**
  - `refsFor(category)` returns the set only when its category matches.
  - `clearIfCategoryChanged(category)` is called when the bar's category changes, when a search lands in another category, and when a typed mood moves the category.
  - Neither home (the wordmark) nor a reload clears the set: the bar mounting isn't a change. A stored set only acts in its own category, so a TV set is inert on Movies, and the next Movies search clears it.
- **"your":** decided live with `isGoTo(category, name)`, the S20 rule already in `vsLead`.

### Data: Recent (`src/lib/recent.ts`, new)
- `rekomendr.recent`: newest first, ≤30, de-duplicated by (category, title); a repeat moves to the top and keeps the best-known poster and id. localStorage with try/catch. **No network call anywhere in the module** (a harness checks for `fetch(`).
- **Written from:**
  - search-lane cards (ResultsV4): open (details toggle, title tap), Share tap, Save, Watched, star;
  - lib-level marks for both lanes: `recordLike` save/like, `recordSnapSignal` save, the watched hook, `starGoTo`;
  - snap-lane card open/share where the call site already exists.
- Wine items are recorded (Brad: "all categories") and show on the Saved page's Recent tab. The Compare sheet shows only the current category, so wine never appears there.

### Steering off (Movies/TV)
- `fetchSlots` stops sending the go-to mirror as steering. It sends:
  - `goTos` for **exclusion only** (starred titles still never come back as picks; that is the S12 guarantee and isn't steering);
  - `refs` = the applied references, plus a title the person **named** in a spoken or typed mood (S13c/S19a, transient, never stored).
- **Why a named title still steers:** the person chose it in their own words, which is a deliberate act and not automatic. A starred go-to the person names is passed with its TMDb id, as before.
- **`/api/slots`:**
  - `recipeFor(refs.length)` (none / one / many, the S12 recipe);
  - the neighbors are the **union** of each reference's web, interleaved round-robin, with each pick tagged with the reference it came from;
  - the exclusion set is unchanged: seen, go-tos (with their TMDb titles), watched, disliked, plus every reference's own title.
- **Closest reference per card:**
  - a neighbor pick belongs to the reference whose web it came from;
  - any other slot (touchstone, fresh, classic, new, popular) goes to the reference with the highest genre Jaccard against the pick, ties to the first reference;
  - with one reference, every card compares to it.
- **Lines:** one `linesVsGoTo` call per reference that has cards, in parallel. Each call goes through `capGate` and uses the existing chooser prompt verbatim (**no prompt text changes**). A failed call ships synopses for that group, named in the log.
- **Early paint:** the S16 NDJSON stream is unchanged. `linesPending` is true only when references exist.
- **Screen snap** (`/api/screen`) sends `refs` for its category instead of the go-to mirror, so it is neutral by default too.

### AI-path results with references (typed moods the gate sends to AI, the slot fallback)
- The words decide the five, as today.
- If references are applied, a **lines-only** request (`/api/slots` `{ action: "lines" }`) runs after the cards paint:
  - it resolves the five on TMDb (the verify matcher, already cached);
  - it picks the closest reference per card by genre;
  - it writes lines the same way.
- Cards update in place (merge by title). No re-rank on this path: the person's words already chose the five.

### Books
- TMDb doesn't know books, so the S12 Books precedent applies. With references applied, a Books search runs the existing **seeded** AI search: seed = the first reference, the lane and vibe kept. Its existing placement sentence names the reference.
- **No "vs." line on Books cards:** a Books line writer needs new prompt text, which is VOICE. Logged as Brad's call.
- The Compare to button and sheet work on Books the same way. Rows show no poster (a placeholder square).

### UI
- **Header** (ResultsV4, Movies/TV/Books only, never Wine or a screen set):
  - left: the label;
  - right, with nothing applied: the outlined "Compare to" button with an empty checkbox square (`Square` icon);
  - applied: filled chips "vs. Title ×" plus a "+" chip, wrapping under the label when they don't fit.
- **Sheet** (`CompareSheet.tsx`, new):
  - a bottom sheet with a grab bar, the title "Compare to…", and a segmented control Favorites · Watched · Recent · Saved;
  - each row: a 40×60 poster, the title, "type · year/seasons", and a check circle;
  - "Done" at the bottom;
  - opens on Favorites when that tab has items for the category, else Recent. Pre-checks the applied set; a 4th tap is refused (the row doesn't check);
  - Done with nothing checked clears the set.
  - **Rows:**
    - Favorites = `goTosFor(category)`;
    - Watched / Saved = `/api/saved` for this category;
    - Recent = `recent.ts` for this category.
  - **Missing posters** come from `/api/facts` in batches of 12 (by TMDb id, else by title), cached in memory.
  - **Seasons** come from the same read (TV commitment "3 seasons"); the year is used when unknown.
- **The vs. line is highlighted:** the lead and line sit on a pale-blue band (`bg-[#EEF3FC]`, the app's blue family) on the D2 card. Non-vs cards are unchanged.
- **Applying or removing a reference re-runs the current search** with the new set, keeping the header (it re-uses the last request). This is the S12 Steer by re-run, now driven by Compare to.

### Races considered
- Every re-run goes through `handleSearch` / `searchIdRef`, as every search does. A late answer for the old reference set can't land over the new one.
- **Lines-only requests:** epoch-guarded on `searchIdRef`, and merged by title only into cards still on screen.
- **Backfill:** `slotBackfill` sends the references the set was built with (captured in `slotReqRef`), not the live store, so a replacement matches its set.

## Mechanism — S24b

- **Top bar** (`layout.tsx` TopBar → `TopNav.tsx`, new, client):
  - `SavedPage` renders the four labeled buttons (icons Star · CircleCheck · RotateCcw · Bookmark), with labels "Favorites", "Watched", "Recent", "Saved" and counts. Each opens the sheet on its tab.
  - A ⋯ button (`MoreHorizontal`) opens a small menu. It ships with `aria-haspopup="menu"` and **no screen-reader name**: a name would be new wording, and S17's poster × set the precedent. The name is Brad's call. The menu holds:
    - **Share:** the existing ShareButton action and toasts;
    - **Sign in / Sign out:** AuthControl moves here, with its form inline in the menu. Its auth listener and merge stay always mounted.
    - **Show posters / Hide posters:** the label says what a tap does;
    - **the TMDb notice and logo.**
  - The footer attribution leaves the page body, and the Saved page footer's "Show posters" switch moves to the menu.
  - On a 375 px phone, the four buttons plus ⋯ fit one row: icon over label, 11 px labels.
- **Home** (`RekSnapButton.tsx` → `SayOrSnap.tsx`): two equal buttons side by side, each with its hint underneath. Say it calls SearchBar's mic (registered like `registerVibePlay`). Snap it calls `openSnapPicker`. Same visibility as today (phone width, before the first snap).
- **Watched it** (`WatchedControl.tsx`):
  - unmarked: an outlined rounded-full pill, `CircleCheck` 16 px, "Watched it";
  - marked: a filled pill (`#1E3A8A`, white) reading "Watched";
  - same `data-testid` and `aria-pressed`;
  - the Saved page row keeps an icon-only `compact` variant so its 44 px control column doesn't grow.

## Blast radius
- **Server:** `/api/slots` (refs, the per-reference lines, the lines-only action) and `/api/screen` (refs). No schema, no migration, no env.
- **Client:**
  - `page.tsx`, `ResultsV4.tsx`, `RekCard.tsx` (the highlight), `SavedPage.tsx`, `SearchBar.tsx` (mic register), `WatchedControl.tsx`, `layout.tsx`;
  - new: `compareTo.ts`, `recent.ts`, `CompareSheet.tsx`, `TopNav.tsx`, `SayOrSnap.tsx`;
  - `userPrefs.ts` / `reksnapSignals.ts` / `goTos.ts` / `useWatchedMarks.ts` (one `noteRecent` call each).
- **Wine:** no code path changes. Wine's header stays null, and its slot/snap paths don't read references.

## Deliberately out of scope (logged)
- A Books "vs." line (needs new prompt text: VOICE).
- Re-ranking AI-path Movies/TV sets by references (lines only; the words chose the five).
- Syncing Recent or references across devices (per device by spec; §0 rule 6 for Recent).
- Any prompt or voice text change.

## Approved-wording audit (both PRs)
A harness diff greps every new user-visible string in the changed components against the approved list above, plus the existing strings ("vs. your", "Sign in", "Sign out", "Share", the TMDb notice, "Undo" toasts), and fails on anything else. The type labels in sheet rows ("Movie", "TV", "Book") are the "type" Brad specified; they are flagged in the summary as the one judgment call.
