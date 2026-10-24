# S16 — "Watched" on every card + fast typed search — plan

Brad's brief (2026-10-24):

- **Part A — "Watched it" (Movies, TV, Books).** Bottom-left of every rek card and the anchor, always visible (not behind Show details or a menu). Same action row height as the others. An outline check becomes a filled check plus the word "Watched", and the card dims slightly (still readable). A toast, "Watched · Undo", shows for about 4 s; Undo restores the card and removes the watched mark. Watched titles never come back as reks, and they still count. Wine keeps its own actions.
- **Part B — fast typed search for Movies/TV.** A typed mood goes through:
  1. the mood parser (Haiku);
  2. the S12 TMDb pools and slot recipe, steered by the nearest or named go-to;
  3. the model, which only writes the "vs." lines (Sonnet).

  Early paint: show the five cards as soon as the picks are made, then fill in the lines. The old AI search stays as the fallback, and for Books. Typed titles still land as the anchor.
- **Approved wording:** "Watched", "Watched · Undo". Nothing else.
- **Prompts:** no prompt wording changes.
- **Merging:** merge to main when green. Never release/v2 or Production. §0 and §12 apply.

Two PRs, one per part:

| PR | branch |
|---|---|
| S16a | `auto/s16a-watched` |
| S16b | `auto/s16b-fast-typed` |

## Part A — Watched

### Where it sits
- Every Movies/TV/Books rek card in both lanes (frontier and trail, search and snap, S15 screen cards), plus the snap/typed anchor.
- **Placement:** bottom-left.
  - On a rek card it shares the existing bottom row with Share (Share stays right), so the card grows no new row.
  - On the anchor, Share sits under the card (S2), so Watched gets its own bottom row inside the card.
- **Not shown on:** wine (its own Bought and star), health (§2.2, the allow-list runs after the health check), or any other category. The gate is `goToCategoryFor` (movies/tv/books), the same allow-list the go-to star uses.
- **The S1 expanded-only "Watched it" button goes.** It is replaced, not duplicated.
- **The Shortlist chip's own "Watched it" is unchanged.** The strip isn't a rek card; renaming it would be new wording.

### States
- **Unmarked:** an outline check (`CircleCheck`), `aria-label="Watched"`.
- **Marked:** a filled navy check plus "Watched" (`aria-pressed`). The card's content dims to 70% opacity. The Watched control itself stays at full contrast, so the state reads at a glance.
- **Tapping the filled check** unmarks, the same as Undo. Every mark in the app toggles (Save, thumbs, star).
- **Toast:** "Watched · Undo".
  - One at a time; a new mark replaces it.
  - Bottom of the screen, above the safe area.
  - `role="status"`, gone after 4 s.
  - Precedent (§12.2): Material Design snackbars (one at a time, a single action, 4–10 s) and Gmail's "Undo". Undo beats a confirm dialog for a reversible action (NN/g, "Confirmation Dialogs Can Prevent User Errors — If They Are Not Overused").

