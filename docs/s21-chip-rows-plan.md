# S21 — chip rows (Brad's brief, 2026-10-25)

Branch `auto/s21-chip-rows` → PR to `main`. Local agent mode (§11). Merge when green; never `release/v2` or Production. §0 and §12 apply.

**Fence:** home-screen chip rows, new genre and vibe pools, go-tos bar off the home screen, "+ More like this" on Favorites. No prompt voice, no schema, no env.

## What Brad asked for

1. **Genres: one horizontal scrolling row.** Momentum scroll, no scrollbar, the row runs to the screen edge so the last visible chip is cut off (the hint that it scrolls). Reduced motion respected.
   - Movies: Comedy · Drama · Thriller · Action · Romance · Crime · Sci-Fi · Horror · Mystery · Animation · Family · Fantasy · Documentary · War · Western · Surprise me
   - TV: Comedy · Drama · Crime · Mystery · Sci-Fi & Fantasy · Action & Adventure · Reality · Documentary · Animation · Family · Western · Surprise me
   - Wine: its current chips, same scrolling row.
2. **Vibes: a second scrolling row**, hidden until a genre is selected; it slides and fades in under the genres. Tapping the selected genre again deselects it and hides the vibes.
   - Feel-good · Funny · Dark · Smart · Cozy · Tense · Epic · Classic · New · Short
3. **"Your go-tos" off the home screen**, every category (wine was the last one showing it). Go-tos live in Saved → Favorites; every Favorites tile gets "+ More like this", wine included. Favorites still steer the picks.
4. **Keep:** Saved and Share at the top, the RekSnap button, the search box (mic + camera).

## Mechanism

### Chips (`src/lib/moodChips.ts`, `src/components/SearchBar.tsx`)
- `CHIPS_BY_CATEGORY` takes the approved order. Books keeps its chips (the brief doesn't name Books).
- `REFINERS_BY_CATEGORY` for Movies and TV takes the ten vibes. Each new tone vibe rides an **existing** `TONE_BY_VIBE` key, so the AI fallback path gets an already-tuned tone clause and no prompt text changes:
  - Funny → "Goofy / Silly Fun"
  - Cozy → "Comfort Watch"
  - Tense → "Suspense / Edge-of-Seat" (Movies), "Edge-of-Seat" (TV)
  - Epic → "Epic / Immersive"
  - Short → a new refiner kind `short` (a length limit, not a tone). On the AI fallback it qualifies the lane text, the way Classic/New already do.
- Wine and Books keep their own second rows.
- Rows: `flex overflow-x-auto` with no scrollbar, bleeding to the screen edge (`-mx-4 px-4`), chips `shrink-0`. The vibe row mounts only when a genre is selected, with a short fade-and-slide (`motion-reduce:animate-none`). Tapping the active genre clears the genre and vibe and runs no search; the results on screen stay.
- Precedent (§12.2): the scrolling chip row with a cut-off last chip is the Google Search, YouTube, Netflix and App Store pattern. The cut-off chip is the standard way to signal that a row scrolls. A dependent row that appears after a parent pick is progressive disclosure (NN/g).

### Pools (`src/lib/slotRecipe.ts`) — same slot recipe, floor and S20 keep-outs
- New lanes. Movies: horror 27, war 10752, western 37 (mystery, animation, family and fantasy were already mapped). TV: "sci-fi & fantasy" 10765, "action & adventure" 10759, western 37. The old keys stay as aliases for the voice parser.
- Kids' animation stays out of Comedy as before. **New:** the Animation and Family lanes no longer shut each other out, so Pixar reaches Movies → Animation. TV Kids (10762) stays out unless the lane is Family.
- Tone matching moves from regexes to an exact vibe table. "Comfort Watch" (Cozy) must not match Feel-good's `/comfort/`.
- New vibes:
  - **Funny:** the title must carry Comedy (`allOf [35]`) unless the lane already is Comedy.
  - **Cozy:** Feel-good's keep-outs (BRIGHT_OUT, FEEL_GOOD_OUT, TV horror, TV teen drama), plus Crime and Action out unless the lane carries them. Must carry one of the warmth keywords: cozy, cosy, heartwarming, heart warming, feel good, feelgood, wholesome, small town, found family, friendship.
  - **Tense:** Movies must carry Thriller or Mystery. TV must carry Mystery, Crime or Action & Adventure. TV procedurals stay out (S20b set).
  - **Epic:** Movies run at least 130 minutes and carry Adventure, Fantasy, Sci-Fi, War, History, Western or Action. TV carries Action & Adventure, Sci-Fi & Fantasy or War & Politics.
  - **Short:** Movies run 60 to 100 minutes (TMDb runtime). TV is a miniseries or has at most 2 seasons (TMDb `type` / `number_of_seasons`). These come from one details read per show, capped at 80 per pool and cached for the process.
- The route (`app/api/slots/route.ts`) accepts `{kind:"short"}`, and the `[slots]` log names it.

### Go-tos (`app/page.tsx`, `src/components/SavedPage.tsx`)
- `GoTosList` leaves the home screen. WineFollowup and "Wine you bought" stay: they aren't the go-tos bar.
- Favorites rows add `MoreLikeThisButton` beside the star. A tap runs the counted go-to "more" (`goto_more`), the same path the home bar used. Tapping the title still opens it, uncounted.

## Races considered
- A deselect while a search is in flight: the deselect runs no search, so the in-flight answer still lands. That's correct: the person asked for it, and the results stay visible either way.
- The voice parser can set a genre: the vibe row appears with it, which is right.
- The per-process cache for the TV Short details read is bounded (80 per pool; Map capped).

## Blast radius
Home layout (all categories), slot pools for new lanes and vibes. Existing chips keep their filters (exact vibe table checked against S20/S20b suites).

## Out of scope
Books chip changes, wine chip changes, any prompt or voice text, the results header wording (it already shows "Genre · Vibe").

## Acceptance
iPhone width (390): one genre row, about 4–5 chips visible and the next one cut off, no vibe row, no go-tos bar. Swiping left reveals more. Tap Comedy and the vibes appear; tap again and they hide. Spot-check each new genre and vibe for 10 titles (counted, reported in the PR and the log).
