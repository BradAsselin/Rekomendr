# Rekomendr — Session Log

The record of the "Taste memory that illuminates" phase (see `docs/BUILD_CHARTER.md`).
Every autonomous session appends exactly one entry at the end of this file, in the
format from charter §8. The log, not any assistant's memory, is the record. Truth
lives on disk.

Entry format:

```
## Session <N> — <slug> — <date> — branch auto/s<N>-<slug> — PR #<n>
SHIPPED: <one line per change, user terms first, file/mechanism second>
FOUND, NOT FIXED: <anything outside the fence, with the file and line>
BRAD MUST: <paste-blocks, decisions, dashboard steps — or "nothing">
NEXT SESSION SHOULD KNOW: <state, gotchas, anything the charter should be updated to say>
VALIDATION: <the "Brad's twenty minutes" checklist, verbatim>
```

---
Entries before Session 26 (Sessions 0–25, Sept 12 – Oct 25, 2026) are in `docs/archive/SESSION_LOG_through_S25.md`, unchanged.

## Session 26 — Home fits one screen, Go, wine shelf Compare to — 2026-10-30 — branches auto/s26a-home-go, auto/s26b-shelf-compare (local agent mode, §11)

Brad's brief `docs/S25_HOME_GO_AND_SHELF_COMPARE_LAUNCH_PROMPT.md`. It's logged as S26 because S25 was already used. It shipped as two PRs to main. Production and release/v2 were not touched; no env changes, no SQL.

### SHIPPED
- **S26a, #93, merged as df51e38.** Items 1–3 and 8.
  - **Header.** The wordmark is top-left in the top bar with ⋯ on the right. The four list buttons are outlined tiles with colored icons (Favorites amber, Watched green, Recent gray, Saved blue). Search and chips follow.
  - **One screen.** The scroll came from `main.min-h-screen` sitting under the 57px bar. Body is now `min-h-[100dvh]`. The chip rows scroll inside a clip, so iOS's indicator can't draw a bar under them.
  - **Go.** It appears inside the field whenever the box has text. While listening, it stops the mic and runs the spoken words at once; the pause's own auto-run stays. Enter still works.
  - **Snap tips** no longer render under Say it / Snap it.
