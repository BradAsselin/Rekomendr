# S12 — Go-tos and Steer by (plan, 2026-10-18)

Local agent mode (charter §11). Brad's instructions for this run: plumbing merges when
green and checked on its preview; the approved new wording is only "Your go-tos",
"+ More like this", "Steer by", "A classic to steer by", and the "vs. your [go-to]: …"
comparison lead for Movies/TV/Books. Any other prompt or wording change opens a PR and
waits. Migrations per §11.2 (backup first). Never release/v2 or production. §12 applies.
Brad is away: make the reasonable call, log it, keep going.

## Brad's spec (as given)

1. **Go-to star across categories.** Movies, TV and Books get the same star as Wine
   (separate from Save), stored per user (anon id). Many go-tos per category. The star
   shows on anchors and rek cards.
2. **"Your go-tos" list** on the home screen (like "Wine you bought"), per category.
   Each tile has "+ More like this": wine → reks in that bottle's style and price band;
   screens → titles from its TMDb recommendation web. Also "+ More like this" on the
   starred anchor card itself and on "Wine you bought" tiles.
3. **Nearest go-to + "vs. your [go-to]" lines for screens.** Nearest = genre overlap plus
   TMDb similar/recommendations links; fall back to the most recent go-to in the
   category. Each rek's one-line reason leads with "vs. your Lioness: slower, less
   action, more family drama." Name the reference, never "based on your taste."
4. **"Steer by" row.** With ≥1 go-to in the category, a chip row of go-tos above the
   results (the nearest selected). One tap re-runs the results steered by it. Hidden
   with no go-tos. Order: nearest first, then most recent.
5. **Mood/genre chip lists: the slot recipe** (Movies/TV first; Books best-effort):
   - 0 go-tos: 2 well-known touchstones (offered to star) · 2 strong popular picks · 1 fresh/recent.
   - 1 go-to: 1 touchstone · 3 close neighbors of the go-to · 1 fresh.
   - 2+ go-tos: steer by the nearest: 3 neighbors one popularity tier less famous · 1 classic · 1 new release.
   - Pools: TMDb discover for the genre/mood, ranked by vote count, top ~50 per tier,
     quality floor (6.9 most lanes; 5.0 comedy; anchors exempt). Sample at random within
     each slot; never repeat a title already shown this visit, starred, watched, or
     disliked. Always keep one wildcard slot.
   - Acceptance: Comedy → Heartwarming three times gives 15 different titles; starring
     one shifts the next five toward it and one tier deeper.
6. **Touchstone label**: "A classic to steer by ☆". One tap stars it.
7. **Approved wording** (above). Nothing else.
8. **Measure in /api/stats**: stars per category, touchstone star rate,
   More-like-this-from-go-to taps, Steer by switches, repeats (must be 0).
9. **Wine unchanged** (shelf, price band, bars, haul).

## Mechanism

### Split
- **S12a — go-tos (plumbing):** the table, the route, the star on media/book cards,
  the home list, "+ More like this" from tiles / the starred anchor / Wine-you-bought
  tiles, star + tile-tap events in /api/stats. Merges when green on its preview.
- **S12b — steer (plumbing, approved wording only):** the slot recipe route for
  Movies/TV chips, nearest go-to, the "vs. your X:" lead, Steer by, touchstone label,
  the rest of the stats (touchstone rate, steer switches, repeats). Merges when green
  on its preview. No prompt text changes (see below).

### Data (one additive migration, `docs/sql/s12-go-tos.sql`)
- `go_tos`: client_id, category (`movies` | `tv` | `books`), name, year, tmdb_kind,
  tmdb_id, genre_ids int[], created_at, cleared_at. One LIVE row per (client, category,
  lower(name)); many per category. Un-star = `cleared_at` (history, not trash).
- `goto_events`: client_id, kind (`touchstone_shown`, `touchstone_star`, `goto_more`,
  `steer_switch`, `set_shown`), category, repeats smallint, created_at. Counts only.
- Both: RLS on, zero client policies, REVOKE ALL from anon/authenticated, explicit
  service_role grants (the wine_marks posture). Adversarial suite with positive controls.
- **Wine stays on `wine_marks`, untouched** (one live wine favorite, as S8 built it).
  The go-to list reads it for its Wine tile.

