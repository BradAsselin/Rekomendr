# S28 — Home balance fix (Say it / Snap it are back, logo centered)

Written Oct 31, 2026 (Claude, with Brad). A fix to S26's home screen.

## What Brad saw (phone, production)
- **Bug: Say it and Snap it are gone from home.** Below the chip row there is only empty screen. They were probably squeezed to zero height by the "home fits one screen" change, or removed along with the snap tips. Find which, and fix the cause.
- **The header feels crowded.** A small left-aligned logo shares a row with ⋯, and the tiles sit tight against the search bar. It doesn't feel balanced.

## Standing rules (unchanged)
- Self-merge to main when green. Never touch release/v2, never deploy --prod, never set Production env vars. Brad promotes.
- VOICE: no new wording in this fix. If any seems needed, it goes in the report as "your call".
- Never send Brad's email or other personal info to outside services.

## Layout (top to bottom, all categories)
1. **⋯ alone, top-right** (screen-reader label "More options"). It sits on its own row, about 44px tall.
2. **The "Rekomendr.AI" logo, centered and larger:** about 34px font, the same weight and blue as the original centered logo. Give it room to breathe, about 20–24px above and below.
3. **The four list tiles** (Favorites · Watched · Recent · Saved), as they are now.
4. **A bigger gap before the search bar:** about 24px (it's about 12px now).
5. **The search bar**, unchanged, including the Go button behavior.
6. **The chip row**, unchanged.
7. **Say it / Snap it**, the two big blue buttons side by side as in S22/S24. They take up the remaining space and are never shorter than 150px at 390×844 or 120px at 375×667.
8. **"powered by Reks Ray™"** at the bottom.

## Fit
- At 390×844: no page scroll, and every item above is fully visible.
- At 375×667: no page scroll. To make room, shrink in this order: the logo to about 26px and its padding to about 12px, then the Say it / Snap it height down to its 120px minimum. Never hide them.

## Tests
- Playwright at 390×844 and 375×667, for Movies, TV, Books and Wine:
  - Say it and Snap it are visible, inside the viewport, and at least their minimum height.
  - The logo is horizontally centered (±4px).
  - The page scroll height is no more than the viewport height.
- The checks for S26's Go button and wine shelf still pass.
- Report: merge SHAs, the cause of the missing buttons, and revert commands.

## Phone checklist for Brad (after promotion)
1. Home: ⋯ top-right, a big centered logo with space around it, then the four tiles, then a clear gap, then search, then chips.
2. Say it and Snap it are back, big and side by side. Nothing scrolls.
3. Type a word and Go appears. Tap Say it and the words appear with Go.
4. Same on Wine, TV and Books.
