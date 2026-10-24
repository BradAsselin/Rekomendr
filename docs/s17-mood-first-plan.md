# S17 — Mood first (Movies/TV), per canvas Option D2

Brad's brief, 2026-10-24. Movies and TV only. Wine keeps its current layout. Books follow Movies/TV wherever that comes free.

**Rules for the run:**
- Merge to `main` when green.
- Never touch `release/v2` or Production.
- Charter §0 and §12 apply.

**Part 0 (S16) is done.** S16a (#59 `a7665a2`) and S16b (#60 `6beb7a6`) are merged and logged, so the run starts at S17a.

**Approved wording, all of it:**
- "Not for me", "Not for me · Undo"
- "Saved · Undo", "Watched · Undo", "Posters hidden · Undo"
- "Show posters", "Save for later", "Saved", "Watched", "Favorites"
- the TMDb attribution sentence

Any other new user-facing words wait for Brad. Card text (the synopsis) is VOICE and goes to its own PR.

---

## The split: four PRs

Each PR gets its own branch, plan, fence and checklist.

| PR | branch | fence | merge |
|---|---|---|---|
| **S17a** | `auto/s17a-guard-stats` | The real-title guard reports a failed check as a failure, not as fiction. Two TMDb name matches. A "Watched" row in `/api/stats`. No UI, no wording, no prompt. | self-merge when green |
| **S17b** | `auto/s17b-mood-first` | The search box, the chips, the removed rows, the results header, the D2 card (poster, ☆ · Save · ×, commitment + where, bottom row, swipes, toasts). No prompt, no card-text change. | self-merge when green |
| **S17c** | `auto/s17c-saved-page` | "Saved [n]" opens Saved · Watched · Favorites, with remove / un-watch / un-star, tap to open, and the "Show posters" footer. | self-merge when green |
| **S17v** | `auto/s17v-tmdb-synopsis` | AI-search cards show TMDb's synopsis instead of the generated paragraph. | **VOICE — stays open for Brad's OK** |

---

## S17a — the field bug, and the stats row

### The bug (field, Oct 24 4:03 PM)

On Movies, with the shortlist on screen, a search returned:

> "Every title that came back for this line was one I couldn't confirm is real, so I'm not showing them."

**What the logs could say:** nothing. Vercel keeps about an hour of runtime logs, and the 4:03 PM lines were gone by 4:21. So the cause was found by reproduction and reading the code.

**Reproduction:** the browser engine, run in Node against the main preview. Liked titles plus an 8-title shortlist (so the over-ask and the freshness slot are both live), real `/api/openai` and `/api/verify/titles`.

| run | provider | queries | generations | sets emptied |
|---|---|---|---|---|
| A | Claude (main preview default) | Comedy chip, heist, "like Knives Out but darker", cozy mystery, Thriller + Dark | 16 searches (32 generations, ~380 titles) | **0** |
| B | OpenAI 4o-mini (production's model, `x-reks-provider: openai`) | Comedy, heist, "something cozy", Drama + Feel-good | 12 searches (24 generations, ~250 titles) | **0** |

- **Single titles that failed the check:** 4, every one a real film that TMDb names differently:
  - "Glass Onion" (TMDb: "Glass Onion: A Knives Out Mystery"), twice;
  - "Ocean's 8" (TMDb: "Ocean's Eight");
  - "Charade in the Fog" (not a film; a correct drop).
- **So it isn't the title/year format, and it isn't the lane prompt drifting.** The model returns `{title, year}` cleanly on both providers.

**The cause is in the code.** `verifyTitlesViaApi` returns an *empty* verdict map when the verify call itself fails:
- a non-OK status (a function timeout, a 5xx);
- a thrown fetch (an iPhone backgrounding the app mid-request, a network drop);
- or every TMDb lookup failing (`lookup_failed`).

The engine then drops every title (fail-closed, correctly, per S1.5). But it counts them as `droppedAsFake`, and `getTop5FromEngine` turns "droppedAsFake > 0 and nothing left" into the *fiction* notice. A check that never ran is reported as five invented titles. The notice also tells the person a retry won't help, which is false for an outage.

Why the shortlist matters: it makes the bug more likely, though it doesn't cause it. With likes on file the ask grows to 10–12 titles, two generations run at once (main + freshness), and each one verifies 10–13 titles. That's the longest verify calls the app makes, so they're the most exposed to a timeout or a dropped request.

### The fix (no new wording)

1. **A verdict is only "fake" when TMDb answered.** In the engine:
   - `droppedAsFake` counts titles TMDb explicitly answered `no_match` or `year_mismatch`.
   - Titles with no verdict, or `lookup_failed`, count as `unverifiable`.
   - The client wrapper carries the verdict reason through.
2. **One retry of the verify call** when it fails as a whole (transport), before giving up.
3. **An emptied set whose drops were unverifiable shows the existing failure voice** ("Reks Ray couldn't fetch fresh picks — give it another go.").
   - It's honest: a retry may work.
   - The fiction notice stays for real fiction.
   - Still fail-closed: an unchecked title never ships.
   - Tripwire: `[fake-title] verification unavailable — set emptied, failure voice` with the counts.
4. **Two name matches in `tmdbVerify`** (title + year ±1 still required):
   - TMDb's title before a colon equals the model's title ("Glass Onion" ↔ "Glass Onion: A Knives Out Mystery").
   - Number words and digits match ("Ocean's 8" ↔ "Ocean's Eight").
5. **Test:** `scripts/validate-s17a.cjs`. The engine with stubbed fetch:
   - verify 503 twice → empty, no fiction notice;
   - 503 then OK → five;
   - all `no_match` → the fiction notice;
   - all `lookup_failed` → no fiction notice;
   - the matcher cases.
   - Plus the stats row.

### "You liked this in October."

This is **S1's freshness-slot marker**, not leftover clutter:
- Charter §7 call #2 is marked default.
- One of the five (position 3) may resurface a title you liked and haven't watched.
- The grey line under its title says when you liked it.

It only made sense beside the Shortlist strip, which S17b removes. And D2's card has no line for it. So **S17b stops rendering it** on Movies/TV cards. The freshness slot itself keeps working: the engine still sets `resurfacedNote`, and no pick logic changes. Bringing it back is one prop.

### The stats row

- `/api/stats` gains **"Watched"**: the live `user_likes` rows with `action = 'watched'` since the test start.
- An Undo deletes its row, so undone marks don't count. Agent traffic is excluded.
- JSON key: `watched`.

---

## S17b — the mood-first screen and the D2 card

### Search box (§12.2: one field, inline icons)

`category ▾ · text · mic · camera` on one row (the Google / Apple Music search-field pattern).
- **No GO button.** The keyboard's Search key submits (`enterKeyHint="search"`).
- The empty-GO "generic discovery" stays reachable through the "Surprise me" chip.
- Wine and Books get the same box (it's one component); wine's chips and results are unchanged.

### Chips

- Both rows always show: genre chips, then vibe chips, **wrapping** (no sideways scroll).
- **Unselected:** transparent, thin outline, light text. On the phone's navy page that's `white/80` text with a `white/25` outline; on desktop's white page, `gray-700` on `gray-300`.
- **Selected:** filled `#3B6BD4`, white bold text.
- **Taps:**
  - a genre tap searches (as today);
  - a vibe tap with no genre searches "Surprise me" + that vibe;
  - tapping the selected vibe clears it.
- Secondary buttons use the same quiet outline: the exhaustion card's buttons, and the toasts' Undo.

### Removed from Movies/TV (the UI only)

- **The Shortlist strip:** its data still feeds the engine's freshness slot.
- **The Steer by row:** go-tos still steer every recipe, nearest first, exactly as S12. Only the row that switched the steer by hand goes.
- **The "Your go-tos" home list for movies, TV and books.**
  - Wine's go-to and "Wine you bought" stay on the home screen.
  - Favorites move to the Saved page (S17c).
- **"From your screen"** stays: it's the header of a screen snap.

### Results header

One quiet line above the cards: the active chips ("Comedy · Feel-good"), or the typed/spoken words in quotes. It's data, not new copy.

### The D2 card (Movies/TV; search lane)

1. **Poster thumbnail on the left.**
   - TMDb `w185` (185 px source), shown at 76×114, rounded, `loading="lazy"`, `decoding="async"`.
   - The text renders first; the image fills in.
   - No poster → a neutral placeholder block of the same size, so nothing jumps.
   - Sources:
     - slot and screen cards: the pool row's `poster_path`;
     - AI-search cards: the verify route's TMDb match, which now returns `tmdbId` and `posterPath` (no extra call).
2. **Hiding posters.**
   - A small × in the poster's top-right corner (a 44 px touch target, drawn smaller) hides posters everywhere.
   - Toast: "Posters hidden · Undo".
   - Remembered per device in `localStorage`, wrapped in try/catch.
   - Hidden → the D1 layout (full-width text), and no poster URL is ever put in the DOM.
   - "Show posters" lives in the Saved page footer (S17c). Default is on.
3. **Top right: ☆ favorite · Save (bookmark) · × Not for me.**
   - Filled states: a gold ★ and a filled blue bookmark. No thumbs.
   - × is the existing dismiss (dislike + backfill).
   - The ☆ is the existing go-to star.
4. **Under the title: commitment + where** ("1h 43m · on Netflix" / "3 seasons · 30 episodes · on Netflix").
   - Slot and screen cards already carry it (`facts`).
   - AI-search cards get it from a new read-only `/api/facts` (TMDb bundle, cached), after the cards paint.
   - The separator is " · " everywhere.
5. **"vs. your [favorite]: …"** only when a favorite shaped the pick (the slot recipe's `vsGoTo`); otherwise no line.
6. **The text:** what the card carries today.
   - Slot and screen cards: TMDb's synopsis.
   - AI-search cards: the generated paragraph until S17v is approved.
7. **Bottom row: Watched (left, S16) · Share · + More like this.** Trailer and Where-to-watch stay on the expanded card.
8. **Gestures (shortcuts; each one has an Undo):**
   - **Swipe left = Not for me.** The card slides out over a "Not for me" backing.
   - **Swipe right = Save for later.** The card slides over a "Save for later" backing and graduates to the trail, the same as tapping Save.
   - **Watched fades the card out** of the five and backfills, with Undo.
   - **Implementation:** `useSwipeToAction` gains direction (`onSwipeLeft` / `onSwipeRight`).
     - The 10 px slop and the one-time direction lock are unchanged, and `touch-action: pan-y` is kept. **Vertical scrolling is never blocked.**
     - Reduced motion: no slide, no fade, the card simply leaves.
     - Marked cards still never arm.
9. **Undo toasts:** one toast per lane, the newest replaces the last, ~4 s:
   - "Not for me · Undo": restores the card where it was, and deletes this client's dislike row;
   - "Saved · Undo": un-saves, the card returns, the save row is deleted;
   - "Watched · Undo" (S16's);
   - "Posters hidden · Undo".
   - Undo of a dislike or a save goes through a new narrow route, `/api/signals/undo`. It deletes **this client's** newest row of exactly that action for that title, only if it's under 10 minutes old. It's action-fixed to `dislike | save`, the same shape as S16's watched route.
10. **TMDb attribution:** already in the footer of every page (`app/layout.tsx`, S1.5/S2.4), with their logo. Nothing to add.

**Out of scope for S17b:**
- **The anchor lane's cards** (a typed or snapped title's five, in `RekSnapResults`) keep their current card. They have their own signal path (`reksnap_signals`), and the D2 card there is its own session (named in the log).
- Wine and Books cards are unchanged.
- No prompt change.

### Measure

Playwright on the preview at 390×844, ten chip searches each with posters on and posters off. Two timings:
- **first card text paint:** the first `[data-rek-title]` visible;
- **posters filled:** every `img[data-poster]` complete.

Target: no difference in first text paint; posters fill in after.

---

## S17c — the Saved page

- **The header button.**
  - "Saved [n]" in the top bar (left of Share/Install), where `n` = Saved + Watched + Favorites.
  - It opens a full-screen sheet with three tabs: **Saved · Watched · Favorites**.
  - Every category is included, grouped (Movies · TV Shows · Books · Wine).
- **The sources:**
  - **Saved:** this client's `user_likes` `save` rows, newest first, minus titles removed since.
  - **Watched:** `user_likes` `watched` rows.
  - **Favorites:** `go_tos` plus wine's one go-to.
  - A new read route, `/api/saved` (service role, this client's rows only), returns all three.
- **Actions:**
  - Remove (Saved) → `/api/signals/undo` with `remove: true`. That deletes every one of this client's save rows for that title.
  - Un-watch → S16's watched undo.
  - Un-star → the existing `toggleGoTo`.
- **Tap an item to open its card:**
  - movies/TV → the go-to open path (TMDb by id, else by name);
  - books → the seeded search;
  - wine → the typed-wine anchor.
- **Footer:** the "Show posters" toggle.
- No schema change: every table already exists.

---

## S17v — the TMDb synopsis on AI-search cards (VOICE)

- **What it does:** AI-search Movies/TV cards show TMDb's synopsis (`overview`, first two sentences, the same `shortSynopsis` the slot cards use) instead of the generated paragraph with its closers ("You'll be laughing…").
- **The source:** the verify verdict carries the overview, so it costs no extra call.
- **Counted report:** closers per set, before and after, over 5+ searches.
- **Not merged:** labeled VOICE, waiting for Brad's OK.

---

## Races considered

- **The facts fill-in (S17b)** lands on cards by `id` behind the frontier epoch. A new search or a More-like-this wipe drops a late answer (the backfill/MLT guard class).
- **Undo of a dismiss** after the backfill already filled the slot: the card returns to the top, and the frontier briefly holds six (the existing carried-sixth policy). No dismissal.
- **Undo racing its own write:** the undo waits for the write's promise (S16's pattern) before it deletes.
- **The poster-hide toggle** is read once per render from state that mirrors `localStorage`. A storage failure means posters stay on.

## Blast radius

- **S17a:** the engine's empty-set notice choice, `tmdbVerify` matching (it can only *admit* more real titles; year ±1 still holds), and the stats route.
- **S17b:** `SearchBar`, `ResultsV4`, `RekCard` (a new `poster`/`facts` layout, opt-in through props, so the snap lane's cards are untouched), `useSwipeToAction` (direction, opt-in), and the page (removals).
- **S17c:** new route, new sheet, and the top bar.

## Phone checklist, §0 check, promotion

These are written in the session log entry at the end of the run.
