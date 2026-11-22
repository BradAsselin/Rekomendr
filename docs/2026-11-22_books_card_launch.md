# Books get the same card as Movies and TV, with "Read it"

Written Nov 22, 2026 (Claude, with Brad). Run after docs/2026-11-22_get_the_app_launch.md (or with it, if that one has not started).

## Why
Brad's screenshots (Nov 22): Books results still use the older text-first card. There is no cover, thumbs up and down sit where Movies and TV now have star / save / ×, there is a tag line above the title, and the button says "Watched it" for a book. Charter §2.14's last point says repeated actions look and sit the same on every card, so Books should match.

## Standing rules (unchanged)
- Self-merge to main when green. Never touch release/v2, never deploy --prod, never set Production env vars. Brad promotes.
- Never send Brad's email or other personal info to outside services. A cover lookup sends only the book's title, author and ISBN.
- The book line voice does not change (no prompt edits).
- **Pre-approved wording (Brad, by launching this doc):** "Read it", "Read", "Mark as read" (screen-reader label), and the list tile reading "Read" when the Books category is selected. Anything else new goes in the report as "your call".

## 1. The Books card matches the Movies/TV card
- Same layout as Movies/TV: cover on the left (same size and corner radius as posters, and the Show/Hide posters setting applies), title and year, author in the meta line where Movies show runtime and service, the description, Show details, Share, + More like this, and the actions in the same places.
- **Top right:** star (favorite), bookmark (save) and × (not for me), exactly as on Movies/TV. Remove the thumbs up and down from Books cards. Whatever thumbs up and down recorded for books must still be recorded through the new controls the same way Movies/TV do it (×, for example, records "not for me"). Say in the report how each old signal maps.
- **The tag line** ("Mystery · Cozy") above the title: keep it only if Movies/TV cards have it; otherwise drop it so the cards match. Report which.
- **"You liked this in November."** keeps working as it does on Movies/TV.
- **Covers:** use a free cover source with no key and no account, looked up by ISBN first, then title plus author (Open Library's covers, for example; Google Books is acceptable if it needs no key). Cache the result like posters. If no cover is found, show the same placeholder Movies use when a poster is missing. Never send anything about the person with the lookup.

## 2. "Read it", not "Watched it"
- On Books cards, the pill reads **Read it**, and **Read** once tapped, with the same Undo toast and the same check icon. Screen-reader label: "Mark as read".
- It writes the same mark Watched writes today (no new table): Books' "watched" means read.
- In the top bar, the Watched tile reads **Read** while the Books category is selected, and **Watched** otherwise. Its count and its list show that category's titles, as now.
- In the Watched list, book rows say Read, not Watched.
- Recent, Favorites, Saved and shared cards for books follow the same wording wherever "Watched" appears.
- "Did you watch one of these?" stays Movies/TV only (unchanged).

## Tests
- A Books result renders the same card component as Movies: a cover (or placeholder), star / save / ×, no thumbs, and "Read it".
- Tapping Read it writes one mark, shows "Read" with Undo, and the book appears in the list under a tile reading "Read" in Books.
- Switching the category back to Movies shows the tile as "Watched".
- The cover lookup request carries only title, author and ISBN.
- Movies, TV and Wine cards are unchanged (existing browser checks still pass).
- All suites, tsc, lint and build pass; check a Books result on the preview at 390×844.

## Report back
Merge SHAs; the cover source used and its hit rate on a test set of 20 books; how the old thumbs signals map; the tag-line decision; anything under "your call".

## Brad's check (after promotion)
1. Books → Mystery → Cozy: each card has a cover, star / save / × at the top right, and a "Read it" pill.
2. Tap Read it on one: it says Read, with Undo. The top tile now says Read, and the book is in that list.
3. Switch to Movies: the tile says Watched again.
