# S25 — Home fits one screen, Go button, wine shelf Compare to

Written Oct 30, 2026 (Claude, with Brad). Builds on S22/S24 (Compare to, top bar, Say it / Snap it).
Design reference: Brad's Design canvas "Rekomendr screen lane options", row F/W: boards F1Home, W1Shelf, W2Sheet, W3Compared. The written spec below is complete on its own.

## Why
Field test Oct 30:
- **Movies win:** Katrina got to The Intouchables in two taps, and they loved it. Don't disturb the movie results flow.
- **Wine got clunky:**
  - A stored shelf shot showed a long pile of bottle "bubbles" while it read the shelf.
  - Compare to was on by default against Brad's only favorite (a sweet Riesling), so every "vs." line on a Sauvignon Blanc shelf was noise.
  - The shelf summary card carries rek buttons (star, save, thumbs) that crush its title into five lines.
- **Home scrolls** although there is nothing below the fold. There is a stray blue bar with a dot under the chip row, and a lot of empty space around a centered logo.
- **No Go button after speaking:** you wait, not knowing whether to tap anything.

The rule this serves (§0): from indecision to a satisfying choice with as little effort as possible. The comparison a person sees must be one they chose, and it must name its reference.

## Standing rules (unchanged)
- The agent may self-merge to main when green. **Never** push or merge to release/v2, deploy --prod, or set Production env vars. Brad promotes.
- Back up before any migration. Never disable RLS or deployment protection.
- VOICE: wording changes wait for Brad's OK. **Pre-approved for this session:** the exact strings quoted in this doc. Anything else new goes in the report as "your call".
- Never send Brad's email or other personal info to outside services, headers included.
- Only Brad changes §0.

## Items

### 1. Home header (all categories) — board F1
- **Row 1:** "Rekomendr.AI" logo left-aligned, ⋯ button on the right (screen-reader label "More options"). The large centered logo goes away.
- **Row 2:** the four list buttons (★ Favorites · ✓ Watched · ↺ Recent · 🔖 Saved), each with its count, as outlined tiles with colored icons:
  - Favorites: amber
  - Watched: green
  - Recent: light gray
  - Saved: light blue
- **Row 3:** the search bar (category picker + input + mic + camera, as now).
- **Row 4:** the chip row.
- **Below:** the Say it / Snap it pair, unchanged (the two separate split buttons we have now), then "powered by Reks Ray™".

### 2. Home fits one screen
- On an iPhone-size viewport (390×844 and 375×667), the home screen must not scroll.
- Find and remove the stray blue bar and dot under the chip row. It looks like a horizontal scroll indicator, or an overflow element, rendering in the page. The chip row still scrolls sideways, but with no visible bar.
- Add a Playwright check: on home, document scroll height ≤ viewport height, for Movies, TV, Books and Wine.

### 3. Go button
- Go appears inside the search bar, right side, the moment the box has any text, whether typed or filled by speech. It's hidden when the box is empty.
- Tapping Go runs the search. Enter on the keyboard still works.
- During voice input, the words stream into the box and Go is tappable right away. Tapping it stops listening and runs the search.
- Keep the existing auto-run after silence if there is one, but Go must never wait for it.

### 4. Wine: Compare to is off by default
- Wine never auto-picks a reference from Favorites (or anywhere else).
- **Exception: a single-bottle snap.** The snapped bottle becomes the reference automatically (top card plus "vs." lines), with × to undo, as before.
- When nothing is compared, the taste bars show only this wine's blue dot. No orange ring and no "your X" legend line.