### S12a
- `app/api/gotos/route.ts` (service role): `state` (live go-tos), `star` (resolves
  movies/TV on TMDb by id or name for tmdb id + genre ids), `unstar`, `event`.
- `src/lib/goTos.ts`: localStorage mirror + change event (the wineVisit pattern),
  server wins on load, optimistic star.
- Star: RekSnapResults (media + book anchors; reks under a media anchor) and ResultsV4
  (search-lane Movies/TV/Books cards, frontier and trail). Same Star icon, same place
  (left of Save) as wine.
- "Your go-tos" (`GoTosList.tsx`) on the home screen above "Wine you bought": one
  collapsed line, a tap opens it, grouped Movies · TV Shows · Books · Wine; each tile =
  name + "+ More like this".
  - Movies/TV tile → `/api/anchor` `action:"open"` (TMDb by id: the go-to as the anchor)
    + the existing chooser over its TMDb web (`action:"reks"`). No new model path.
  - Books tile → the existing seeded search (`getMoreLikeThisSet`, seed = the book).
  - Wine tile and Wine-you-bought tiles → the existing typed-wine path (the bottle as the
    anchor: its style and its ±35% price band, S8b).
- Starred anchor: "+ More like this" (the existing re-roll) shows collapsed while the
  anchor is starred.

### S12b
- `app/api/slots/route.ts` + `src/lib/slotRecipe.ts` (server): the recipe above.
  - Pools: `discover/{movie|tv}` sorted `vote_count.desc`, genre from the chip lane,
    refiner → filters (Feel-good: no horror/thriller/war/crime unless the lane is one of
    them; Dark: thriller/crime/mystery/horror; Smart: a higher rating floor; Classic:
    before 2000; New: last 2 years). Tier 1 = ranks 1–50, tier 2 = 51–100, tier 3 =
    101–150. Fresh = released in the last ~18 months. Classic = before 2000. Floor:
    vote_average ≥ 6.9 (5.0 comedy), vote_count ≥ 500 (charter S5 default; 100 for fresh).
    Per-process cache, 1 hour.
  - Neighbors = the go-to's TMDb recommendations + similar (the existing bundle), genre-
    filtered to the lane when the lane has a genre, floored the same way. "One tier less
    famous" = skip the most-voted third of the neighbors.
  - Touchstones = the 20 most-voted of tier 1.
  - Wildcard slot: one slot always comes from tier 3 (the deep end of the genre pool).
  - Exclusions (the guarantee, uncapped, at the one response site): this visit's shown
    titles (client sends; sessionStorage), starred go-tos, watched, disliked (raceTaste).
  - Lines: with a steering go-to, ONE chooser call — `CHOOSER_PROMPT` verbatim, the
    go-to as the anchor, exactly the five picks as candidates — and the card leads
    "vs. your <go-to>: <line>". With no go-to, the card's text is TMDb's own synopsis
    (no model call). **No prompt text changes.**
- Nearest go-to: +2 if it carries the lane's genre, + genre Jaccard with the pool,
  +1 per go-to-web link into the lane pool (capped); ties → most recent.
- Steer by row (ResultsV4, above the results): Movies/TV/Books with ≥1 go-to.
  Movies/TV → the slot route with `steer`; Books → the seeded search.
- Touchstone label on touchstone cards: "A classic to steer by ☆" (tap stars it).
- Search-lane backfill on a slot set comes from the slot route (count 1), so the no-repeat
  guarantee covers replacements too. MLT stays the existing AI path; slot titles are
  also noted into the engine's session-seen set.
- Fallback: slot route unavailable (no TMDb key, TMDb down) → the existing AI chip
  search runs, loudly (`[slots] FALLBACK`), never silently.

### Races considered
- Every new search-lane landing site sits behind `searchIdRef` (page) and the
  frontier epoch (ResultsV4), like the AI paths.
- Star writes are optimistic with the server copy winning on next load (wine pattern).

### Out of scope (logged)
- Go-tos following `/api/auth/merge` on sign-in (same gap as wine_marks).
- Books slot recipe (TMDb doesn't know books): Books chips stay on the AI path; Books
  Steer by uses the seeded search, whose sentence 3 already places against the go-to by
  name. No "vs." prefix for Books this session.
- Typed mood searches (not chips) stay on the AI path.
- Wine: unchanged, still one live go-to.

## Brad's calls made (also in SESSION_LOG.md)
See the session log entry for the numbered list.
