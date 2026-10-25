# S19 — fast moods, subtitle titles, snap first five (Brad, 2026-10-24)

Brad's brief: widen the fast path for typed **and spoken** Movies/TV moods with TMDb keywords and a named reference title, without trading correctness for speed (§0); let a typed title match the part before a colon or dash; keep Watched and disliked titles out of a fresh snap's first five. Merge when green. No new user-facing wording; any that turns out to be needed goes in its own PR and waits.

| PR | Branch | What |
|---|---|---|
| S19a | `auto/s19a-mood-keywords` | Part A: keyword tags + reference title → TMDb pool → slot recipe, behind a relevance gate. This plan. |
| S19b | `auto/s19b-subtitle-titles` | Part B: "Glass Onion" → *Glass Onion: A Knives Out Mystery*; ambiguous heads go to search. |
| S19c | `auto/s19c-snap-first-five` | Part C: the snap lane's first five drop Watched and disliked titles at the server. |

Each is one branch and one PR into `main`, self-merged under §10.3 / §11.4 when green. None of them touches `release/v2`, Production, a migration, or wording a person reads.

---

## Part A — TMDb keyword tags for typed and spoken moods

### What TMDb can hold (measured 2026-10-24, before writing code)

`search/keyword`, exact name: heist #10051, sports #6075, time travel #4379, slow burn #277551, coming of age #10683, road trip #7312, small town #1415, courtroom #33519, mockumentary #11800, mind-bending #362567, psychological thriller #12565, gore #10292, date night #254464, workplace #6282, underdog #240, whodunit #12570. "Cozy mystery" has no keyword; "cozy" (#326774) does.

Discover with the lane genre + keyword, floor as the chips (vote_average ≥ the lane floor), ≥200 votes (movies) / ≥60 (TV):

| mood | pool | top of pool |
|---|---|---|
| funny heist | 39 | Ocean's Eight, Logan Lucky, Tower Heist, The Sting, A Fish Called Wanda |
| sports (bright) | 79 | Rocky, Creed, Moneyball, Ford v Ferrari, The Blind Side |
| horror without gore | 1,600+ | It, The Shining, Get Out, A Quiet Place, The Conjuring |
| courtroom drama | 41 | 12 Angry Men, Bridge of Spies, Primal Fear, A Few Good Men |
| road trip comedy | 100 | Little Miss Sunshine, Green Book, Zombieland, We're the Millers |
| small-town mystery (TV) | 31 | Stranger Things, Twin Peaks, Mare of Easttown, Dark |
| mockumentary comedy (TV) | 31 | Parks and Recreation, What We Do in the Shadows, Abbott Elementary |
| workplace comedy (TV) | 95 | Brooklyn Nine-Nine, The Bear, Superstore, The IT Crowd |
| mind-bending sci-fi | 0–3 | sparse tag |
| slow burn + psychological thriller | 0 | sparse tag |
| romance + date night | 2 | sparse tag |

So keywords widen the fast path a lot where TMDb tags well, and a **pool-strength gate** has to catch the sparse tags rather than letting a two-title pool pass as an answer.

The Office's own recommendations web is weak (Less than Perfect, Archie Bunker's Place, 32–25 votes). Its *signature* keywords (mockumentary, workplace comedy) are strong. A named reference therefore steers through its web **inside** a keyword pool built from what the reference is, never through the raw web alone (S16 call 2: the raw web steer placed "like Ted Lasso but darker" badly).

### Mechanism