### 5. Wine shelf snap: no bubbles, anchor card on top — board W1
- **Remove the progressive list of bottle pills** while a shelf is being read. Show one quiet status line in its place: "Reading the shelf…". When the count is known, it becomes "Reading the shelf… 14 bottles found".
- **The top card is the shelf anchor.** It's the most popular, most central bottle the read found; the model picks it, and the pick is logged in the result so we can tune it. Its parts:
  - Small label: "This shelf · most popular"
  - Bottle name and price
  - One short line about the shelf (keep today's shelf summary text, shortened)
  - Taste bars (blue dot only)
  - **No star, save or thumb buttons on this card.**
- Below the anchor: the "Your 5 from this shelf" row with "Compare to ☐" (same component as movies), then the five rek cards as today.
- **Keep every bottle read from the shelf** (name, price if read, taste estimate) in the results state for this session, so item 6 can list them. Store it on the device only, same as Recent; never send it anywhere new.

### 6. "This shelf" tab in Compare to — board W2
- When the current wine results came from a shelf snap, the Compare to sheet gets a first tab: "This shelf N" (N = bottles read). The tab is selected by default.
- It lists every bottle read, name plus price, in shelf order (or by price if order isn't known), with the same check circles as the other tabs.
- Helper line under the tabs: "Every bottle we read in your shelf photo. Pick one you know."
- The Favorites, Recent and Saved tabs stay as they are. Without a shelf snap, there's no This shelf tab.

### 7. Picking a shelf bottle — board W3
- **The picked bottle replaces the anchor card at the top.** Its parts:
  - Label "Comparing to · from this shelf"
  - Amber outline (the same amber as the reference ring on the taste bars)
  - A × in the corner to stop comparing
- The "vs. [Short name] ×" chip and "+" appear in the row, exactly like movies.
- **Each of the five picks gets:**
  - a "vs. [Short name]:" line (wine vs. lines as today, but against the picked bottle)
  - the orange reference ring on its taste bars, placed at the picked bottle's position
- **The five may re-rank** toward the picked bottle, same as the movie behavior.
- **× (on the card or on the chip)** returns to the item 5 state: the most-popular anchor card comes back, and the vs. lines and orange rings are removed. The bottle stays in the This shelf list.
- **Up to 3 references**, same as movies. The top card shows the first one.
- **New shelf snap or category change:** clears the references and replaces the shelf list.

### 8. Carry-overs from S24 (skip any already merged)
- Books vs. line in the same format as movies.
- "Movie" / "TV" / "Book" labels in the sheet.
- Remove the rotating snap tips under Say it / Snap it.

## Out of scope
- The movie results flow, apart from the header and the Go button.
- Per-card compare (still parked).
- Restaurant wine-list mode.

## Acceptance
- All existing test scripts pass, plus the TypeScript check and the production build.
- New Playwright checks at 390×844:
  - Home has no scroll in any category.
  - Go appears on typing and disappears when the box is cleared.
  - Shelf snap (use a stored shelf fixture) shows no pill list, shows the anchor card without action buttons, and Compare to is unchecked.
  - The This shelf tab lists the fixture's bottles.
  - Picking one swaps the anchor card, adds vs. lines and orange rings, and × restores the start state.
  - A single-bottle snap auto-references.
- Report: merge SHAs, any wording not pre-approved (as "your call"), and revert commands.

## Phone checklist for Brad (after promotion)
1. Home: logo top-left, ⋯ top-right, four colored list tiles, then search. No scrolling, and no blue bar under the chips.
2. Type a word: Go appears. Clear it: Go disappears. Say it: the words appear, Go appears, tap Go and the results come.
3. Wine → snap a shelf (or use the stored shelf shot): "Reading the shelf…" with no pile of bubbles. The top card is the shelf's most popular bottle, with no star or thumbs on it. The five picks have no "vs." lines.
4. Compare to → This shelf lists the bottles from the photo. Pick one you know.
5. That bottle is now the top card with an amber outline. Each pick says "vs. [it]:" and shows the orange ring on its sliders.
6. × goes back to step 3. The bottle is still in the This shelf list.
7. Snap a single bottle: it's compared automatically.
8. Movies still work: Comedy → Feel-good → five cards, two taps.
