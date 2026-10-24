# S18 — S17 follow-ups (Brad, 2026-10-24)

Brad approved #66 (TMDb synopsis on typed cards) and #64 ("Hide posters"), plus three empty-state lines. He asked for the D2 card on Movies/TV snap results and on titles opened from the Saved page, with the correct saved/starred/watched states. Merge when green.

| PR | Branch | What |
|---|---|---|
| #66, #64 | (S17) | Merged as approved. |
| S18a | `auto/s18a-saved-empty` | The three empty states, verbatim. Saved and Watched show theirs only after the read has answered. |
| S18b | `auto/s18b-snap-d2` | The snap lane's Movies/TV anchor and reks on the D2 card, opening with the right marks. |
| S18c | `auto/s18c-snap-watched-exclude` | A watched title never comes back on a snap backfill or chain. |

## S18b — design

- **Where:** `RekSnapResults`, whenever the anchor is Movies/TV and not health: a snapped poster or screen, a typed title (S3.0), or a title opened from the Saved page (which takes the go-to path into this lane).
  - Books and wine keep their cards.
- **Anchor:** the D2 card with its navy accent frame.
  - ☆ · Save only. The anchor is the title you asked about, so it is never dismissed (no ×).
  - Its facts line is the commitment. Where-to-watch keeps its own tappable `WatchLine`.
  - Trailer / Watch / Share are unchanged.
- **Reks (frontier and trail):** the D2 card.
  - Poster, ☆ · Save · ×, commitment + where, then Watched · Share · + More like this.
  - **Frontier:** swipe left = Not for me, swipe right = Save for later.
  - **Watched:** fades a frontier card out and backfills.
  - Every act has the lane's one Undo toast.
- **Writes:**
  - The snap signal (`reksnap_signals`) is still written.
  - Saves and Not for me now also write `user_likes`, which is what the Saved page and later searches read.
  - Un-save removes every save row of the title (including an earlier visit's).
  - Undo deletes through `/api/signals/undo`.
- **Correct marks on open:** `useServerMarks` reads `/api/saved` (Movies/TV rows) and re-reads on every change.
  - Any name on screen that's already saved shows the filled bookmark.
  - Any name already watched shows the filled check (`useWatchedMarks.seed`, no write).
  - Stars already follow the go-to mirror.
  - A tap made this snap always wins over a read that was in flight.
- **Facts and posters:** `/api/facts` now also takes `{ kind, title, year }`.
  - Names are matched by the title check's own lookup (`verifyTitles`: same matcher, same cache), so an unmatched title is absent, never a near miss.
  - The anchor is asked by its TMDb id when it has one.
- **Wording:** none new. Only the approved toasts and the card's existing labels.

## Races considered

- **A late facts answer for a replaced anchor:** dropped (`resultRef`).
- **A late `/api/saved` read after an un-save or un-watch:** guarded by `touchedRef`, and the change event triggers a fresh read anyway.
- **An Undo after a backfill already landed:** the restored card makes a carried sixth (the existing policy).
- **A toast's Undo outliving its render:** it calls the newest `d2Save` through a ref and reads saved state from `savedNamesRef`.

## S18c — watched stays gone

- **Found in S18b:** a title watched from a frontier card faded out, but the snap backfill only excluded what was on screen, so it could come back. A title watched on an earlier visit could too.
- **Fix:** the lane keeps the titles watched this snap (an un-watch takes one back out), plus the server's watched list (Movies/TV, newest 60, D2 only).
  - Backfill `excludeNames` and the chain/re-roll exclusion union both carry them.
  - The server already drops every `excludeNames` entry at the response site (the two-tier guarantee), so it holds even if the model ignores the prompt.
- **Wording:** none.
