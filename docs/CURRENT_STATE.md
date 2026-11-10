# Rekomendr — current state

One page. Read it at the top of every session, before the session log; update it at the end (charter §3.14). The session log is the history; this page is the present.

**Updated:** 2026-11-10, Session 39.

## Last session
- **Session 39** — test-row cleanup + charter part 2 — 2026-11-10 — PR #130, merged as `d5d72b1`; cleanup run by Brad the same day (log entry).
- Before it: **Session 38** — housekeeping (charter truth-up, lighter log, this page, test-row report) — 2026-11-10 — branch `auto/s38-housekeeping` — PR #128, merged as `13f4cdc`.
- **Next free session number: 40.**

## Production
- `origin/release/v2` contains all of `origin/main` as of 2026-11-01 (promotion PR #127, `f6a42f8`; main was at `0dea5fa`). Sessions 26–37 are live.
- Waiting on main: only Sessions 38–39's docs and check scripts (no app change, nothing to test on the phone).

## Models (as `/api/health` reports, 2026-11-10)
- Opus 5.5: shelf.
- Sonnet 5.5: vision, wine, lines, search, snap.
- Haiku 5.5: mood, detail, recipe, classify.
- OpenAI: moderation only. Health also reports db, tmdb and mint OK.

## What the app does today
1. **Home:** centered logo, ⋯ menu, four list tiles (Favorites, Watched, Recent, Saved), a search box with Go, genre and vibe chip rows, one split Say it / Snap it square with a rotating nudge. Fits one screen.
2. **Lists:** Favorites (starred go-tos), Watched, Recent, Saved; a hint line on each and a › on every row; tapping a title opens its card and starts More like this.
3. **Search types:** typed words, spoken words, chips (genre + vibe), a typed or spoken title, and snaps (a bottle, a poster, a TV screen, a product). Movies, TV, Books and Wine.
4. **Wine shelf:** snap a shelf → "This shelf · most popular" top card with its own line, five picks with taste bars and price bands, a This shelf list to compare against.
5. **Compare to (§2.14):** one "Compare to [Reference] ☐/☑" row above the picks, "+" for up to three references; descriptions always stand alone and comparison lives only in the "vs." line (and wine's orange ring). Off by default, except wine with a typed or snapped bottle.
6. **Recent:** every search with its five picks, on the device only; reopening makes no request; opened picks get a blue dot.
7. **Share cards:** every card can be shared as a permanent link (`/a/<id>`, §2.13) with an image preview.
8. A model reply that fails to parse is retried once, silently, on every path.

## Standing rules in one place
- Self-merge to main when green. Never touch release/v2, never deploy --prod, never set Production env vars. Brad promotes.
- Never send Brad's email or other personal info to outside services.
- Only Brad changes §0. §2 changes only as Brad authorizes (§11.6).
- Single-instruction prompt changes Brad approves follow §2.3's exception; anything broader in voice is joint-session only.
- Every test client id starts with `anon_agent_`. `/api/stats` and the readout exclude that prefix; any other prefix counts as a real person.
- Test rows cleaned 2026-11-10 (Session 39): 3,484 rows deleted across 11 tables, backup `backups/2026-11-10-1221-s39.sql`; 0 test-pattern rows left.
- Real-device counts before 2026-11-10 are overstated: early browser tests (S2 chain, 2026-10-11) used real-format ids and cannot be separated.

## Open items (found, not fixed, Sessions 26–37)
- A wine description can still carry a referent-free comparative mid-sentence ("the bubbles are bigger and firmer"); the backstop catches openers and "than" only (S37).
- Recent's titles list covers Movies, TV, Books and Wine only, so whiskey and other product snap picks never get the blue dot (S36/S37).
- Reopening a wine snap entry from Recent starts Compare to checked again, even if it was unchecked when left (S37).
- A reopened snap-lane Movies/TV set re-reads `/api/saved` marks (not a search or model call) (S36).
- A failed search-lane backfill can now take two model calls inside the client's 90s abort; watch for aborts (S35).
- `/api/openai`'s legacy `pick_from_candidates` mode has no caller (S35; Build 5 removes it).
- The live shelf read and the top-card line are untested on a real shelf photo; every test used the stored sample (S27/S28).
- `src/lib/llm.ts` still falls back to OpenAI for generation if the Anthropic key is missing; Build 5 removes it.

## Where things are
- Launch docs: `docs/`, named by date and topic (charter §3.13), e.g. `docs/2026-11-10_housekeeping_launch.md`.
- Action plan: `docs/ACTION_PLAN_nov10.md` (Builds 1–5).
- Charter: `docs/BUILD_CHARTER.md`. Session log: `docs/SESSION_LOG.md` (Sessions 26 on); earlier entries in `docs/archive/SESSION_LOG_through_S25.md`.
- Promote link: https://github.com/BradAsselin/Rekomendr/compare/release/v2...main
- Health: https://www.rekomendr.ai/api/health