- **S26b, #94, merged as e588f9e.** Items 4–7.
  - **Off by default.** Wine compares to nothing unless picked; the go-to rides as `goTo`, a name only. Exception: a single-bottle (or typed) wine compares to itself (`autoRef`), with × to undo.
  - **Shelf reading.** "Reading the shelf…" then "… N bottles found", in place of the bottle pills.
  - **Top card.** "This shelf · most popular": name, price, one line, blue-dot bars, and no star, save or thumbs. The pick is returned as `wine.anchorPick` and logged as `[wine] shelf anchor`.
  - **Compare row and sheet.** "Your 5 from this shelf" sits beside Compare to. The sheet opens on "This shelf N": every bottle read, in shelf order, with the approved helper line.
  - **Picking a bottle.** The five re-run against it and may re-rank. The top card becomes "Comparing to · from this shelf" (amber, ×). Each pick gets "vs. [Short]:" and the orange ring at the bottle's taste position. × restores the earlier five without lines or rings. Up to 3 references; the first drives the lines.
  - **Prompt.** One conditional data line asks for `go_to` (the reference's taste) only when the client doesn't know it. Every existing line is byte-identical; the voice is untouched.

### CALLS (Brad's to overrule)
- **Wording not quoted in the brief:**
  - "Go" (the brief's name for the button);
  - "Comparing to" without "· from this shelf" for a Favorites/Recent/Saved reference;
  - the bare short name in the ring legend when the reference isn't the starred go-to;
  - the card's × screen-reader label reuses "vs. [Short] ×".
- **"Most popular"** is the vision read's main bottle, the one the photo centers on. A true popularity pick needs the locked vision prompt (§2.3), so it's a joint session; the pick and its shelf index are logged for tuning.
- **2–3 references:** the lines and ring measure against the first; the others ride as KEPT.
- **Single-bottle snap:** the top card stays the normal anchor card; the reference shows as the chip.
- **Shelf top card:** no Share row and no "Snap the shelf" button.
- **Price chips** stay between the top card and the "Your 5" row.

### VALIDATION
- **Harnesses:** new `validate-s26a` 20/20 and `validate-s26b` 44/44 (the real route with stubbed models). 48/48 suites green.
  - Updated: s13b, s13c, s17c, s24a/b, s25, s8b, s9. The s24a/s24b/s25 wine fences now diff their own merge commits.
  - tsc, lint and build are clean.
  - Note: the suites that shell out to `npx` need a shell on Windows. I ran them with a scratch preload shim that wasn't committed.
- **Playwright on the previews:**
  - `pw-s26a-home` 41/41: no scroll on all four categories at 390×844 and 375×667, the header order and colors, and Go for typed, Enter and spoken.
  - `pw-s26b-shelf` 42/42, using the stored fixture `scripts/fixtures/s26b-wine.json`.
- **Live model, preview:**
  - Comedy → Feel-good gave five cards in two taps.
  - A typed "Kim Crawford Sauvignon Blanc" auto-referenced, with 5/5 "vs. Kim Crawford:" lines and rings.
  - A Recent pick (Cloudy Bay) re-ran with 5 "vs. Cloudy Bay:" lines and rings at its position.

### TEST RESIDUE
`anon_agent_s26a_*`, `anon_agent_s26b_*` (api_usage rows). `/api/stats` excludes `anon_agent*`.

### PHONE CHECKLIST (iPhone, after promotion)
1. Home: logo top-left, ⋯ top-right, four colored list tiles, then search. No scrolling, and no blue bar under the chips.
2. Type a word: Go appears. Clear it: Go disappears. Say it: the words appear, Go appears, tap Go and the results come.
3. Wine → snap a shelf (or use the stored shelf shot): "Reading the shelf…" with no pile of bubbles. The top card is the shelf's main bottle, with no star or thumbs on it. The five picks have no "vs." lines.
4. Compare to → This shelf lists the bottles from the photo. Pick one you know.
5. That bottle is now the top card with an amber outline. Each pick says "vs. [it]:" and shows the orange ring on its sliders.
6. × goes back to step 3. The bottle is still in the This shelf list.
7. Snap a single bottle: it's compared automatically.
8. Movies still work: Comedy → Feel-good → five cards, two taps.

### PROMOTION
1. Promote `main → release/v2` (yours). No env changes, migrations or SQL.
2. Revert: `git revert -m 1 e588f9e` (S26b) and/or `git revert -m 1 df51e38` (S26a).

**§0 check: consistent.** Comparisons appear only for a bottle the person chose (or the bottle they just snapped), and each one names its reference. The home screen asks less effort (no scroll, Go never waits). The shelf list stays in the result on the device; nothing new is sent or stored.

## Session 27 — Shelf top card = the shelf's most popular bottle — 2026-10-30 — branch auto/s27-shelf-popular (local agent mode, §11)

**Brief (Brad, approved prompt change):** the shelf's top card is the best-known, most widely available bottle on the shelf, not the one the photo centers on. The label "This shelf · most popular" stays. Only that instruction changes. Log the pick and the reason in the result, add a test, and keep the go_to ring-taste line.

### SHIPPED
**#96 → 01fbc04**
- **Prompt (`SHELF_READ_PROMPT`):** the `anchor_price` instruction becomes `anchor_name / anchor_reason / anchor_price`. It asks for the best-known, most widely available bottle the read listed, and allows general label knowledge for that pick alone. The Return line gains those two fields. Every other line is byte-identical, and the go_to line is kept.
- **Parse:** `cleanShelfRead` keeps the pick only if it names a listed bottle, using the listing's spelling. The reason is capped at 120 characters.
- **Route (`wineSnap`):** on a shelf snap the set anchors on the pick, so detected_item, the token, the tag price and the exclusion from the five all follow it. The vision read's sentence describes the other bottle, so the swapped card has no short line. There is no swap on single-bottle snaps or for health-side names. The read's `anchor_price` is used only for the bottle it belongs to.
- **Result + log:** `wine.anchorPick = {name, shelfIndex, by: "shelf-read"|"vision", reason, visionName}` is in the response and in `[wine] shelf anchor`. `[wine] shelf read` also logs anchorName and anchorReason.

### TESTS
- `validate-s27`: 30/30.
- All 49 suites pass, with s13a now measured over S13's own range and s26b expecting the new shape. tsc, lint and build pass.
- Preview: `pw-s26b-shelf` 42/42, `pw-s26a-home` 41/41.
- The live shelf read is untested here because the repo has no shelf photo. It is on the phone checklist.

### YOUR CALLS
- The swapped top card shows no short line, because the vision text describes another bottle. Options: leave it as is, or generate one line for the pick (that would be a new prompt line).

### PHONE CHECKLIST (after promotion)
1. Snap a shelf where a famous bottle (e.g. Kim Crawford, La Marca) isn't in the center. The top card should be the famous one, with name, price and taste dot but no sentence.
2. The five picks never repeat the top card. The bottle in the center can appear as a pick.
3. Vercel logs: `[wine] shelf anchor` shows `by: "shelf-read"` and the reason.
4. A single bottle still compares to itself.

### PROMOTION
Promote `main → release/v2` (yours). There are no env, SQL or migration changes. Revert: `git revert -m 1 01fbc04`.

**§0 check: consistent.** The top card is a fact about the shelf (its most popular bottle). It is labelled as such and not presented as a pick. Nothing new is sent or stored.

## Session 28 — The shelf top card's own sentence — 2026-10-30 — branch auto/s28-shelf-line (local agent mode, §11)

**Brief (Brad, approved prompt change):** add one prompt line so the shelf read writes one short sentence about the picked top-card bottle, in the same wine voice and length as the other card lines, and show it on the top card. Change nothing else in the prompt.

### SHIPPED
**#98 → b634c95**
- **Prompt:** one added line in `SHELF_READ_PROMPT` asks for `anchor_line`. It opens on dry vs. sweet, then gives concrete signature notes, with no filler, rating, occasion or pairing; it is null without a pick. Nothing else in the prompt changed, including the Return line.
- **Parse:** `cleanShelfRead.anchorLine` is kept only beside a listed pick and capped at 240 characters. It is logged in `[wine] shelf read`.
- **Route:** a swapped top card's short is that line, pairing-cut like every wine anchor's. detected_item, the token and the picks' "Its signature profile" line all use it. With no line there is no short. With no swap, the vision read's text stays.
- **Client:** no change. The top card already shows the first sentence of detected_item's description.

### TESTS
- `validate-s28`: 17/17. All 50 suites, tsc, lint and build pass.
- Preview `pw-s26b-shelf`: 42/42.
- The live shelf read is still untested here (no shelf photo in the repo).

### PHONE CHECKLIST (after promotion)
1. Snap a shelf where a famous bottle isn't in the center. The top card should be that bottle with one sentence under its name, opening on dry or sweet, with no pairing.
2. If the famous bottle is the one in the center, the card reads as before.

### PROMOTION
Promote `main → release/v2` (yours). There are no env, SQL or migration changes. Revert: `git revert -m 1 b634c95`.

**§0 check: consistent.** One plain sentence about a labelled shelf fact. Nothing new is sent or stored.

## Session 28c — Home balance fix — 2026-10-31 — branch auto/s28c-home-balance

**Brief:** docs/S28_HOME_BALANCE_FIX.md. Brad's phone showed no Say it / Snap it under the chips, and the header felt crowded. No new wording.

### CAUSE (the missing buttons)
The S26a one-screen change did not cause this. The cause was the old `hasSnapped` gate in `app/page.tsx`. It hid the original hero snap button after the first snap in a session. S24b turned that hero into Say it / Snap it but kept the gate. The snap count lives in `sessionStorage`, so after any snap (for example, the S26b shelf test), every reload of the installed app came home with nothing under the chips. Tapping the logo would have brought them back; a reload would not. Reproduced in Playwright with `rekomendr.snap_count = 1`: the pair was missing before the fix and shows after it.

### SHIPPED
**#101 → 47bc3a2**
- The gate is gone, so Say it / Snap it always show on home (phone only, as before).
- Header: ⋯ alone in a 44px top-right row. The logo is centered on its own row at 34px, in the original logo's blue (#2D5AB5) and bold weight, with ~20px above and below. Then the tiles, then a 24px gap (was 12px) to search.
- Say it / Snap it fill the remaining height, because the body and main are now flex columns. They are at least 150px tall on a tall phone and 120px tall at ≤740px high. On screens ≤700px high, the logo drops to 26px and its padding to ~12px.
- `scripts/npx-shim.cjs` is committed: `node -r ./scripts/npx-shim.cjs scripts/validate-X.cjs` on Windows.

### TESTS
- New `pw-s28c-home`: 154/154 locally and on the preview. It covers Movies, TV, Books and Wine at 390×844 and 375×667, each with and without a prior snap: the pair is visible, inside the viewport and at least the minimum height, the logo is centered ±4px, and there is no page scroll. It also checks order, spacing and the logo size.
- On the preview, `pw-s26a-home` passed 41/41 (Go: typed, Enter and spoken) and `pw-s26b-shelf` passed 42/42.
- `validate-s17c`, `s24b` and `s26a` were updated for the new design. All 50 suites, tsc, lint and build pass.

### YOUR CALLS
- At 390×844 the pair fills ~414px of height (tall, narrow buttons), as the brief asks ("take up the remaining space"). As an installed app on an iPhone the visible height is smaller, so expect ~330px. If they look like pillars, a height cap is one line.

### PHONE CHECKLIST (after promotion)
1. Home: ⋯ top-right, then a big centered logo with space around it, the four tiles, a clear gap, search, then chips.
2. Say it and Snap it are back, big and side by side, and nothing scrolls. Also try it after a snap followed by a reload.
3. Type a word and Go appears. Tap Say it and the words appear with Go.
4. Same on Wine, TV and Books.

### PROMOTION
Promote `main → release/v2` (yours). There are no env, SQL or migration changes. Revert: `git revert -m 1 47bc3a2`.

**§0 check: consistent.** It restores the two fastest starts (say or snap) to the home screen. Nothing new is sent or stored.

## Session 29 — Say it / Snap it square + rotating nudge — 2026-10-31 — branch auto/s29-home-square

**Brief (Brad, in chat):** replace the two pillars with one split square and add a rotating nudge line, using four approved lines. Keep the header exactly as it is.

### SHIPPED
**#104 → e30b817**
- **Square:** one centered square, 260px at 390×844 and 200px on screens ≤700px high. 34px corners, #2D5AB5, a soft shadow, and a 1px white/35% divider inset 18% from the top and bottom. Each half is its own button: Say it starts the mic, Snap it opens the camera picker.
- **Placement:** 48px under the chip row, top-aligned. The margin accounts for the bar's 11px progress strip.
- **Nudge:** the per-button hints are gone. One 14px gray line rotates every 5s through the four approved lines (`NUDGES` in `SayOrSnap.tsx`), with dots under it. powered by Reks Ray™ stays at the bottom.
- **Header:** untouched (checked against the S28c positions).

### TESTS
- New `validate-s29`: 10/10. `validate-s24b` was updated for the removed hints. All 51 suites, tsc, lint and build pass.
- New `pw-s29-home-square`: 53/53 locally and on the preview. The others also passed on the preview: `pw-s28c-home` 154/154, `pw-s26a-home` 41/41, `pw-s26b-shelf` 42/42.

### YOUR CALLS
- **Dots:** the brief said three dots, but there are four lines. I used one dot per line, so the lit dot shows which line is up. Switching to three is one line.
- **Nudge timing:** the nudge keeps rotating with reduced-motion on. It changes text only, with no animation.

### PHONE CHECKLIST (after promotion)
1. Home: one blue square, centered, with a fine line down the middle. Mic + Say it on the left, camera + Snap it on the right.
2. Tap Say it and the mic starts. Tap Snap it and the camera opens.
3. The gray line under it changes every 5 seconds, and the lit dot moves.
4. Nothing scrolls, including on Wine, TV and Books.

### PROMOTION
Promote `main → release/v2` (yours). There are no env, SQL or migration changes. Revert: `git revert -m 1 e30b817`.

**§0 check: consistent.** The nudges show people the fastest ways to a choice (say a mood, snap a shelf). There is no urgency or nagging, and nothing new is sent or stored.

## Session 30 — List hint line + row chevrons — 2026-10-31 — branch auto/s30-list-hints

**Brief (Brad, in chat):** one approved hint line at the top of Favorites, Watched, Recent and Saved, and a small gray › at the right end of each row. Row taps behave as before. No other changes. Favorites had no hint line to replace (on main or in production), so I asked. Brad chose to remove "+ More like this" from Favorites rows.

### SHIPPED
**#107 → ed77b2f**
- **Hint:** "Tap any title for more like it, or to share it." in 13px gray-500 at the top of each tab with rows (`LIST_HINT` in `SavedPage.tsx`). Empty lists keep their existing empty lines.
- **›:** every row ends in a ChevronRight 16 in gray-400. The title still opens the card (not counted as a go-to "more"), and the › opens the same card. In Recent the › sits inside the row's one button. The row controls are unchanged.
- **Favorites:** "+ More like this" is gone from rows. The card it opens has More like this.
- **Test fix:** `pw-s29-home-square` now pauses its fake clock before load. A slow preview load had let the nudge turn before the first check.

### TESTS
- New `validate-s30-list-hints`: 8/8 (`validate-s30.cjs` is S3.0's, unrelated). `validate-s21-chip-rows` was updated for the removed button. All 52 suites, tsc, lint and build pass.
- New `pw-s30-list-hints`: 35/35 locally and on the preview, with every API POST stubbed so nothing is written. `pw-s29-home-square`: 53/53 on the preview, three runs in a row.

### PHONE CHECKLIST (after promotion)
1. Open each of Favorites, Watched, Recent and Saved. Each shows the gray hint line at the top and a › at the end of every row.
2. Tap a title and its card opens, as before. Tap a › and the same card opens.
3. Favorites rows show the star and ›, with no "+ More like this".
4. An empty list still shows its usual empty line, with no hint.

### PROMOTION
Promote `main → release/v2` (yours). There are no env, SQL or migration changes. Revert: `git revert -m 1 ed77b2f`.

**§0 check: consistent.** One plain line tells people what a tap does. It's fewer buttons, not more. Nothing new is sent or stored.

## Session 31 — More like this: standalone lines, Compare to [Title] unchecked — 2026-10-31 — branch auto/s31-mlt-compare

**Brief (Brad, in chat):** More like this picks stay seeded on the tapped title. Each card's line stands alone (no "Same…, but…", "Trades X for Y" or "instead of…"). A "Compare to [Title] ☐" row starts unchecked. Checking it adds "vs. [Title]:" lines with no re-ranking; unchecking removes them; "+" works as now. The choice holds until the category changes or a new search starts. Wine follows the same rule. Change only the prompt instruction that made the lines comparative.

### SHIPPED
**#110 → 6f35b26**
- **Prompts:** Movies/TV chooser: `STANDALONE_CHOOSER_PROMPT` (six lines swapped) used only when `/api/anchor` reks gets `mlt: true`. `CHOOSER_PROMPT` is unchanged for every other path. Search-lane engine: `placeAgainstSeed` gates the line-writing branches, so Movies/TV/Books seeded sets get the no-seed sentence rules plus the pick line and the seed's name. Wine's seeded verdict grammar is untouched (§2.3).
- **Guarantee:** `src/lib/standaloneLine.ts` catches comparative phrasing or the seed's name. The chooser falls back to the synopsis's first sentence; the search lane drops the sentence (and the card if nothing is left). Both log.
- **Row:** `MltCompare.tsx` (`useMltCompare`), shared by ResultsV4 and RekSnapResults. `CompareHeader` gains `pendingName`. Lines come from the existing `/api/slots` lines action. Stored Compare to refs don't steer or line a More like this set. The choice clears on a new search, a snap, home, or a category change.
- **Wine:** More like this starts with no reference (blue dots only). Checking it shows the server's vs. lines and the orange rings, with no re-run. A typed bottle still auto-compares (S26b).
- **Not changed:** the snap-lane chain ("+ More like this" under a snapped or typed title). Its lines are the locked snap voice.

### TESTS
- New `validate-s31`: 26/26. 53 suites, tsc, lint and build pass.
- New `pw-s31-mlt`: 32/32 locally and on the preview. On the preview, `pw-s26b-shelf` 42/42, `pw-s26a-home` 41/41, `pw-s29-home-square` 53/53 and `pw-s30-list-hints` 35/35.
- Live model check: Movies More like this lines came back standalone with no fallback. One seeded Books set had the guard remove a comparing sentence.

### PHONE CHECKLIST (after promotion)
1. Favorites → tap a movie. The results show "Compare to [Title]" unchecked, and the lines don't mention or compare to it.
2. Check it. Each card gains "vs. [Title]:" (or "vs. your [Title]:" if starred), and the picks don't change. Uncheck it and the lines go away.
3. Tap "+" and the Compare to sheet opens as before.
4. Card "+ More like this" (search results) shows the row naming that card.
5. Start a new typed search or change the category, and the row is gone.
6. Wine: Bought → More. You see blue dots only and an unchecked row. Check it and the lines and orange rings appear.

### PROMOTION
Promote `main → release/v2` (yours). There are no env, SQL or migration changes. Revert: `git revert -m 1 6f35b26`.

**§0 check: consistent.** Picks still follow what the person loved. Comparison is now their choice, not imposed. Nothing new is stored or sent.

## Session 32 — Snap-lane "+ More like this": standalone lines, Compare to [Title] unchecked — 2026-10-31 — branch auto/s32-snap-chain-mlt

**Brief (Brad, in chat; S31 call 1 approved):** "+ More like this" on a card under a snapped or typed title follows the same rule: standalone lines, Compare to [Title] unchecked. Change only the instruction that makes those lines comparative; leave the rest of the snap voice as it is.

### SHIPPED
**#112 → 77358a0**
- **Prompt:** `/api/reksnap` chain steer with `standalone`, for a Movies/TV/Books pursuit only. It drops the referent override and swaps the MEDIA clause's sentence 3 (placement against the anchor → the title's own register) plus its two examples. The rest of DIFFERENTIATOR_VOICE and the chain prompt is byte-identical. Wine, consumables, products and uses-mode chains are unchanged.
- **Backstop:** sentences that compare or name either title are removed, and a card with nothing left doesn't ship. `standaloneLine.ts` also now catches "further … than" and "than the source/original…" (from a live leak), which tightens S31 too.
- **Client:** the chained card becomes the Compare to seed once its set lands. An anchor re-roll or a new snap ends it, a second chain names the new card unchecked, and the seed never gets a line against itself.

### TESTS
- New `validate-s32`: 26/26. 54 suites, tsc, lint and build pass.
- New `pw-s32-snap-chain`: 19/19 locally and on the preview. Also on the preview: S31 32/32, S26b 42/42, S26a 41/41, S29 53/53, S30 35/35.
- **Live (Heat, 3 chains):**
  - The first prompt version made 13/15 third sentences open "It plays as…", copying its example. I removed the example and the next run varied.
  - All lines were standalone after the guard. It removed one "trades" sentence; one "further … than the source" slipped through and is now caught.
  - One chain returned 502: the model's JSON didn't parse. That is the existing failure path, and the user sees the existing failure line.

### PHONE CHECKLIST (after promotion)
1. Type a movie (e.g. Heat) and tap "+ More like this" on a card. The new five carry no comparison, and "Compare to [that card]" shows unchecked.
2. Check it. Each card gets "vs. [card]:" and the picks don't change. Uncheck it and the lines go.
3. Chain again. The row names the new card, unchecked.
4. Wine or a scotch snap: "+ More like this" on a card behaves as before.

### PROMOTION
Promote `main → release/v2` (yours). There are no env, SQL or migration changes. Revert: `git revert -m 1 77358a0`.

**§0 check: consistent.** Picks still follow the direction the person chose, and comparing is opt-in. Nothing new is stored or sent.

## Session 33 — Title re-roll standalone + silent retry on an unparsed chain reply — 2026-10-31 — branch auto/s33-reroll-retry

**Brief (Brad, in chat; S32 call 1 approved):** the re-roll ("+ More like this" on the snapped or typed title itself) follows the standalone rule for Movies, TV and Books. Change only the instruction that makes those lines comparative, and leave wine and other products as they are. When the model's reply fails to parse, retry once silently before showing the failure line, and log both attempts.

### SHIPPED
**#114 → 8afdd4a**
- **Re-roll:** `buildStandaloneChainRerollPrompt` applies S32's MEDIA sentence-3 swap and nothing else (the re-roll has no referent override). It runs only with `standalone`, outside uses-mode, for a Movies/TV/Books anchor. Wine, other products, uses-mode and unflagged calls are byte-identical. The guarantee strips sentences that compare or name the title. The client makes the title the Compare to seed (with its TMDb id), so "Compare to [Title]" shows unchecked.
- **Retry:** `handleChain` (steer and re-roll, every category) makes up to 2 attempts when JSON.parse fails.
  - Attempt 1 logs a warn (`[chain] parse failed — retrying`), with chars, finish reason and the error.
  - A success on the retry logs an info line.
  - Attempt 2 logs an error (`… giving up`), then the existing 502 and failure line.
  - The wine branch and the vision call are not covered.

### TESTS
- New `validate-s33`: 31/31. `validate-s32` was updated for the re-roll seed. 55 suites, tsc, lint and build pass.
- New `pw-s33-reroll`: 9/9 locally and on the preview. Also on the preview: S32 19/19, S31 32/32, S26b 42/42, S26a 41/41, S29 53/53, S30 35/35.
- Live: three standalone re-rolls on Heat gave 15/15 standalone lines, with no guard hits and no parse failures.

### PHONE CHECKLIST (after promotion)
1. Star a movie, type it, then tap "+ More like this" on the title. The new five carry no comparison, and "Compare to [Title]" shows unchecked.
2. Check it. Each card gets "vs. your [Title]:" and the picks don't change. Uncheck it and the lines go.
3. On a wine bottle, tap "+ More like this" on the title. It behaves as before.

### PROMOTION
Promote `main → release/v2` (yours). There are no env, SQL or migration changes. Revert: `git revert -m 1 8afdd4a`.

**§0 check: consistent.** Comparing is opt-in on every More like this, and a parse miss is retried instead of shown. Nothing new is stored or sent.

## Session 34 — Silent retry on an unparsed reply: wine picks, shelf read, first photo read — 2026-10-31 — branch auto/s34-retry-wine-vision

**Brief (Brad, in chat; S33 call 1 approved):** extend the silent one-time retry to wine's re-roll and card chain, and to the first read of a photo (shelf, bottle, poster, TV). Log the same way.

### SHIPPED
**#116 → 48f8109**
- **Helper:** `src/lib/parseRetry.ts` (`parseWithRetry`) is used at every site.
  - Attempt 1 logs a warn `[tag] parse failed — retrying`.
  - A success on attempt 2 logs an info `[tag] parse retry succeeded`.
  - A miss on attempt 2 logs an error `[tag] parse failed — giving up`.
  - Each line carries attempt, of, chars, finishReason and the error. Only parse misses retry.
- **Tags:**
  - `chain` (S33, moved onto the helper; same lines).
  - `wine`: every `generateWineReks` caller, which covers the card chain, re-roll, first set, price chip and replacement.
  - `wine-shelf`: the shelf read. A second miss falls into the existing fail-soft.
  - `snap-read`: the first read of a whole photo, strips or a typed bottle. The re-read is not streamed and uses the same input and prompt. A second miss gives the existing `[snap-read-fail]` and failure line.
- A re-read poster or TV screen still takes the TMDb path.
- `validate-s8a/s10/s13a` were updated for the re-read: there is now a fourth `SYSTEM_PROMPT` call, and the refusal fixtures refuse twice.

### TESTS
- New `validate-s34`: 28/28. 56 suites, tsc, lint and build pass.
- On the preview: S33 9/9, S32 19/19, S31 32/32, S26b 42/42, S26a 41/41, S29 53/53, S30 35/35.
- Live: a typed wine and a wine re-roll each made one call and logged no retries.

### NOT COVERED
Backfill (one replacement card), Show details, the typed-wine classifier and the search lane's /api/openai still fail on one bad reply.

### PROMOTION
Promote `main → release/v2` (yours). There are no env, SQL or migration changes. Revert: `git revert -m 1 48f8109`.

**§0 check: consistent.** A bad model reply is retried instead of shown, so there are fewer dead ends. Nothing new is stored or sent.

## Session 35 — Silent retry on the last four calls; end of build round — 2026-10-31 — branch auto/s35-retry-rest

**Brief (Brad, in chat; S34 call 1 approved):** extend the shared retry to the non-wine thumbs-down replacement, Show details, the typed-wine check and the search lane's picks. Merge when green. This ends the build round.

### SHIPPED
**#119 → 92aca22**
- **New tags** on `parseWithRetry`, with the same three log lines as S34:
  - `backfill` (with mode): a second miss is `Backfill failed` 502, as before.
  - `detail` (Show details): a second miss is `Detail failed` 502, as before.
  - `typed-wine`: a second miss logs the old non-JSON line, and the search runs as before.
  - `search` (`/api/openai` prompt mode): it retries only when the engine's own reader finds no array. `extractJsonArray` moved verbatim to `src/lib/jsonArray.ts` and is shared by the engine and the route. A second miss returns the last reply unchanged, so the engine fails as before.
- No wording, prompt, env or SQL changes.
- Every model reply the snap route parses now goes through the helper.
- `/api/openai`'s legacy `pick_from_candidates` mode has no caller and was left alone.

### TESTS
- New `validate-s35`: 26/26. `validate-s31` now accepts the verbatim move. 57 suites, tsc, lint and build pass; the build warning is the existing Supabase one.
- On the preview: S26a 41/41, S26b 42/42, S28c 154/154, S29 53/53, S30 35/35, S31 32/32, S32 19/19, S33 9/9.
- Live on the preview, one real call each: all returned 200.
  - backfill (seeded from a typed Whispering Angel anchor)
  - Show details
  - the typed-wine check (a named bottle → anchor; a mood → search)
  - search (5 items)

### NOTES
- A failed search-lane backfill now takes up to two model calls inside the client's 90s abort. Watch for aborts in the field.

### PROMOTION
Promote `main → release/v2` (yours). There are no env, SQL or migration changes. Revert: `git revert -m 1 92aca22`.

**§0 check: consistent.** A bad model reply is retried instead of shown, on every lane. Nothing new is stored or sent.

## Session 36 — Recent remembers your searches; typed/spoken title follows S31 — 2026-11-01 — branch auto/s36-recent-searches — PR #123

**Brief (Brad, in chat):** commit the charter's new §2.14 on its own branch and merge it, then build `docs/S35_RECENT_SEARCHES.md` (the spec's own name; logged as Session 36 because Session 35 was the retry round), following §2.14. Merge when green.

### SHIPPED
**#122 → 9ec142c:** charter §2.14 "One compare control, the same everywhere" (Brad's text, approved in chat; §11.6).

**#123 → 5d740b6**
- **Recent entries:** `src/lib/recentSearches.ts` keeps them in localStorage (`rekomendr.recent_searches`), on this device only, with no network call. Newest first, 50 max. Labels:
  - voice and typed: “words”
  - chips: `Comedy · Feel-good` (a vibe tapped right after its genre refines the same entry)
  - snap: `Snapped: [name]` (a snapped screen uses its service)
  - More like this: `More like [Title]` (a tapped list title or go-to, a card's MLT in either lane; re-rolls are not recorded)
  - Compare to re-runs and health sets are never entries.
- **Reopen:** an entry comes back from storage. No search, model or facts request is made, and the voice set isn't re-sent.
- **Recent tab:**
  - Searches and opened titles are merged newest first.
  - Each search shows its icon, label, time, and five posters (names for wine, books and other snaps).
  - A pick opens its card. An opened pick gets a blue dot.
  - Clear recent clears both lists. The hint line is unchanged.
- **§2.14 rule:**
  - A typed title's five use S31's standalone chooser (`mlt: true`) under an unchecked "Compare to [Title]".
  - A title named in a mood keeps its ranking request but sends `lines: false`: the slots route skips the writer and the cards keep their TMDb synopses.
  - Refs chosen in Compare to keep their lines. Wine is unchanged.
  - No prompt text changed.

### TESTS
- New `validate-s36-recent`: 50/50. 58 suites, tsc, lint and build pass.
- `validate-s12a/s15-screen/s16b/s19a/s25` had literal-text checks updated to the reshaped code (the behavior they guard is unchanged).
- **Note:** I wrote the new suite as `validate-s36.cjs` at first, which overwrote S3.6's suite of that name. It was restored from main before any commit (59/59) and the new suite was renamed.
- On the preview:
  - `pw-s36-recent` 37/37
  - S31 32/32, S32 19/19, S33 9/9: their "typed title has no row" checks were updated to the §2.14 rule
  - S30 35/35, S29 53/53, S28c 154/154, S26a 41/41, S26b 42/42
- Live: a steered `/api/slots` with `lines:false` returned five cards with `vsGoTo: null` and their synopses.

### FOUND, NOT FIXED
- Snap-lane card opens don't note a Recent title, so those picks never get a dot.
- A reopened snap-lane Movies/TV set makes the existing `/api/saved` marks read (useServerMarks). It isn't a search or model request.
- Stored Compare to refs still apply automatically to new chips/voice searches (pre-§2.14).

### PROMOTION
Promote `main → release/v2` (yours). There are no env, SQL or migration changes. Revert: `git revert -m 1 5d740b6` (and `9ec142c` for the charter).

**§0 check: consistent.** The person keeps their own path, on their own device only. Nothing new is sent, and picks are still chosen on fit first.

## Session 37 — Compare to defaults: wine ☑ with standalone lines, new searches start off, snap-lane opens in Recent — 2026-11-01 — branch auto/s37-compare-defaults — PR #125

**Brief (Brad, in chat):** S36 follow-ups under §2.14. Build the skipped wine part of `docs/S35_RECENT_SEARCHES.md` (approved: change only the instruction that makes wine description lines comparative); a new search starts with Compare to off; snap-lane card opens land in Recent with the dot. The four S36 wording and layout calls are approved as built. Merge when green.

### SHIPPED
**#125 → 182927e**
- **Wine, a typed or snapped single bottle:** "Compare to [Bottle] ☑", already checked.
  - Descriptions stand alone. The wine engine (its one call site) gets `STANDALONE_WINE_VOICE`: the snap voice with only the comparative instruction swapped (sentence-1 placement, the CONSUMABLE placement and verdict beats, their RIGHT/WRONG pairs). A swap that stops matching throws. `vs_favorite` is untouched.
  - Wine More like this lost its "descriptions compare against" override; the direction still steers.
  - Backstop: `dropComparingWineSentences` (standaloneLine.ts) on the engine and the vision fallback; a pick with nothing left is dropped and logged.
  - Unchecking hides the vs. lines and rings; checking again shows them with no request (unchecked re-runs still write the bottle's lines, hidden).
- **The shared header's checked state:** a named reference alone reads "Compare to [Name] ☑" with "+", on wine and on every S31 More like this row (was a "vs. [Name] ×" chip).
- **New searches start off:** chips, voice, typed, snap and More like this clear the stored Compare to set; Compare to and steer re-runs keep it. The sheet's lists are untouched. Recent stores the refs a set was shown with; reopening restores them, or strips stale lines.
- **Snap lane:** Show details on the anchor, a frontier or a trail card notes it in Recent (device-only), so the entry's pick gets its dot.

### TESTS
- New `validate-s37` 58/58 (real route, stubbed model). All suites, tsc, lint and build pass.
- `validate-s21`'s mock line no longer opens on "Similar…" (the wine fallback now drops it); `validate-s26b/s32` literal checks updated.
- On the preview: S26b 45/45, S31 36/36, S32 20/20, S33 10/10, S36 40/40 (updated to ☑, plus re-check-with-no-call, stored-set-cleared and snap-lane-dot checks); S26a 41/41, S28c 154/154, S29 53/53, S30 35/35.
- Live, real model: "Josh Cellars Cabernet Sauvignon" and "La Marca Prosecco" typed — standalone descriptions, five vs. lines, rings; uncheck/re-check made no request.

### FOUND, NOT FIXED
- A live description can still carry a referent-free comparative mid-sentence ("the bubbles are bigger and firmer"); the backstop catches openers and "than", not these.
- Recent's titles list covers Movies, TV, Books and Wine only, so a whiskey or other snap pick never gets a dot (unchanged from S36).
- Reopening a wine snap entry starts checked again, even if it was unchecked when left.

### PROMOTION
Promote `main → release/v2` (yours). No env, SQL or migration changes. Revert: `git revert -m 1 182927e`.

**§0 check: consistent.** The person meets each pick on its own terms first, comparison only where they're holding the reference, and nothing new leaves the device.

## Session 38 — Housekeeping: charter truth-up, lighter log, CURRENT_STATE.md, test-row report — 2026-11-10 — branch auto/s38-housekeeping — PR #128

**Brief:** `docs/2026-11-10_housekeeping_launch.md` (Build 1 of `docs/ACTION_PLAN_nov10.md`). Brad approved the §1 charter edits word for word (§11.6) and said merge when green. Docs only; nothing in `src/` or `app/` changed.

### SHIPPED
**#128 → 13f4cdc**
- **Charter:** §2.10 replaced (Claude per step by env var; `/api/health` is the truth; OpenAI moderation only). §2.3 gets the single-instruction exception. The exception sentence is added to §3.9, §10.4 and §11.6. New §3.13 Names and §3.14 Current state. There are no other charter changes.
- **Session log:** Sessions 0–25 moved unchanged to `docs/archive/SESSION_LOG_through_S25.md`, with one pointer line. 455 + 3,145 = 3,600 lines = the original 3,599 + the pointer.
- **`docs/CURRENT_STATE.md`:** the one-page present. Next free session number: 39.
- The launch doc and the Nov 10 action plan are now committed.

### TESTS
- New `validate-s38-housekeeping`: 25/25. It checks the charter equals main @0dea5fa plus exactly the six approved edits, byte for byte, and that the log split loses nothing.
- All 60 suites, tsc, lint and build pass. Vercel preview is green.

### PRODUCTION VS MAIN
`origin/release/v2` (f6a42f8, PR #127, 2026-11-01) contains all of `origin/main` up to 0dea5fa. Sessions 36 and 37 are live. Only S38's docs are waiting, and they don't need promotion.

### TEST-ROW REPORT (read-only transaction; nothing deleted)
The database is shared by previews and production. Real clients are `anon_<uuid>` (137 ids, 1,832 rows) or the old `anon_<base36>_<rand>` form (4 ids, 466 rows).

| table | `anon_agent_` rows (ids) | other test prefixes |
|---|---|---|
| api_usage | 1,884 (571) | `s27test-` 291 (123 ids), `anon_s3N-live`/`anon_s3N_live` 35 (7), `anon_test_` 6 (2) |
| goto_events | 475 (198) | — |
| voice_moods | 255 (31) | — |
| voice_events | 252 (27) | — |
| go_tos | 136 (56) | — |
| user_likes | 54 (25) | — |
| reksnap_signals | 30 (14) | — |
| wine_marks | 29 (10) | — |
| card_events | 22 (6) | — |
| anchor_snapshots | 13 (9) | — |
| client_profiles | 2 (2) | — |
| account_devices | 0 | — |

Total: 3,152 `anon_agent_` rows + 332 other test rows = 3,484.

- **Shared cards (§2.13):** 10 of the 13 agent `anchor_snapshots` were shared, and all 10 are revoked (0 links still open). Deleting them still deletes shared cards, so it needs Brad's explicit approval under §2.13.
- **Links:** `card_events.card_id` references `anchor_snapshots`, with no cascade. All 18 events on agent cards are agent events, so no real person's open would be lost. 2 agent events sit on real people's cards, and deleting them corrects those cards' open counts. `voice_events` cascade from `voice_moods`, and no real rows reference agent moods.
- **`/api/stats` excludes only `anon_agent*`.** The 332 `s27test-`/`anon_s3N-live`/`anon_test_` api_usage rows are counted as real people today.
- **Not separable:** earlier fresh Playwright clients (S2 chain, 2026-10-11) used real-format `anon_<uuid>` ids, so they look like real phones.

Proposed DELETEs (Brad's call, §11.7; take a `pg_dump` first per §11.2):
```sql
begin;
delete from card_events      where client_id like 'anon\_agent\_%';            -- 22
delete from anchor_snapshots where client_id like 'anon\_agent\_%';            -- 13 (10 shared, all revoked) — §2.13 approval
delete from voice_events     where client_id like 'anon\_agent\_%';            -- 252
delete from voice_moods      where client_id like 'anon\_agent\_%';            -- 255
delete from goto_events      where client_id like 'anon\_agent\_%';            -- 475
delete from go_tos           where client_id like 'anon\_agent\_%';            -- 136
delete from user_likes       where client_id like 'anon\_agent\_%';            -- 54
delete from reksnap_signals  where client_id like 'anon\_agent\_%';            -- 30
delete from wine_marks       where client_id like 'anon\_agent\_%';            -- 29
delete from client_profiles  where client_id like 'anon\_agent\_%';            -- 2
delete from api_usage        where client_id like 'anon\_agent\_%'
                                or client_id like 's27test-%'
                                or client_id like 'anon\_test\_%'
                                or client_id ~ '^anon_s3[0-9]+[-_]live';        -- 1,884 + 332
-- check the counts above match, then:
commit;
```
From now on every test client id starts with `anon_agent_` (in CURRENT_STATE.md).

### CHARTER STILL OUT OF STEP (listed, not changed)
- §2.8 still says sessions never push to main and "Brad merges". §4 says "Brad merges" too. In practice sessions self-merge under §10.3/§11.4.
- §10.4 still bars self-merging any §2 change. This session merged one on Brad's explicit instruction.
- §2.10 says OpenAI is moderation only. But `src/lib/llm.ts` falls back to OpenAI for generation when `ANTHROPIC_API_KEY` is missing, and `REKS_MODEL_PROVIDER=openai` is the rollback (Build 5).
- The header ("Phase: September 2026"), §0 "How to use" ("one session from §6"), §6 sequence, §7 calls and §9 definition of done describe the September plan. Sessions now come from launch docs.
- §3.10's stale-bundle rule and the `[prompt-diag]` markers (`hasSimulationClose`…) refer to the 4o-mini search prompt era.
- §8's log format (`SHIPPED:` lines) no longer matches the `### SHIPPED` sections sessions actually write.
- §3.3's "the spec" list names July–September blueprints, most of them built or superseded.

### BRAD MUST
- Decide on the test-row DELETEs above. Deleting the 13 agent cards needs your §2.13 approval. They can also be left in place and the other deletes run.

**§0 check: consistent.** No user-facing change. Nothing new is stored or sent. The test-row report keeps stats honest, which serves "measure, don't estimate."

## Session 39 — Test-row cleanup (approved, NOT run) + charter part 2 — 2026-11-10 — branch auto/s39-cleanup-charter2
**Brief:** `docs/2026-11-10_test_row_cleanup_and_charter_part2.md`. Brad approved §A (the eleven Session 38 DELETEs, including the 13 agent cards under §2.13) and the §B charter edits word for word. Merge when green. No app change.

### SHIPPED
- **Charter (§B):** §2.8 reworded, §4's "Brad merges." sentence, the §10.4 exception for Brad-approved §2 wording, and the "How sessions run now" note above §0. There are no other changes.
- **CURRENT_STATE.md (§C):** the real-device overcount line, the `llm.ts` OpenAI fallback open item, and the cleanup marked approved but not run. Next free session number: 40.
- **`docs/sql/2026-11-10_s39-delete-test-rows.sql`:** the eleven approved DELETEs in order, in one transaction. Each is checked against its re-count; any mismatch raises, and nothing commits.

### TEST-ROW CLEANUP — steps 1–3 done, step 4 BLOCKED
1. **Backup:** `backups/2026-11-10-1221-s39.sql`, 996,529 bytes, with data for all 12 public tables (`COPY public.*`).
2. **Re-count (read-only), identical to Session 38:**
   - card_events 22, anchor_snapshots 13, voice_events 252, voice_moods 255
   - goto_events 475, go_tos 136, user_likes 54, reksnap_signals 30, wine_marks 29, client_profiles 2
   - api_usage 2,216 (1,884 agent + 332 other test ids)
   - No tests have run since S38.
3. **Real ids are safe:**
   - 0 real-format ids match any pattern (137 uuid ids / 1,832 rows; 4 old ids / 466 rows).
   - The `voice_moods` cascade would take 0 non-agent rows.
   - 0 non-agent events sit on agent cards.
4. **The DELETE was not run.** The session's permission check (auto mode) blocked the command. Nothing was deleted; the database is as it was.

### BRAD MUST
- Run the cleanup yourself, or allow the session to run it. It checks every count and rolls back on any mismatch:
  `! bash -c 'cd "F:/Rekomendr/Rekomendr-App" && "/c/Program Files/PostgreSQL/17/bin/psql" "$(grep -E "^SUPABASE_DB_URL=" .env.local | cut -d= -f2- | tr -d "\"\r")" -X -f docs/sql/2026-11-10_s39-delete-test-rows.sql'`
- After that, the next session does the readback (§A steps 5–6) and removes the open item from CURRENT_STATE.md.

### TESTS
- New `validate-s39-charter2`: 8/8. The charter equals main @aac610e plus exactly the four B edits, byte for byte.
- All 61 suites, tsc, lint and build pass.

**§0 check: consistent.** No user-facing change, and nothing new is stored or sent.

## Session 39b — Test-row cleanup run + readback — 2026-11-10 — branch auto/s39b-cleanup-done
**Brad ran** `bash scripts/run-s39-delete.sh` (`docs/sql/2026-11-10_s39-delete-test-rows.sql`) himself, after the session's permission check blocked it. It ran as one transaction, every count matched its re-count, and it ended in `COMMIT`.

### DELETED (per table)
- api_usage 2,216 · goto_events 475 · voice_moods 255 · voice_events 252
- go_tos 136 · user_likes 54 · reksnap_signals 30 · wine_marks 29
- card_events 22 · anchor_snapshots 13 (the agent test cards, approved under §2.13) · client_profiles 2
- **Total: 3,484.** Backup: `backups/2026-11-10-1221-s39.sql`.

### READBACK (read-only)
- 0 rows left matching any test pattern.
- Real clients are unchanged: 137 uuid ids / 1,832 rows, and 4 old-format ids / 466 rows. No ids of any other shape remain.

### PRODUCTION CHECKS
- **Save, saved list and remove:** all OK on www.rekomendr.ai (`/api/signals` → `/api/saved` → `/api/signals/undo` removed 1), using client `anon_agent_s39check_1794333095`. Its `api_usage` row is agent-tagged and excluded.
- **Share link:** a real shared card (`/a/7da27455-…`) returned 200.
- **`/api/stats` on Production:** 404 with the `.env.local` key. Production's `STATS_KEY` is Brad's and evidently differs; the route answers 404 for any wrong key.
- **`/api/stats` on the main preview** (same database): 200. The readout loads, and `&agents=1` is all zeros.

### BRAD MUST
- Open `https://www.rekomendr.ai/api/stats?key=<your Production STATS_KEY>` once to confirm the Production readout.

`scripts/run-s39-delete.sh` is committed alongside, as the record of what was run.

**§0 check: consistent.** The numbers are more honest now, and no real person's data or links were touched.

## Session 40 — Measure: THE TEST, quality and use counters; "Did you watch one of these?" — 2026-11-10 — branch auto/s40-measure — PR #132
**Brief:** `docs/2026-11-10_measure_launch.md` (Build 2). Brad approved the one new Compare to event and the wording "Did you watch one of these?" / "Not yet". Merge when green.

### SHIPPED
- **Stats page:** three new blocks (THE TEST from 10-16; Quality and Use from 11-10). Each is by week (Monday, New York), newest first, for everyone and outside the house. Every existing number stays. "Voice: cards ignored" is now "Voice: cards with no tap", and "ignored (%)" is now "no tap (%)". The Session 38 overcount note is on the page.
- **Server counters** (`src/lib/measure.ts`):
  - parse retries and retry failures, inside `parseWithRetry`;
  - 5xx answers from openai, slots, anchor, mood, screen and reksnap;
  - backfills that land after the 90 s client abort ("gave up", a proxy).
- **Client counts** (`/api/signals` kind `measure`, `src/lib/measureRow.ts` allow-lists):
  - `search` (origin, category, lane, picks, ms) — **flagged for Brad's approval in the PR**;
  - `compare_on` (category);
  - `nudge_asked`, `nudge_poster`, `nudge_not_yet` (no device stored).
- **Home:** "Did you watch one of these?"
  - When: the newest Movies/TV search in Recent is 3 h to 7 days old and none of its picks is marked Watched.
  - Shows: up to five posters plus "Not yet", in the nudge line's space.
  - A poster tap writes the usual Watched mark, with Undo. It asks once per search, ever. It skips when posters are hidden.

### MIGRATION — BLOCKED, Brad runs it
- Backup taken: **`backups/2026-11-10-1921-s40.sql`** (647,228 bytes, dump-complete footer, 50 tables).
- The permission check blocked the DDL, as in S39. Nothing was created.
- **BRAD MUST:** `! bash scripts/run-s40-measure.sh` (Blocks 1→4 of `docs/sql/2026-11-10_s40-measure.sql`; Block 1 stops it if either table exists). Then check the output against the EXPECTED lines. Block 2b seeds the house list.
- The house seed is the two most active real devices since 10-16:
  - `anon_89c…`: 407 events, 272 searches/snaps, 6 cards sent, 50 home-screen launches, last 11-11 UTC;
  - `anon_3f5…`: 58 events, 37 searches/snaps, 7 home-screen launches, last 11-01.
- Over all time, `anon_4fe…` is second (190 rows, almost all likes since June; 10 rows since 10-16). Brad confirms which are his and Katrina's.

### FIRST REAL READOUT (preview, same database, Block 1 only)
- Cards shared: week of 10-12 **3**, 10-19 **1**, 10-26 **2**, 11-02 **0**, 11-09 **0** (total 6).
- Shared cards opened by another device: 10-12 **3**, 10-19 **1**, others 0 (total 4).
- Receiving devices (first event is someone else's card): **3**, all in the week of 10-12. Receivers who made their own: **0** (0%).
- Outside the house: not shown until `house_devices` exists.
- Voice: cards with no tap **57**, no tap **93.4%**.

### TESTS
- `validate-s40` 85/85; `pw-s40-watch-ask` 25/25 (three runs); `pw-s29-home-square` 53/53.
- All 62 validator suites (with `npx-shim` on Windows), tsc, lint and build pass.
- Preview: a wrong or missing key gets 404; the right key gets 200.
- s16b, s24a and s25 got a pass-through `measure` stub.

**§0 check: consistent.** Counts only: no titles, words, photos or names. Server and nudge rows can't hold a device id. The ask appears once per search, takes one tap, can be waved off, and exists to learn what the person chose.