### Signal path
- **Mark:** `recordWatched` → `/api/signals/watched` (S1's single-purpose route, action fixed to `watched`).
  - The category is written as `Movies` / `TV Shows` / `Books`, whatever the lane calls it, so every reader matches it:
    - `/api/prefs` (search lane, ilike);
    - `readTaste` (the snap chooser, slots and screen; ilike `movies` / `tv shows`).
- **Undo:** the same route with `undo: true` deletes this client's `watched` row(s) for that title and category. That is the only delete it can do.
  - If the write is still in flight, undo waits for it first, so it can't race ahead of the insert.
  - Log: `[watched-signal] undo`.
- **Failure:** the mark reverts (the card un-dims) and the log names the reason (`[watched] not persisted`). The server already logs `[watched-signal] write failed`. There is no new failure wording (none approved), so the visible revert is the honest signal.
- **"Never comes back":**
  - The page's `sessionWatchedTitles` gains or loses the title on mark and undo, and it feeds:
    - the AI search's `watchedTitles` (uncapped drop-set, §2.12);
    - the strip filter.
  - Server-side, every TMDb path drops `taste.watched`:
    - slots (S12 guarantee);
    - the chooser, through `/api/anchor` and `/api/reksnap`;
    - screen.
  - Within the visit, anything shown is already in `visitSeen`.
- **Stats:** the row stays in `user_likes`, the signal record every reader uses. Undo removes only the row the person just un-did.

### Races
- **Mark, then undo fast:** undo awaits the mark's promise before deleting.
- **Mark fails after undo:** nothing left to revert.
- **Mark, then a new search:** the toast lives with its lane, so it leaves with the old set. The mark stands; the card's check is the way back in that set.
- **Mark on a card that is then thumbed down or swiped:** the card leaves and the watched row stands. Two signals, both true.

### Files
- `src/components/RekCard.tsx`: `watchedSlot` and `dimmed` props, and the bottom row.
- `src/components/ShareRow.tsx`: a `leading` slot (Watched sits left of Share in the same row).
- `src/components/WatchedControl.tsx` (new): the button and the toast.
- `src/lib/useWatchedMarks.ts` (new): mark, undo, toggle, toast timer, the pending-write chain.
- `src/lib/userPrefs.ts`: `undoWatched`.
- `app/api/signals/watched/route.ts`: the `undo` branch.
- `src/components/ResultsV4.tsx`: the card wiring; the expanded `detailAction` goes.
- `src/components/RekSnapResults.tsx`: the anchor and rek wiring.
- `app/page.tsx`: the session list sync.

### Out of scope
- Wine and health.
- The strip's chip wording.
- A stats readout row for watched (no wording approved; see Found, not fixed).
- Any prompt.

### Acceptance (iPhone-size preview, 390×844)
- Tap Watched on a rek: filled check + "Watched" + dim + toast. Undo reverses all three and deletes the row.
- Re-running the search never shows that title (search lane, AI and slots).
- The same on a snap anchor.
- No Watched on wine or health.

## Part B — Fast typed search (Movies/TV)

### Flow
1. **On GO with typed text on the Movies/TV bar**, three requests run in parallel:
   - the prefs read (as today);
   - the S3.0 title check (`/api/anchor` resolve, as today);
   - the mood parse (`/api/mood`, `source: "typed"`).
2. **A title wins.** If the check finds one, the anchor path runs unchanged (S3.0) and the parse is ignored.
3. **Otherwise, a mapped parse in Movies/TV becomes a slot request.**
   - It reuses `handleVoice`'s mapping: lane chip, refiner, and a named title.
   - A named title becomes a transient steer (`extraGoTo`, TMDb-resolved, never stored), or a starred go-to by name.
   - Category words win, as in S13c: "a dark crime show" on the Movies bar runs TV.
4. **Otherwise the old AI search runs, as today.** That covers:
   - an unmapped parse;
   - a parse whose category is Wine or Books;
   - a parse failure;
   - slots failing.

   Each case gets a named log line: `[typed-mood] → AI search { reason }`.
5. **Books and Wine:** untouched (the AI search, and the typed wine anchor).

### Early paint
- `/api/slots` gains `stream: "ndjson"`:
  1. `{type:"cards", …}` as soon as the picks and their TMDb bundles are ready;
  2. `{type:"lines", lines}` when the "vs." writer answers;
  3. `{type:"final"}`.
- The writer starts the moment the picks exist, in parallel with the bundle reads. So the time to complete is about parse + pools + writer, not their sum with the bundles.
- **Cards** show the title, TMDb synopsis, commitment ("2h 10m", "3 seasons · 30 episodes"), and where to watch ("on Netflix"). These are S15's `facts`, with S15's helper and wording, on the descriptor line.
- **Lines** then replace the synopsis with "vs. your X: …" on the same cards.
  - Ids are kept, so ResultsV4 merges in place: no re-animation, the trail and marks survive.
  - A marker, `data-lines-pending`, sits on the results while lines are pending.
- **Every full slot set streams** (chips, Steer by, voice, typed), and every slot card carries the facts.
  - One card shape however you got there.
  - Chips with a go-to also get the early paint.
  - This is a call, logged.
- **The one-card backfill** stays plain JSON, with facts.

### Speed budget (target: first card ≤ 3 s, complete ≤ 6 s)

| step | time |
|---|---|
| parse (Haiku) | ~1.2 s |
| title check | parallel |
| pools | cached 1 h, ~0.3–0.8 s cold |
| bundles | ~0.3–0.6 s, parallel |
| first paint | **≈ 2–2.5 s** |
| writer (Sonnet) | ~3.6–4.1 s, starting with the bundles |
| complete | **≈ 5–6 s** |

With no steer there is no writer, so complete = first paint.

### Mood route change
- `source: "typed"` skips the `voice_moods` insert, so typed moods don't inflate the voice readout.
- It logs `[mood] parsed { source: "typed" }`.
- No prompt change: the parser's prompt is untouched; it already handles typed-style phrases.

### Races
- `searchIdRef` guards the cards paint, the lines patch and the fallback.
- A new search mid-stream: the reader keeps reading, but every landing checks `searchId`.
- Thumbs or Save before lines land: the patch maps by id across frontier, trail and marks, and a dismissed card is skipped.
- The backfill epoch is unaffected (the patch isn't a new set).

### Files
- `app/api/slots/route.ts`: the stream, bundles + facts, the writer started early.
- `src/lib/slotRecipe.ts` (or tmdbMedia): the shared `whereOf`.
- `src/lib/slotsClient.ts`: the NDJSON reader, `onCards`, the patch.
- `app/api/mood/route.ts`: `source`.
- `app/page.tsx`: the typed-mood branch and the lines-pending state.
- `src/components/ResultsV4.tsx`: the in-place merge and the marker.

### Measure
- 10 typed moods, before (main preview) and after (branch preview), 390×844, one visit each.
- Columns: time to first card, time to complete, a relevance spot-check, repeats.
- Plus one "after" pass with two starred go-tos, so every set carries lines.
- Script: the session scratchpad's `s16-timing.cjs`, with the results in the PR and the log.

### Out of scope
- Books on the fast path (no TMDb).
- Wine typed moods.
- Any prompt or wording change.
- Mood parser tuning: if the parser maps a mood badly, that is a VOICE/prompt PR for Brad.

## §0 check (planned)
- Both parts shorten the path to a choice:
  - "I've seen it" in one tap, and it never comes back;
  - five real, watchable titles in ~2 s instead of ~30.
- Picks come from public TMDb data and the person's own go-tos, and the reference is named ("vs. your …").
- Nothing pays to move a pick. Nothing nags; the toast is a 4 s undo, not a prompt.