1. **The parse** (`/api/mood`, `src/lib/voiceMood.ts`). The prompt gains one output: `keywords`, up to 3 concepts. Each concept is `{ tags: [TMDb keyword names, closest first, ≤4 synonyms of the SAME idea], exclude }`. "isn't too gory" → `{ tags: ["gore"], exclude: true }`. When a title is named as a reference, one concept may name what that title *is* ("mockumentary", "workplace comedy"). `validateMood` keeps only clean short strings. The prompt writes tags, never text a person reads (S13c precedent), so this isn't VOICE. Brad's brief asks for exactly this change.
2. **Resolution** (`src/lib/tmdbKeywords.ts`, new, server-only). Each tag → `search/keyword` → every result whose name equals the tag after normalization (case, spaces, hyphens: "feel good" = "feel-good" = "feelgood"). A concept's ids are OR'd; concepts are AND'd. The cache is per process, 24 h, misses included. A cold tag costs one ~150 ms call, in parallel with the go-to lookup. A TMDb failure is named (`[mood-keywords] lookup failed`), and the concept counts as unresolved, which sends the mood to the AI search. No table: a cache in Supabase would need a migration, and at friends-and-family scale it saves ~150 ms on a cold lambda (§12.5).
3. **Word coverage** (`src/lib/typedMoodGate.ts`). This is the S16 gate, widened, and still the first half of the relevance gate. Every content word must be covered, as today, by:
   - a category, lane or refiner word;
   - **a word of a resolved tag** (stem match: "gory"~"gore", "sports"~"sport"; the tag has to echo the person's own word, so a broad tag can't swallow a word it doesn't mean);
   - **a word of the named reference** when TMDb resolved it (or it's a starred go-to);
   - a negator ("not", "isn't", "too", "without") when an exclusion concept resolved.

   *Amended after the preview runs:*
   - **Tags filter only when they echo the person's words.** A synonym that widens past them is dropped (the parse's "caper" for "heist" brought in *Ferris Bueller's Day Off*). A concept that doesn't echo is kept only as a named title's signature ("mockumentary" for The Office).
   - **Exclusions are the one place a tag widens:** every TMDb keyword containing the word, plus the parse's synonyms. *Saw* carries "blood and gore" / "splatter horror" / "torture", never "gore"; *The Substance* got through with only "gore".
   - **A feel-good mood pool keeps out what TMDb tags as sad:** tragedy, tragic ending, terminal illness, euthanasia, cancer, depressing, death of a loved one. *Million Dollar Baby* topped "an uplifting sports movie". Chip taps are unchanged.
   - **Horror stays out of a non-horror movie mood pool:** *It* (2017) carries "coming of age".
   - **A named title is asked for by its full official name**, so "Parks and Rec" resolved to a Paley Center special before this.
   - A "date night" context phrase was tried and taken out. Romance + Feel-good alone served *The Fault in Our Stars* and *Brokeback Mountain* for "something light and romantic for date night", so that mood keeps the AI search.

   Anything left over → AI search, logged with its residual words, as today.
4. **The pool** (`src/lib/slotRecipe.ts` `loadMoodPools`, `/api/slots`). Discover with the lane genre(s), `with_keywords` (AND of the OR groups), `without_keywords`, and the refiner exactly as the chips do: the same lane floor, Animation/Family out unless asked, ≥200 / ≥60 votes, ≤3 pages, cached an hour like the chip pools. The list (sorted by votes) splits into thirds for touchstone/popular/tier 2/tier 3, plus fresh (last 18 months) and classic (pre-2000) cut from the same list. Every slot's fallback chain ends in the whole pool, so a small pool fills five instead of shipping short.
   - **Reference with no keyword concept:** its web (recommendations, then similar), held to the lane genres, the floor, the refiner and ≥100 / ≥40 votes.
   - **Favorite steering as today:** the nearest go-to (or the named reference) steers the neighbor slots. With a mood pool, a neighbor must be *in* the pool (its web ∩ the pool, then the pool's closest titles by genre), so a steer can never pull a non-heist into "a funny heist movie".
   - Early paint and the "vs." lines are unchanged.
5. **The relevance gate, second half** (`/api/slots`). A mood pool with fewer than **12** titles left after this visit's exclusions answers `{ ok:false, reason:"weak_pool" }` and logs `[slots] weak pool — the AI search runs { kind, lane, concepts, size }`. The client runs the AI search on the person's words, exactly as now. Twelve is five cards plus room for backfills and the slot recipe's variety; below that, a set is mostly whatever is left.
6. **Spoken moods** (`handleVoice`) take the same path. A mapped Movies/TV mood runs as the typed mood with the parse already in hand, so there is no second parse and no title check: a spoken title still steers as today. The header still shows the said words. **A change, made on purpose:** a spoken mood the vocabulary can't hold (e.g. "a slow-burn psychological thriller") used to go fast ungated (the S16 measurement had ~3/10 on-mood for that class). It now takes the AI search, like typed. Chip-only spoken moods ("something funny") stay fast as today. Wine voice is unchanged.

### Races considered
- **A weak pool answers after a newer search started:** the existing `searchId` guard drops it, and the AI fallback checks it too.
- **Backfill (count 1) of a keyword set:** `slotReqRef` keeps the keywords and the reference, so a thumbs-down replacement comes from the same pool. A backfill never weak-gates (the set is already on screen); a dry pool is honest-short as today.
- **Voice → typed branch:** the voice set is recorded on the same five either way (`setVoiceSet` in both the fast and AI landing sites).

### Test set (20 moods)
- **S16's real ten:** a cozy mystery · something like Ted Lasso but darker · a funny heist movie · a slow-burn psychological thriller · something light and romantic for date night · a mind-bending sci-fi movie · a dark crime show · an uplifting sports movie · a scary movie that isn't too gory · a show like The Office.
- **Ten new:** a time travel movie · a coming of age movie · a road trip comedy · a courtroom drama · a small town mystery show · a feel-good underdog movie · a show like Succession · a mockumentary sitcom · a heist thriller · a funny show like Parks and Rec.
- **Per mood:** path (fast / AI), time to first card, complete time, the five titles, and a relevance call (would a reasonable person say these fit?). Measured on the S19a preview at 390×844, one fresh visit per mood, no go-tos (cold visitor), then a second pass with two go-tos for the "vs." lines.
- **Targets:** ≥7 of the 10 real moods fast; relevance ≥9/10 overall; first card ≤3 s on fast ones.

### Out of scope
- Books and wine.
- The chip rows.
- Any prompt that writes text a person reads.
- The AI search itself.
- A keyword table in Supabase.
- Keywords on chip taps.

---

## Part B — typed titles with subtitles

`resolveTypedTitleChecked` (`src/lib/tmdbMedia.ts`): when the typed text has head matches, the exact rule stops being the only one.
- A **head match** is a TMDb title (or original title) whose text before a spaced dash or a colon equals the typed text after normalization, at any separator ("Mission: Impossible - Fallout" heads to both "Mission" and "Mission: Impossible"). It gets the same 25-vote floor, year rule and lane weight.
- The best exact match and every head match compete by the existing score. The winner must lead the runner-up by **1.25×**; otherwise there's no title and the search runs.
- With no head matches, nothing changes (exact matches still choose among themselves as today).

Measured vote counts (2026-10-24):

| typed | expected | why |
|---|---|---|
| Glass Onion | *Glass Onion: A Knives Out Mystery* (2022) | the only match |
| Dune | *Dune* (2021) | 15,801 vs *Part Two* 8,817 = 1.79× |
| Spider-Man | search | *Homecoming* 24,130 vs *Spider-Man* (2002) 21,654 = 1.11× |
| Lioness | *Lioness* (TV, 2023), unchanged | no head matches |
| Mission Impossible | search | *Ghost Protocol* 11,112 vs 1996's 10,396 |
| John Wick | 2014 | 21,521 vs *Chapter 2* 14,770 = 1.46× |
| Star Wars | search (was: 1977) | 23,070 vs *The Force Awakens* 21,061 = 1.10× |

---

## Part C — snap first five exclude Watched (and disliked)

- **Today:** the poster snap's TMDb path (`tryMediaSnap`) and the typed-title reks (`/api/anchor` `reks`) both pass the server's taste read to the chooser, which drops watched/disliked/liked titles before the model sees them. But that read is `raceTaste`: 400 ms from when it *started*, then **empty** on a slow Supabase answer. So the guarantee silently becomes nothing on a cold read, which is the S18 finding.
  - The vision path (a media snap TMDb couldn't place) drops nothing by taste at all.
- **Fix:**
  - A guard read (`readTasteGuard`) for the drop-set: the same queries with a hang guard instead of a race to empty, started as early as today. It's still bounded: past the guard the set ships, logged `[snap-watched] taste read unavailable — watched/disliked not excluded`, a named failure, not a silent one.
  - The vision path's media lists drop watched + disliked at the response site.
  - The prompt-side pressure is unchanged.
- **Out of scope:** the S15 screen snap. It shows what was *on the screen*, and hiding on-screen titles is a design call; it goes in found-not-fixed.
- **Test:** a test client with a Watched row for a title in a poster's TMDb web; snap that poster; the title isn't in the five. Run it as an API test (the snap route with a poster image) and as a source-check harness.
