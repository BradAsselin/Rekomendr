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

## Session 0 — ops-hardening — 2026-09-12 — branch auto/s0-ops-hardening — PR #1

SHIPPED:
- The charter is the law on disk: `docs/BUILD_CHARTER.md`; this log opened.
- The database can't die of neglect: `GET /api/health` does one cheap service-role read and answers `{ ok, db, latencyMs, env, envProblems }` (503 with a named reason when unconfigured or erroring; `[health]` log line). `vercel.json` schedules it **daily** (`0 6 * * *` — safe on every Vercel plan; Hobby rejects sub-daily at deploy). The charter's 12-hour cadence is met by the external ping in BRAD MUST. Vercel cron fires on production deployments only, so it goes live at the next `main → release/v2` promotion.
- Silent OpenAI outages have a voice: every generation route (`/api/openai`, `/api/reksnap` incl. backfill/detail/chain, `/api/recipe`) classifies at its outer catch — `insufficient_quota` → quota, 401 → auth, 429 → rate-limit, connection/timeout → unreachable — logs `[openai-failure] { route, kind, upstreamStatus, code }` and answers `{ error: <plain-voice copy>, reason }` (503; 429 for rate-limit). Unknown errors keep today's behavior. `src/lib/openaiFailure.ts`.
- The user reads the honest copy: `src/lib/aiServiceError.ts` carries it from fetch to screen. Search (`app/page.tsx`), snap (`app/page.tsx`), backfill/MLT (`ResultsV4.tsx`, behind the epoch guards), chain (`RekSnapResults.tsx`), recipe (`RecipeModal.tsx`). Engine: `AIServiceError` is the ONLY error class that escapes `generateAIReks`. Copy is plain voice: "Rekomendr’s AI account is out of credit. Not your doing — try again later."
- Dev/preview simulation: `REKOMENDR_SIMULATE_OPENAI_FAILURE=insufficient_quota|401|429|unreachable` (ignored on production; the env check names it if set there). Screenshots: `docs/screenshots/s0-sim-search.png`, `s0-sim-snap.png`.
- Stale sessions come home: `app/page.tsx` stamps activity on search/snap/reset; `pageshow` + `visibilitychange` call the existing `resetToHome` when the stamp is older than 6h (`[stale-session]` console line). S3.1a verbatim from `docs/s3-build-plan.md`.
- Permanent non-production `[prompt-diag]` in `/api/openai`: `hasSimulationClose`, `hasBannedRegister`, `hasExpectLine` (the RETIRED heading — true ⇒ stale bundle), `hasPrimeRule`, `promptChars`. Gated on `VERCEL_ENV` (preview logs it, production doesn't). Live run today: `true / true / false / true / 11345`.
- One boot-time env check for every pair: `src/lib/envCheck.ts` (missing vars, URL host mismatch, anon/service key project-ref vs URL, simulation flag on production) — logs once per process from every server route; replaces the two hand-copied blocks in `/api/prefs` and `/api/auth/merge`. Positive control run: a wrong `NEXT_PUBLIC_SUPABASE_URL` produced the mismatch warning in both the log and the health JSON.
- Housekeeping: `buildMoviePrompt.ts` retired (zero importers); `movieProfileScorer.ts` KEPT and documented — `rankMovieCandidates` is live at two engine sites (fresh AI set ordering, pool-backfill candidate ranking). `npx update-browserslist-db@latest` (caniuse-lite bump, no target changes).

FOUND, NOT FIXED:
- `src/components/RekSnapResults.tsx:1024` — the recipe affordance is a DENY-list gate (`NON_RECIPE_CATEGORIES`); a snapped app icon read as "Nextdoor Logo" got "View recipe" (`docs/screenshots/s0-real-snap.png`). An allow-list of food categories would close it. Snap-lane affordance — outside this fence.
- `src/engine/rekomendrEngine.ts` search S1–S2 — "leading to a powerful emotional reveal" leaked in today's live run (The Fall, `s0-real-search.png`). The banked voice-round re-fire; joint session only (§5).
- `app/api/vision/route.ts` (zero callers, canned reks), `app/api/recs/route.BACKUP.ts`, `src/supabaseClient.js`, `src/components/ResultsPage.js` (reads `REACT_APP_*` / `NEXT_PUBLIC_OPENAI_API_KEY`) — CRA-era dead code, untouched (housekeeping fence was `buildMoviePrompt.ts` only).
- `public/sw.js:1` — never-rotated cache name `rekomendr-v1` (trace A.2's secondary fossil vector). Per-deploy versioning is a one-liner but touches the PWA shell; deliberate call, not a drive-by.
- `src/components/RekSnapResults.tsx:531,912` — snap-lane backfill and anchor-detail failures stay log-only on screen (existing design), so under an outage a slot just stays empty; the primary snap and the chain show the honest copy.
- `app/api/health` is unauthenticated by design (one row, nothing returned); it echoes Supabase HOSTNAMES in `envProblems` only when a problem exists (the hostname is already public in the client bundle). If abuse ever appears: gate on `CRON_SECRET` bearer.

BRAD MUST:
1. Merge PR #1 after the twenty minutes pass. No SQL, no migration.
2. External 12-hour keep-warm ping (works today, on any plan, independent of Vercel cron): cron-job.org (free) → Create cronjob → URL `https://<production domain>/api/health` → Schedule "every 12 hours" → Save. Expected: response `200`, body contains `"ok":true`. Enable failure notifications there — that IS the Supabase-pause tripwire.
3. Optional, only if the Vercel project is on Pro: edit `vercel.json` schedule to `0 */12 * * *`.
4. SMTP / Resend (dashboard work, out of Session 0's fence — paste-steps): (a) resend.com → Domains → Add `rekomendr.ai` → add the DKIM/SPF DNS records it shows at your DNS host → wait for "Verified". (b) Resend → API Keys → Create ("supabase-auth", Sending access) → copy the key once. (c) Supabase Dashboard → Project → Authentication → SMTP Settings → Enable Custom SMTP: Sender email `hello@rekomendr.ai` (any address on the verified domain), Sender name `Rekomendr`, Host `smtp.resend.com`, Port `465`, Username `resend`, Password = the API key → Save. (d) Authentication → Rate Limits → raise "emails per hour" from the default 2 (custom SMTP unlocks it). Expected: a magic-link sign-in from the preview arrives within a minute, from `hello@rekomendr.ai`.
5. Charter §7 margin: mark #1 (freshness slot position) and #2 (resurfacing marker copy) BEFORE Session 1 runs — it stops with `BLOCKED:` at the first unmarked call.

NEXT SESSION SHOULD KNOW:
- Pattern for any NEW generation site: route → `maybeSimulateOpenAIFailure()` at the top of the try, `openAIFailureResponse(route, err)` first thing in the outer catch, `runEnvCheck()` at module level; client → `readServiceFailure(res)` on `!res.ok`, `isAIServiceError(err)` in the catch. Anything without a `reason` keeps its surface's existing voice.
- `hasExpectLine: true` in `[prompt-diag]` means the user's bundle predates d68cb6d — that is the January-bundle class showing itself; the staleness guard is the cure, the marker is the detector.
- Vercel cron never fires on previews; `[prompt-diag]` and the simulation flag are gated on `VERCEL_ENV`, so the preview shows them and production doesn't.
- Preview deployments are behind Vercel SSO deployment protection: a signed-out request to any preview URL (including `/api/health`) gets a 302 to `vercel.com/sso-api`. Brad signed in on his phone gets through; a session cannot curl a preview. If a future session needs machine access to a preview, ask Brad for a Protection Bypass for Automation token (Vercel → Settings → Deployment Protection) — never disable protection. The preview build for this branch succeeded, which also proves the daily cron schedule is accepted on this plan.
- The staleness window is 6h (S3.1a default). Brad may re-mark; it lives in one constant in `app/page.tsx`.
- Dev walkthrough script (search + snap + screenshots at 390×844) lived in the session scratchpad; it drives `input[placeholder]`, `button[type=submit]`, and `input[type=file]` with `public/rekomendr_icon_blue_512.png`. Rewrite in five minutes if needed; not committed on purpose.
- The typed-lane trace's Issue B (silent anchor-drop / no anchor contract) is untouched and remains a prerequisite for any `?q=` deep-link (S3/S6).

VALIDATION (verbatim from the PR's "Brad's twenty minutes"):
- Preview URL: https://rekomendr-git-auto-s0-ops-hardening-brad-asselins-projects.vercel.app
- What to do: (1) Open the preview on your phone. Movies → type "something clever" → GO. (2) Snap one thing — a bottle, a box, anything. (3) In Safari open `<preview>/api/health` (sign in to Vercel once if asked — deployment protection, not the app). (4) Vercel → project → Logs: search `[env-check]`, then after your search `[prompt-diag]`. (5) Open `docs/screenshots/s0-sim-search.png` and `s0-sim-snap.png` on the PR — that is what a user sees when the AI account is out of credit. (6) Optional overnight: leave a result set on screen, put the phone away 6+ hours, reopen the installed app.
- What it should feel like: [ ] search and snap behave exactly as production (same pace, same cards); [ ] no new tap target anywhere; [ ] health JSON reads `"ok":true`, `"db":"ok"`, `"env":"ok"`; [ ] `[env-check] ok` in the log; `[prompt-diag]` shows `hasSimulationClose: true`, `hasExpectLine: false`; [ ] the out-of-credit copy reads as plain honesty, not Reks Ray; [ ] after the long pause the app comes home — fresh bar, no old cards.
- What to screenshot if it's wrong: the whole phone screen with the search bar and first card; the health JSON; any log line starting `[openai-failure]`, `[env-check]`, or `[health]`.
- Paste-block: none required to validate. The keep-warm ping and SMTP steps are in BRAD MUST above.

---

## Session 1 — staleness — 2026-09-12 — branch auto/s1-staleness — PR #3

SHIPPED:
- **Liked-but-unwatched titles have a home.** The Shortlist strip: a compact horizontal band of chips above the results on the search lane, newest first, for the active category. Tap a chip = expand-in-place (like date, the title→Google handoff for media, and "Watched it"); it renders OUTSIDE ResultsV4's loading branch so it stays put while the next set generates, and it lives in `app/page.tsx` state, not `ResultsV4`'s, which wipes its view on every incoming set. No new schema — it reads through `/api/prefs` (`src/components/ShortlistStrip.tsx`).
- **`Movies` ≠ `movies` is fixed at the read.** `/api/prefs` matched category with `.eq()`, so a user got only one casing's worth of their own taste memory. Now case-insensitive `ilike`, with `%`, `_` and `\` escaped out of the pattern — the category comes from the request body, and an unescaped `%` would match every row for that client (`app/api/prefs/route.ts`).
- **One of the five is allowed to be something you already love.** The freshness slot at **position 3 of 5** (charter §7 call #1, marked: default): a second, small generation run in PARALLEL with the main one (costs the slower, not the sum), exempt from the liked-exclusion in BOTH the prompt avoid-list and the uncapped response drop-set, so pressure and guarantee agree. Disliked and watched are never exempt. Its card assembles through the same voice rules as every other card; only the selection instructions differ (`src/engine/rekomendrEngine.ts`, `applyFreshnessSlot`).
- **A resurfaced like says so, quietly.** One grey line under the title, "You liked this in July." (charter §7 call #2, marked: default), gaining the year once a bare month would mislead, and omitted entirely when the date is unknown — a marker that can't name *when* is vague, not quiet. A canon or merely-familiar freshness pick carries no marker at all: the card must read as an answer, never as a badge (`resurfacedMarker()`, `RekCard` `markerLine`).
- **A cold search reads like the app's best picks again.** "Next shelf down" was unconditional, so a cold Friday search — short avoid-list, nothing to dodge — was still pushed past the model's best answers into its deepest cuts. Now gated on `SHELF_PRESSURE_THRESHOLD` (12 marked titles in the category); below it the prompt asks for the picks it would lead with. One named constant, re-markable without a code read.
- **`watched` exists as a signal.** "Watched it" on Shortlist chips and expanded cards (media only). Excluded on EVERY frontier route — fresh search, MLT and backfill — because "never returns" has to mean never. Migration SQL is in the PR and **was not executed** (`docs/sql/s1-watched-signal.sql`).
- **The one new fail-soft path has a server-side tripwire (§2.4).** Alone among the signals, the watched write goes through a server route (`/api/signals/watched`) rather than the browser's anon insert, because the expected failure is specific: `user_likes.action`'s CHECK constraint rejects `'watched'` until the migration runs. The route recognises that by its Postgres code (`23514`) and logs `[watched-signal] { reason: "migration_pending" }`; `recordWatched` returns whether the row actually landed, so the tap is optimistic but never silently false — a failed write puts the chip BACK with its original like-date and position, and the strip says so in plain voice.
- **`/api/prefs` read window 100 → 300.** `watched` rows land in the same window as likes and dislikes, so at 100 a heavy user's oldest exclusions would start falling out of the drop-set §2.12 calls a guarantee — and a guarantee that truncates is not one. The prompt's avoid-list cap (100) is untouched: that one is pressure, and is meant to be bounded.
- **Counted validation, no API key required.** `scripts/validate-s1.cjs` compiles the engine from source (fresh bundle by construction, never cached), stubs the transport and drives the real `getTop5FromEngine`. **50 assertions, 50 passing** — the pressure gate at 0/4/11/12/40 marked, the §3.10 fingerprint markers on both prompts (`hasExpectLine: false`), the exemption's exact width, placement, marker copy, and every failure path shipping the plain five.

FOUND, NOT FIXED:
- `src/engine/rekomendrEngine.ts` (the rules block, ~line 806) — "prefer strong but less obvious titles over the most famous mainstream picks when possible" and "avoid repeating the same very famous titles across different searches" are the down-shelf instinct stated a second and third time, and they are still UNCONDITIONAL on the main search. The freshness assembly swaps them (it would otherwise ship a prompt arguing with itself), but the cold-search gate the charter asked for covers the "next shelf down" line only. If Brad's five searches still read too deep, these two lines are the next thing to gate — same mechanism, one line of code each. Deliberately fenced, not forgotten.
- "Watched it" on an **expanded frontier card** records the signal and excludes the title from every future generation, but does NOT remove the card from the screen it is already on. Removing a card mid-read would be surprising, and graduating it like a keep would pull in the backfill machinery — outside this fence. The strip case (the charter's acceptance criterion) does remove it immediately.
- **Wine and Books get a Shortlist they can read but not retire from.** "Watched it" is gated to media on purpose: the charter's watched arc is the can't-wait-to-watch arc, and the media-adjacent verb pairs (Listen / Read) are an explicit prepared-only item. A wine chip therefore has no exit today.
- The freshness slot fires on the **fresh search only** — not on MLT and not on backfill. An MLT regeneration replaces the frontier with a chained set, which is a pursuit, not a cold set; giving it a recall slot would fight the chain. Worth revisiting once the panel (S4) owns cross-search recall.
- `src/components/RekSnapResults.tsx:71` and `src/components/SearchBar.tsx:307` — two pre-existing lint findings on `main` (one unescaped apostrophe, one exhaustive-deps warning), in files this session did not touch. Confirmed present on `main` before the branch.
- Everything Session 0 listed under FOUND, NOT FIXED is untouched and still stands.

BRAD MUST:
1. **Run `docs/sql/s1-watched-signal.sql`** in the Supabase SQL editor, one block at a time, BEFORE validating "Watched it". Block 1 is read-only and tells you the constraint's real name; Block 2 is the migration; Block 4 is the self-test and rolls itself back. Until this runs, "Watched it" will correctly refuse to pretend: the chip comes back and the log says `migration_pending`. Everything else in this PR works without it.
2. Merge PR #3 after the twenty minutes pass.
3. **Charter §7 margin, before Session 5:** mark call #3 (quality floor tiers + the 500 minimum vote count). Session 5 stops with `BLOCKED:` at it.
4. Optional, after a week of use: if the cold searches still read too deep, re-mark `SHELF_PRESSURE_THRESHOLD` (currently 12) — it is one constant in `src/engine/rekomendrEngine.ts`. If they read too shallow, raise it.

NEXT SESSION SHOULD KNOW:
- **This session had no secrets.** No `.env.local`, no `OPENAI_API_KEY`, no Supabase keys were present in the container, so NO live generation and NO live database read was possible — unlike Session 0, which had them. That is why validation is a 50-assertion harness against the real engine with a stubbed transport rather than counted model output: the model-output half of §4's "counted, not felt" is Brad's five searches, and it is written as the acceptance test. A future session that needs live runs should ask for the key up front rather than discover its absence mid-session.
- **Recall is cross-session by design.** A title already shown earlier in the SAME visit is held back from the freshness slot by the engine's `sessionSeen` memory. That is correct — you saw it four minutes ago — and `validate-s1.cjs` §4g now asserts it in both directions so nobody "fixes" it later by accident.
- The freshness slot is a **second OpenAI call per fresh search**, small (asks 3, over-asks to at most 6) and parallel. Cost, not latency, is what it spends. If a future session adds a third parallel generation, re-check the request budget before it becomes a habit.
- `Rek` gained one optional field, `resurfacedNote`. It is presentational and set in exactly one place (`applyFreshnessSlot`). Do not use it as a "this is the freshness slot" flag — a canon pick occupies the slot and carries no note.
- `/api/signals/watched` is a **single-purpose** endpoint: the action is hard-coded to `'watched'`. It must not grow into a general signal write path; every other action keeps its browser write.
- The Shortlist deliberately shows **no generated blurb**. The app never saved copy for those titles, and generating some would make the strip a third generation site on a surface meant to be a memory, not a pitch.
- S3 (Session 2) mints `anchor_snapshots` at save-tap. When it lands, the Shortlist and Saved are two different things reading two different tables — the panel (S4) is where they finally sit together.

VALIDATION (verbatim from the PR's "Brad's twenty minutes"):
- Preview URL: the Vercel bot’s comment on PR #3.
- What to do: (1) **Run the SQL first** — `docs/sql/s1-watched-signal.sql`, Block 1, then 2, then 3, then 4. (2) On your phone, open the preview. Movies → type **"something clever"** → GO. Read all five. (3) Do that on five separate nights across the week, on at least three different lanes, and each time count: is there a card you can't wait to watch? (4) Look above the five for **Your shortlist** — chips of things you liked and never got to. Tap one. (5) Tap **"Watched it"** on that chip. (6) Search again in the same visit — the strip is still there, that title is gone from it. (7) Watch for a card with a grey line under the title: *"You liked this in July."*
- What it should feel like: [ ] at least one card in the five you can't wait to watch, **four nights out of five**; [ ] a cold search reads like the app's best picks, not its deepest cuts; [ ] the shortlist chips are YOUR real liked titles, in the right order; [ ] exactly one new tap target — the chip; nothing else on a card grew; [ ] "Watched it" removes the title and it never comes back; [ ] the resurfacing line reads as a quiet memory, not a badge.
- What to screenshot if it's wrong: the whole phone screen with the strip and all five cards; any card that reads as a deep cut on a cold search; the strip if a title you've watched is still in it.
- Paste-block: `docs/sql/s1-watched-signal.sql` — expected output is named under each block in the file.

---

## Session 1.5 — real-title-guard — 2026-09-22 — branch auto/s1.5-real-title-guard — PR #4

SHIPPED:
- **The app can no longer recommend a movie or show that does not exist.** For Movies and TV, every rek from every path — search, snap, backfill, more-like-this, chain — must resolve to a real TMDb entry (title match, year ±1) before it ships. Unresolved titles are dropped and logged `[fake-title]` **with the anchor that produced them** (`src/lib/tmdbVerify.ts`).
- **Five paths, two integration points.** Search / MLT / search-backfill all pass through `generateAIReks` (`src/engine/rekomendrEngine.ts`); snap / snap-backfill / chain all pass through `/api/reksnap` (`src/lib/snapTitleGuard.ts`). The engine is browser code, so its lookup goes through a new server route, `/api/verify/titles` — `TMDB_API_KEY` never reaches the bundle.
- **The over-ask really does cover the drops.** The engine's fold loop now runs every cheap local filter over the WHOLE batch, collects survivors, verifies them in ONE batched call, and only then fills the five. Verifying just the first five would have shipped short with good candidates still unused in the batch. Titles enter the dedupe set BEFORE verification, so the top-up pass can't re-offer a title already rejected as fiction.
- **Anchors are exempt everywhere.** The snapped or typed thing is the user's, not the model's — and a brand-new release the model can't place is precisely the case this guard exists to answer honestly.
- **When everything drops, the app says so in plain voice and never 502s.** Snap keeps returning the anchor with *"This one's new to me…"* where the five cards were — deliberately NOT "Could not read that photo", because the photo was read fine; only the neighbours were invented. Chain restores its previous list and reuses the existing banner. Search gets its own wording (`UNVERIFIED_SEARCH_NOTICE`) because "give it another go" would invite a retry that will invent again.
- **Fail-closed, with the cost named.** A lookup failure drops like a no-match, after one retry. The log separates `lookup_failed` from `no_match` and `year_mismatch`, so the evidence for flipping `DROP_ON_LOOKUP_FAILURE` will exist before the decision has to be made.
- **A missing key disables the guard loudly, never quietly.** No `TMDB_API_KEY` → every title passes (an app that refuses to answer over a missing key is worse than one that answers and says it couldn't check), and it is named by the boot check, by `/api/health` (`"tmdb":"disabled"` — on the surface Brad's keep-warm cron already pings), and by a `[fake-title]` line on every request.
- **Only the lookup is pulled forward from Session 5** — no quality floor, no vote counts, no scores. Nothing is judged here, only existence.
- **The recipe leak is closed** (Session 0's found-not-fixed, seen twice in the field: a snapped logo, then a snapped ad). The gate was a DENY-list, so it showed the button for everything nobody had thought to ban. It is now an **allow-list** of food/drink categories — **unknown suppresses** — with deny still beating allow so the health wall stays structural (`categoryGetsRecipe`, `src/lib/categoryGates.ts`).
- **Charter amended on disk:** §6 gains Session 1.5, and Session 5's "unverifiable/unmatched titles pass" becomes "unresolved media titles fail" — with the distinction spelled out, because existence and quality are different questions: S1.5 owns the first strictly, S5 owns the second leniently (a title that RESOLVES but has too few votes still passes the floor).
- **54 assertions, 54 passing, no key required** (`scripts/validate-s15.cjs`).

FOUND, NOT FIXED:
- **Books and Wine are unguarded.** TMDb doesn't know them, and a guard that can't check a category mustn't pretend to. A fabricated book title is the same failure wearing different clothes and needs its own source (OpenLibrary for books; wine has no clean equivalent). Named, not half-built.
- **A real title with a wrong year is dropped, not corrected.** When TMDb has the title but the model's year is off by more than 1, we drop it (`year_mismatch`) rather than rewriting the year to TMDb's. Correcting would likely be better product behaviour — we *know* the real film at that point — but it changes displayed data, which is past this fence. Watch the `year_mismatch` count in the log: if it's common, that's the next change.
- **The matcher depends on TMDb's search returning the row.** Our normalization strips accents and punctuation on both sides, but only among rows TMDb actually returns. TMDb's own search is accent-insensitive in practice, which is why this works — but it could not be verified against the real API from this container.
- **`/api/verify/titles` adds one round trip per generation on the search lane.** Batched (one call per pass, not per title) and cached per process, so the cost is one hop, not five. If a future session adds more parallel generations, re-check the request budget.
- `src/components/SearchBar.tsx:307` — pre-existing exhaustive-deps warning on `main`, untouched. (The `RekSnapResults.tsx:71` unescaped-apostrophe lint error is also pre-existing and untouched.)
- Everything Session 0 listed and Session 1 listed under FOUND, NOT FIXED still stands, minus the recipe gate, which this session closed.

BRAD MUST:
1. **Add `TMDB_API_KEY` in Vercel → Settings → Environment Variables (Preview AND Production), then redeploy.** Get it free at themoviedb.org → Settings → API. Either the v3 "API Key" or the v4 "API Read Access Token" works — the code sniffs which one you pasted. **Without it the guard is off and fabricated titles ship again.** Check it landed: open `<preview>/api/health` and look for `"tmdb":"ok"`. If it says `"disabled"`, the key isn't there.
2. Merge PR #4. No SQL, no migration.
3. **Merge order matters.** PR #3 (Session 1) is still open and both PRs branch from `main`, so whichever merges second needs a conflict resolution in `src/engine/rekomendrEngine.ts` and `app/page.tsx` — both touch `generateAIReks`'s fold loop and the `getTop5FromEngine` call. They are compatible in substance (S1 adds a freshness slot; S1.5 adds verification to the same loop); it's textual overlap, not a design clash. Merging **#3 first, then #4** is the easier direction, because S1.5's fold-loop restructure is the larger of the two edits.
4. Re-snap the release that produced the five fabricated titles. That's the acceptance test.

NEXT SESSION SHOULD KNOW:
- **Still no secrets in the container** (no TMDb, OpenAI or Supabase keys), same as Session 1. Validation is a 54-assertion harness against the real code with TMDb's HTTP stubbed. Nothing was run against the live TMDb API. A session that needs live calls should ask for the key up front.
- `getTop5FromEngine` **changed shape**: it now returns `{ reks, notice? }` instead of `Rek[]`. One caller (`app/page.tsx`). The `notice` is set only when the guard emptied the set — an empty set with no notice is the pre-existing generation failure and keeps its existing voice.
- `generateAIReks` takes an optional `outcome` out-param (`{ produced, droppedAsFake }`). That's how the page can tell "the model produced nothing" from "the model produced five titles and every one was fiction" without changing the return type at its other three call sites.
- **Never export non-route symbols from a Next route module.** `NEW_TO_ME_NOTICE` was briefly exported from `app/api/reksnap/route.ts`; it now lives in `src/lib/snapTitleGuard.ts`. Route files: handlers and route config only.
- The guard is Movies/TV only, and the lane's category decides which TMDb index is asked. A real TV series offered under a Movies search is dropped — that's deliberate and asserted (harness §5).
- Session 5 no longer owns the "does this exist?" question. It owns "is this any good?" only, and it must not re-admit a title the guard refused. The charter now says so.

VALIDATION (verbatim from the PR's "Brad's twenty minutes"):
- Preview URL: the Vercel bot's comment on PR #4.
- What to do: (1) **Add `TMDB_API_KEY` in Vercel (Preview + Production) and redeploy** — without it none of the rest of this means anything. (2) Open `<preview>/api/health` and confirm `"tmdb":"ok"`. (3) **Re-snap the 2026 release that produced the five fake titles.** (4) Snap two or three more media things — a streaming screen, a DVD case, a poster. (5) Tap "+ More like this" on a media rek. (6) Movies → search "something clever" → GO. (7) Snap an ad, a logo, or anything that isn't food.
- What it should feel like: [ ] every movie/show title you see is one you can actually find — no invented titles, and no Trailer button on something that doesn't exist; [ ] when the app can't place your snap it SAYS so in plain words and still shows the anchor, instead of inventing five neighbours; [ ] "Could not read that photo" only ever appears when the photo genuinely couldn't be read; [ ] the ad/logo snap has **no** "View recipe" button; [ ] a food snap still does; [ ] search and snap are otherwise the same pace and the same cards.
- What to screenshot if it's wrong: any card with a title you can't find anywhere; the whole screen if the honest-short line appears when it shouldn't; any non-food snap still showing "View recipe"; the health JSON if `"tmdb"` isn't `"ok"`.
- Paste-block: `TMDB_API_KEY` — Vercel → Settings → Environment Variables → Preview + Production → redeploy. Expected: `<preview>/api/health` shows `"tmdb":"ok"`, and the log line `[env-check] ok` includes `tmdbKey: 'present'`.

---

## Charter amendment §10 + chain run S2→S4 — 2026-09-22 — committed directly to main (charter-only, on Brad's instruction) — no PR

SHIPPED:
- Charter §10 "Multi-session runs and self-merge" appended verbatim to `docs/BUILD_CHARTER.md` (commit `10c362a`). Docs only, no code.
- Chain Sessions 2 → 3 → 4 was launched under §10 and **HALTED BEFORE SESSION 2 STARTED**. Session 2 has no branch and no PR, and nothing was merged. The halt reasons follow; each one is enough to stop the chain on its own.

CHAIN HALT — why, per §10.2 / §10.5 / §3.8:
1. **§10.2 carry-forward cannot be verified. The predecessors are not on `main`.** The launch assumed Sessions 0, 1 and 1.5 had merged. Readback on 2026-09-22: `main` = `684fa2a` (Session 0 / PR #1 only). **PR #3 (Session 1, `auto/s1-staleness` @ `b5b94f1`) and PR #4 (Session 1.5, `auto/s1.5-real-title-guard` @ `0dd2c5b`) are both OPEN and unmerged.** This log on `main` has no Session 1 or 1.5 entry; those entries exist only on their branches. Session 2 would have to build on a `main` without its predecessors, which §10.2 forbids.
2. **Session 2 is `BLOCKED:` on unmarked Q-list calls (charter §6 S2 "Blocked-by", §7 call 6).** `docs/s3-shareable-anchors-blueprint.md §6` has Q2, Q5 and Q8 DECIDED (Ledger #18/#19). **Q1, Q3, Q4, Q6, Q7 and Q9 are still proposals and are not marked** (Q1 anonymous shares; Q3 ship `revoked_at` now with UI deferred; Q4 anchor-only landing; Q6 no photo; Q7 UUID URL; Q9 shares don't count toward SNAP_LIMIT).
3. **The pending-migration stop (§10.4 + §10.5) would halt the chain after Session 2 anyway.** Session 2 ships the `anchor_snapshots` migration, which Brad has not run, so its PR cannot self-merge (§10.4). Session 3's Saved tab and Session 4's picker both read `anchor_snapshots`, so their acceptance depends on that migration (§10.5). Session 3 also depends on Session 1's Shortlist strip and watched signal (PR #3, open, with its own unexecuted `docs/sql/s1-watched-signal.sql`).

FOUND, NOT FIXED:
- `docs/BUILD_CHARTER.md` §2.8 still says "Sessions never push to `release/v2` or `main` … Brad merges. No exceptions", while §10.3 now allows a bounded self-merge into `main`. §10.4 bars a session from changing §2, so this session did not touch §2. Brad should add one clause to §2.8 (for example "except as §10.3 allows") so the two sections agree.

BRAD MUST (in this order to unblock the chain):
1. **Merge PR #3 (Session 1), then PR #4 (Session 1.5).** That order is taken from the S1.5 log: the second merge has a textual conflict in `src/engine/rekomendrEngine.ts` and `app/page.tsx`. After merging, run `docs/sql/s1-watched-signal.sql` (S1) and add `TMDB_API_KEY` in Vercel (S1.5), as their log entries say.
2. **Mark Q1, Q3, Q4, Q6, Q7 and Q9 in `docs/s3-shareable-anchors-blueprint.md §6`.** Accepting the proposals as written is a valid mark.
3. **Choose how Session 2's migration fits the chain.** Either (a) launch Session 2 alone, run its `anchor_snapshots` SQL after its PR lands, then launch Sessions 3–4 as a chain; or (b) launch 2→3→4 knowing the chain will stop after Session 2 opens its PR (§10.5).
4. Optional: the §2.8 / §10.3 wording fix above.

NEXT SESSION SHOULD KNOW:
- §7 calls 4 and 5 are confirmed at their defaults by Brad (2026-09-22). Call 4: the most recent Saved item in the category is the one-tap pin, and the picker shows the last five. Call 5: Recent is the landing tab. Neither has been struck in the §7 margin yet, so a session that reads only the charter should also read this entry.
- Before starting, re-run the readback this run did: `git ls-remote origin` plus the PR list. PR #3 and PR #4 were open at 2026-09-22, and both branch from `684fa2a`.
- No secrets were checked in this run because no build ran. Sessions 1 and 1.5 both reported an empty container (no OpenAI, Supabase or TMDb keys). Session 2 needs `MINT_SIGNING_SECRET` (per `docs/s3-build-plan.md` S3.2) and Supabase service-role access for any live check. Ask Brad for them up front.

VALIDATION: none this run. No code changed, so there is nothing to tap on a preview. The combined §10.6 batch is deferred to the chain that actually runs.

---

## Merges + Brad-authorized charter changes — 2026-09-23 — main — PR #3, PR #4

SHIPPED:
- **Session 1 is on `main`.** PR #3 was merged by this session on Brad's explicit authorization, after he validated it on preview: merge commit `326df32`. First `main` (the §10 docs) was merged into the branch at `0950325`; that was a SESSION_LOG-only conflict. The watched-signal migration (`docs/sql/s1-watched-signal.sql`) had already been run by Brad on 2026-09-13, and the constraint includes `'watched'`.
- **Session 1.5 is on `main`, self-merged under §10.3.** PR #4 merge commit: **`4bf4f7c`**. Revert that commit on its own to back S1.5 out. Brad asked for a rebase; this session merged `main` into the branch instead (`77f1f98`), because §3.1 forbids rebase and force-push. The result is the same with no history rewritten. PR #4 had been closed without a merge at 14:43 UTC, with no comment. It was reopened to carry out Brad's merge instruction.
  - Conflicts resolved in `src/engine/rekomendrEngine.ts`: `generateAIReks` takes both S1's freshness args and S1.5's `outcome`; `getTop5FromEngine` takes S1's watched/shortlist and returns S1.5's `{ reks, notice? }`. `app/page.tsx` merged cleanly and was checked by reading the call site.
  - The freshness-slot generation now goes through the real-title guard like every other path, under its own tripwire path `search-freshness`. Changed files: `titleVerification.ts`, `tmdbVerify.ts`, and the engine.
  - Harnesses fixed for the combined tree. `validate-s1.cjs` stubs `/api/verify/titles` (all titles resolve, guard ON) and reads `{ reks }`. `validate-s15.cjs` routes stub calls by URL; it used to swap `globalThis.fetch` mid-call, which raced S1's parallel freshness generation and failed with "Invalid URL".
  - §10.3 gate: Vercel green on `77f1f98`; `tsc --noEmit` clean; `validate-s15` 54/54; §10.2 carry-forward `validate-s1` 50/50 on the combined tree, with the `[freshness-slot]`, `[watched-signal]`, `[fake-title]` and `[short-sets]` tripwires present; no `BLOCKED:`. §10.4 check: no prompt text changed, no migration, the charter change is in §6 (not §2), and no release/v2 involvement. `TMDB_API_KEY` was set in Vercel (Preview + Production) by Brad.
- **BRAD-AUTHORIZED INVARIANT CHANGE (2026-09-23): §2.8** now reads "…Branch → PR → preview → Brad merges, except as §10.3 allows. No exceptions, including "tiny."" This is the only §2 change, and Brad authorized it explicitly. It reconciles §2.8 with §10.3; release/v2 stays Brad-only under §10.4.
- **Marked:** §7 call 4 (benchmark picker) = default; call 5 (panel landing tab) = Recent, default; call 6 = the blueprint Q-list. In `docs/s3-shareable-anchors-blueprint.md §6`, Q1, Q3, Q4, Q6, Q7 and Q9 are DECIDED 2026-09-23 as proposed. Q2, Q5 and Q8 were already decided under Ledger #18/#19.

FOUND, NOT FIXED:
- §7 calls 1 and 2 were marked "default" per PR #3's body, but the charter text still shows them unmarked. That's cosmetic, and they weren't in this instruction.

BRAD MUST: nothing for this entry.

NEXT SESSION SHOULD KNOW:
- `main` now carries S0 + S1 + S1.5. Session 2 branches from here.
- Keyless local builds need placeholder env, because module-level clients construct at build time: `OPENAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY`, `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`. Use placeholders only, and never commit them. Run `npm ci` first: bare `npx tsc` pulls TypeScript 6, which rejects this tsconfig.

VALIDATION: S1 and S1.5 validation blocks stand as written in their entries above. Their combined check is folded into Session 2's "Brad's twenty minutes".

---

## Session 2 — shareable-anchors — 2026-09-23 — branch auto/s2-shareable-anchors — PR #5

SHIPPED (PR open, NOT merged. It needs a migration Brad hasn't run yet, so §10.4 forbids a self-merge):
- **Saving a snapped anchor now keeps a private snapshot of it.** The snapshot holds the name, category, the short profile, the long profile if you opened it, and the mode. `/api/save` writes it at save-tap. Only text the server itself generated can be saved: the vision response carries an HMAC token over exactly what it said (`src/lib/mintToken.ts`), and the save route refuses anything the token doesn't cover. Save → unsave → save gives back the same row. If you save first and open details afterwards, the snapshot picks up the long profile you actually read. Rek cards never mint.
- **Share: the one new affordance, and only on a saved anchor.** It is a small text button under the anchor card. It never appears on a health anchor, and it doesn't exist while the server has no signing secret. The flow is Share → `/api/share` → your phone's share sheet with a `/a/{id}` link. If the share is refused, the card reads *"couldn't share this one — it's still saved"*. If iOS refuses the share sheet after the network wait, the button turns into "Send link" for one more tap.
- **A stranger can open the link with no account.** `/a/{id}` shows the saved card read-only, with Trailer/Watch or Buy links, the "Snapped with Rekomendr" CTA, `noindex`, and a link-preview image (`/api/og/{id}`, 1200×630, name + category + the first sentence). The page renders **database columns only**, and no public file reaches OpenAI (the harness proves this by walking the import graph). Never shared, revoked, health, garbage, and nonexistent ids all get the same **real 404**: *"This rek isn't here anymore."*
- **Moderation before anything goes public.** A flagged or unreachable moderation check keeps the row private and logs `[share] moderation blocked` / `moderation_unreachable`. It never fails silently.
- **Short-only saves become rich when shared.** `action:"complete"` generates the long tier server-side from the row's own attested fields, using the **unchanged** Show-details prompt. The prompt moved to `src/lib/anchorDetailPrompt.ts` byte for byte, sha256 `d500c0cf5cf5…` before and after, and the harness asserts it. The write is `WHERE long_description IS NULL`, and the fifth health twin runs first.
- **Health wall, every layer:** no Share affordance · mint 403 · share refusal · completion skip · public 404 · generic preview card. The category checked is the token-attested one.
- **No side doors (Catch 1):** once the secret is set, backfill, anchor-detail and chain all verify the anchor token before generating. Without the secret they behave exactly as before S2.
- **Caps:** mint ≤ 30/day and flip ≤ 20/day per client, counted on the table itself.
- **Tripwires:** `MINT_SIGNING_SECRET` is named at boot and on `/api/health` (`"mint":"ok"/"disabled"`). `[snapshot] mint refused {reason}` fires on every refusal, including `migration_pending` until the SQL runs. Also added: `[share] … refused {reason}`, `[mintToken] <path>: token missing/invalid — refused`, `[snapshot-completion] …`, and the dev-only `[prompt-diag] snapshot-completion`.
- Validation: `node scripts/validate-s2.cjs` **97/97**. `validate-s1` 50/50 and `validate-s15` 54/54 are unchanged. `tsc --noEmit` is clean, lint is clean on every touched file, and `npm run build` succeeds. A local production build rendered the page, the 404 and the preview image against fixture rows (`docs/screenshots/s2-*`, fixture text, not model output).

FOUND, NOT FIXED:
- **S3.6 (per-client caps on `/api/openai`, `/api/reksnap`, `/api/recipe`) is split out.** It needs a second migration (`api_usage`) and touches three generation routes plus three client call sites, none of which are about saving or sharing. Ledger #19 decided generation caps "IN the S3 window", so **this should land before this PR is promoted to release/v2.** It is Session 2b, or the first slice of the next run.
- `/a/{id}` is a route handler that emits HTML, not a React page. The root `app/loading.tsx` wraps every page in Suspense, so a page's 200 goes out before `notFound()` can run, even from `generateMetadata` (reproduced on a local production build). Moving `loading.tsx` into a route group would give the page back its React form, but it touches the main app shell.
- **The preview image's title renders in regular weight.** `next/og`'s bundled font has no bold. Bundling a TTF (for example Inter Bold) is a design iteration: bump `OG_DESIGN_VERSION` in `app/a/[id]/route.ts` when it lands.
- **Food anchors get "Buy" on the public page.** The blueprint's "View recipe → the app" needs the app's recipe modal, and a public page has no snap context. Revisit with S6 deep links.
- **Search-lane saves don't mint.** Snap anchors only, per the blueprint. The S4 panel's "Saved" tab will show snap saves only until the search lane gets a snapshot path.
- **The model on the completion path is `gpt-4o`.** That mirrors the existing Show-details route (`handleAnchorDetail`) so the saved long reads like the one you'd have seen. §2.10 names gpt-4o-mini; the snap lane has used gpt-4o since before this charter. This session did not change it.
- The pre-existing lint error in `src/components/RekSnapResults.tsx` (the unescaped apostrophe, now line 88) is untouched.

BRAD MUST (in this order):
1. **Run `docs/sql/s2-anchor-snapshots.sql`** in the Supabase SQL editor, one block at a time. Block 1 must return `NULL`. Block 2 is the migration. Block 3 checks RLS, zero policies, zero anon/authenticated grants, and service_role *can* reach the table. Block 4 is the self-test: it rolls itself back and must show two passing POSITIVE CONTROL rows plus five `PASS` notices with no `FAIL`.
2. **Add `MINT_SIGNING_SECRET` in Vercel** (paste-block below), for Preview **and** Production, with the same value in both, and redeploy the PR preview.
3. Merge PR #5 after the twenty minutes pass. It can't self-merge (§10.4: pending migration).
4. Before promoting to release/v2: the S3.6 caps session (above).

Paste-block — `MINT_SIGNING_SECRET` (Vercel):
- Make a 48-byte random value. On a Mac, Terminal: `openssl rand -base64 48`. Copy the one line it prints.
- Vercel → project **rekomendr** → Settings → Environment Variables → Add New → Key `MINT_SIGNING_SECRET`, Value = that line, Environments: **Production** and **Preview** → Save.
- Deployments → the latest `auto/s2-shareable-anchors` preview → ⋯ → **Redeploy**.
- Expected: `<preview>/api/health` shows `"mint":"ok"`. The Vercel log line `[env-check] ok` includes `mintSecret: 'present'`.
- Never paste the value anywhere else (not the PR, not a chat). If it leaks, change it in Vercel. That only invalidates tokens for snaps taken before the change.

NEXT SESSION SHOULD KNOW:
- **Session 3 (the panel) reads `anchor_snapshots` for its Saved tab.** Its acceptance depends on this migration, so §10.5 applies if it hasn't run. The owner-scoped list read is a new service-role route keyed by `client_id` (plus the `account_devices` join for signed-in users). Private rows exist for exactly this. Q5(i)'s second trigger ("complete on reopen") belongs to S4: call `/api/share` `action:"complete"`, or lift the completion call into the panel's read route.
- **The token is the S4 panel's friend.** A snapshot row is already attested. Reopening one into the front door ("tap any item → front door with that anchor on top") needs a *fresh* token for that anchor, or the text-only paths will refuse it. Plan a server route that re-signs a row the caller owns.
- **Previews are behind Vercel SSO.** A signed-out Safari tab and iMessage's link scraper **cannot open preview links**. The stranger-view and iMessage-unfurl half of the acceptance can only be fully proven on production. The PR says this in Brad's twenty minutes.
- Keyless local builds: `npm ci` first, and use placeholder env (see the 2026-09-23 merges entry). The local render check used a small fake PostgREST (a scratchpad script, not committed on purpose).
- Stale tabs: once the secret is set, a tab opened before this deploy has no token. Its first detail/chain/backfill tap fails politely with the existing voice; a re-snap fixes it. This was accepted in #19.

VALIDATION (verbatim from PR #5's "Brad's twenty minutes"):

**One batch for today's run, in the order to check it.** Session 1 and Session 1.5 are on `main` now. Session 2 is this PR and sits on top of them, so its preview carries all three.

**Preview URL (this PR):** https://rekomendr-git-auto-s2-shareable-anchors-brad-asselins-projects.vercel.app
**Main preview (S1 + S1.5 only):** https://rekomendr-git-main-brad-asselins-projects.vercel.app

#### Paste-blocks first (both needed before step 3)

**A. The migration: `docs/sql/s2-anchor-snapshots.sql`**, in the Supabase SQL editor, one block at a time.
- Block 1 → `already_exists = NULL`.
- Block 2 → "Success. No rows returned."
- Block 3 → `anchor_snapshots | true`; zero policies; zero anon/authenticated grants; service_role shows INSERT/SELECT/UPDATE.
- Block 4, run whole → two `POSITIVE CONTROL … pass = true` rows, plus five `PASS` notices in Messages with no `FAIL`. It rolls itself back.

**B. `MINT_SIGNING_SECRET` in Vercel.**
- Mac Terminal: `openssl rand -base64 48` → copy the line.
- Vercel → rekomendr → Settings → Environment Variables → Add → Key `MINT_SIGNING_SECRET`, Value = the line, **Production + Preview** → Save.
- Redeploy this PR's preview (Deployments → latest `auto/s2-shareable-anchors` → ⋯ → Redeploy).
- Expected: `<preview>/api/health` shows `"mint":"ok"` and `"tmdb":"ok"`.

#### What to do (phone)

1. **S1.5 on the main preview.** Re-snap the 2026 release that produced the five invented titles. Then snap an ad or a logo.
2. **Health check on this PR's preview.** Open `<preview>/api/health` → `"mint":"ok"`, `"tmdb":"ok"`, `"db":"ok"`.
3. **Snap a wine.** Tap **Save** (top right of the anchor). A small **Share** appears under the card.
4. Tap **Show details**, read it, then tap **Share**. Pick Messages and text it to yourself.
5. **Snap a movie** (a poster, a DVD, a screen). Save it **without** opening details, then Share it.
6. Open both links **on the phone, in Safari**. The wine page should include the long you read. The movie should be short-only at first; reload it after a minute and the long appears (the page caches for 60 seconds).
7. **Snap a vitamin bottle or a skincare product** and tap Save. No Share appears.
8. In Safari open `<preview>/a/00000000-0000-4000-8000-000000000000` (a made-up id). You should see "This rek isn't here anymore."
9. Supabase → Table editor → `anchor_snapshots`. You should see the wine and the movie as rows with `shared_at` set. The vitamin never appears.

#### What it should feel like
- [ ] S1.5: every movie title you're shown exists; the unplaceable snap says so plainly; the ad has no "View recipe".
- [ ] Saving feels exactly like before. Nothing waits, and Share simply appears once saved.
- [ ] **Exactly one** new tap target in the app: Share, only on a saved anchor. Nothing on the rek cards grew.
- [ ] The shared page reads like the card you saved: same words, and the long when you'd opened it.
- [ ] No Share anywhere near a health/medical snap.
- [ ] The made-up link reads "This rek isn't here anymore."
- [ ] Snap, chain ("+ More like this"), show details and dismiss-backfill all behave as they did yesterday.

#### Honest limit: the stranger's view and the iMessage preview
Preview deployments sit behind **Vercel SSO**. A signed-out Safari tab and iMessage's link scraper both get bounced to a Vercel login, so on the preview **the text bubble won't show the card image, and a signed-out tab can't open the page.** The page, the 404 and the image were rendered on a local production build (screenshots below). The charter's "signed-out Safari + iMessage preview" check is fully provable only on production, after promotion. On the preview, check steps 3–9 signed in.

#### What to screenshot if it's wrong
- The anchor card area after Save: with Share, without it, or with the amber "couldn't share this one — it's still saved".
- Any shared page that doesn't match what you saved.
- `<preview>/api/health` if `"mint"` isn't `"ok"`.
- Vercel log lines starting `[snapshot]`, `[share]`, `[mintToken]`, `[snapshot-completion]`, `[env-check]`.

#### Rendered locally (production build, fixture rows; the text is fixture, not model output)
`docs/screenshots/s2-shared-wine.png` · `s2-shared-tv-short-only.png` · `s2-private-404.png` · `s2-og-wine.png`

---

## Charter amendment §11 (local agent mode) — 2026-10-11 — committed directly to main (charter-only, on Brad's instruction) — no PR

SHIPPED:
- Charter §11 "Local agent mode" appended verbatim to `docs/BUILD_CHARTER.md` (before the closing line, as §10 was).
- **BRAD-AUTHORIZED INVARIANT CHANGE (2026-10-11): §2.9** now reads "Schema changes ship as SQL in the PR, never executed by the session, except as §11 allows." This is the only §2 change, authorized by Brad in chat. Cloud sessions are unchanged; §11.2 governs local execution (backup → block-by-block readback → adversarial suite with positive control → log with backup filename).
- `.gitignore`: `.vercel`, `.env*` and `backups/` ignored — `pg_dump` output from §11.2(a) never enters git.

FOUND, NOT FIXED: nothing.

BRAD MUST: nothing for this entry.

NEXT SESSION SHOULD KNOW:
- A local-mode session reads §11 alongside §10; cloud sessions read §3 and §10 only.
- Backups live in `backups/` at the repo root and are git-ignored by design. They contain user data — never attach them to a PR or copy them off the machine.

VALIDATION: none — docs only.

---

## Session 2 — landed in local agent mode (§11) — 2026-10-11 — branch auto/s2-shareable-anchors — PR #5

SHIPPED:
- **The `anchor_snapshots` migration is live** (§11.2). Backup first: **`backups/2026-10-11-1300-s2.sql`** (506,345 bytes, 41 data tables including `user_likes`, `reksnap_signals`, `account_devices`; dump-complete footer present). Then block by block from `docs/sql/s2-anchor-snapshots.sql`, each read back against the file's EXPECTED lines: Block 1 `already_exists = NULL`; Block 2 `BEGIN/CREATE TABLE/CREATE INDEX/ALTER TABLE/REVOKE/COMMIT`; Block 3 RLS `t`, zero policies, zero anon/authenticated grants, service_role has INSERT/SELECT/UPDATE (+ DELETE/REFERENCES/TRIGGER/TRUNCATE, Supabase defaults); Block 4 both POSITIVE CONTROL rows `t`, five PASS notices, zero FAIL, rolled back to 0 rows.
- `MINT_SIGNING_SECRET` set for **Preview** from `.env.local` (Vercel CLI, value never echoed). Production is Brad's (promotion checklist).
- **A real bug, found only on the live preview:** Next 14 caches every `fetch()` inside a GET route handler, and supabase-js reads are fetches. A **revoked share kept rendering 200**, and a page read while private **stayed 404 after it was shared**. `/api/health`'s DB read sat on the same cache, so the keep-warm ping could answer without ever touching Supabase. Fixed at the one service-role client: `src/lib/supabaseServer.ts` passes `cache: 'no-store'` on every fetch. POST routes (`/api/save`, `/api/share`, `/api/prefs`) were never cached and behave the same. The local harness could not see this because it uses an in-memory Supabase.
- **Acceptance on the preview, by machine, through the bypass header (§11.5): 22 checks, 22 passing.** Health `mint/db` ok; guessed URL → real 404 with "This rek isn't here anymore"; wine snap carries a token; tokenless detail → 400; forged short → 400; details → long + extended token; save mints and dedupes; private row → 404; someone else's id → uniform `not_found`; share flips; shared page 200 with the long, `og:image`, noindex; OG image 200 PNG; movie short-only save → share (`needsCompletion`) → lazy completion → second completion `already_rich`; a vitamin snap's save → **403 health**. After the fix: the previously stale page → 200; a revoked row → 404.
- Harnesses on the combined tree: `validate-s1` 50/50, `validate-s15` 54/54, `validate-s2` 97/97; `tsc --noEmit` clean. (On Windows the harnesses need a preload that resolves `npx` to `npx.cmd`; it lived in the session scratchpad, not the repo.)
- Test rows: four rows under `anon_agent_s2check_*`, all revoked after the run. No health row was ever minted.

FOUND, NOT FIXED:
- **`TMDB_API_KEY` is broken everywhere.** It is absent from Vercel in every environment (the S1.5 log said it was set; `vercel env ls` says not), so **production's real-title guard is OFF right now**. The key in `.env.local` is rejected by TMDb with 401 as both a v3 key and a Bearer token. Added to Preview, it made the guard fail closed (every movie rek dropped, the honest-short line every time), so it was removed again; the preview is back to "guard disabled, loudly".
- **`/api/health` reports `"tmdb":"ok"` for a key TMDb rejects.** It checks presence, not validity (`app/api/health/route.ts`). The per-request `[fake-title] tmdb lookup non-OK { status: 401 }` line does name it. A one-call validity probe on health would close the gap.
- A movie poster snapped as `mode: uses` once (Winchester '73 → "Costume Inspiration"), pre-existing vision-prompt behavior, not S2's.

BRAD MUST:
1. **Get a working TMDb key** (themoviedb.org → Settings → API → copy the v3 "API Key" or the v4 "Read Access Token"), put it in `.env.local`, and add it to Vercel **Production** yourself. Tell the next session and it will set Preview + Development.
2. `MINT_SIGNING_SECRET` in Production: same value as `.env.local`, before promoting.

NEXT SESSION SHOULD KNOW:
- Any new GET route that reads Supabase is now uncached by construction. A new client created elsewhere must do the same.
- Sharing a preview link still hits Vercel SSO for strangers; the signed-out and iMessage checks complete on production.

---

## Session 3.6 — rate-caps — 2026-10-11 — branch auto/s3.6-rate-caps — PR #6 (local agent mode, §11)

SHIPPED:
- **Every OpenAI-burning route is capped per client, per day:** `/api/openai` 300, `/api/recipe` 60, `/api/reksnap` vision 60, and its three text branches (details, backfill, chain) 300 under one shared key. Mint 30 and flip 20 were already live from S2. A real user never sees a cap. A runaway loop or a scripted client hits one and gets the surface's **existing** failure voice: the 429 carries `error` but no `reason`, so S0's honest-failure reader leaves it alone (`src/lib/apiUsage.ts`, `capGate`).
- **A call without a client id is refused with 400** (the cheap bot filter). The engine's search call and the recipe modal now send one. `getAnonymousClientId` moved unchanged to the import-free `src/lib/clientId.ts`, with the same localStorage key, and `userPrefs.ts` re-exports it. The engine must not import `userPrefs`, because that pulls in the browser Supabase client.
- **A broken counter never blocks anyone (§2.4).** A missing table, a count or insert error, a thrown client, or missing env all allow the request and log `[api-cap] uncapped — …` naming the reason.
- **Migration live (§11.2):** backup **`backups/2026-10-11-1316-s3.6.sql`** (512,213 bytes, 42 data tables, footer present). Block 1 `NULL`; Block 2 `BEGIN/CREATE TABLE/CREATE INDEX/ALTER TABLE/REVOKE/COMMIT`; Block 3 RLS `t`, zero policies, zero anon/authenticated grants, service_role INSERT+SELECT; Block 4 both POSITIVE CONTROLs `t`, six PASS (unknown route, short id, anon SELECT/INSERT/DELETE, authenticated SELECT), zero FAIL, 0 rows after rollback.
- **Preview acceptance by machine (§11.5): 8/8.** Without a client id: `/api/openai`, `/api/recipe` and vision each → 400. With one: `/api/openai`, vision and details → 200, each counted exactly once under the right route. A client seeded to the cap: recipe → 429 `{"error":"Daily limit reached"}` with no `reason`; `/api/openai` → 429; refused calls not counted. `[api-cap]` lines present in the preview log.
- Harnesses: `validate-s36` **59/59**; `validate-s2` 97/97 (its two token cases now send a client id, so they still test the token rather than the new 400); `validate-s15` 54/54; `validate-s1` 50/50; `tsc` clean; touched files lint clean.
- **S2 merge commit: `c302ea5`** (recorded here because S2's own entry was written before its merge).

FOUND, NOT FIXED:
- Count-then-insert is not atomic, so parallel requests at cap−1 can overshoot by the concurrency. That's deliberate for generous loop-bounding caps.
- `api_usage` grows one row per capped request with no pruning. Fine at today's volume; a windowed delete is the plan once it matters (build plan S3.6).
- Test rows remain: `anon_agent_s36capped_*` (360 seeded rows) and `anon_agent_s36check_*` (3). They fall out of the 24h window by themselves. Deleting them was not done: the session's permission rules deny `DELETE` and none is needed.

BRAD MUST: nothing for this session (no Production variable is new).

NEXT SESSION SHOULD KNOW:
- **Any new OpenAI-calling route gets one `capGate(clientId, "<key>")` line**, a new key in `CAPS_PER_DAY`, AND a migration adding that key to `api_usage.route`'s CHECK constraint. Otherwise its inserts fail the CHECK; the helper fails open and logs `request not counted`, so the route runs uncapped.
- Any new client call to a capped route must send `clientId: getAnonymousClientId()` from `src/lib/clientId.ts`.

VALIDATION: folded into the combined §10.6 batch at the end of this chain.

---

## Session 1.6 — anchor-grounding — 2026-10-11 — branch auto/s1.6-anchor-grounding — PR #7 (VOICE — joint session required; NOT merged)

SHIPPED (to the PR, not to main):
- **Media anchors stop inventing plots.** The field case reproduced 5/5 on `main`: the Undertone poster (a title plus a red audio waveform) became "a reclusive sound engineer" ×4 and "a radio DJ" ×1. With the PR: **0/10** invented across two no-synopsis images. The anchor says plainly that the title is too new to know.
- **The three tiers, in the charter's order.** (1) A synopsis visible in the photo is used. This already worked before: 5/5 before, 8/8 after. (2) TMDb's overview, via a grounded rewrite in the same shared media grammar. Signed by the S2 token, so Save keeps the grounded text. (3) Otherwise, honest-unknown. The long tier (Show details and the S2 lazy completion) gets the synopsis as data; `ANCHOR_DETAIL_PROMPT` is untouched.
- Counted: TMDb tier (real gpt-4o, TMDb reply stubbed with Brad's logline because the key is broken) → **5/5 correct premise**. `validate-s16` 41/41 for the mechanism; regression 50/54/97/59, all passing.

FOUND, NOT FIXED (for the joint session; details in PR #7 §2):
- The first after-run was **contaminated**: my RIGHT example mirrored the test poster and was copied verbatim 5/5. It was replaced with a made-up poster, and all reported counts use the clean prompt.
- **Mold:** "A new thriller whose poster gives away nothing but…" 8/10; "slow, watchful suspense over action" verbatim 3/5; a horror film called a "thriller" 8/10.
- **Embellishment in the TMDb rewrite:** "skeptical" host 5/5 → 3/5 after one tightening line (n=5, so noise-level); "inbox"/"studio" 2/5 each. The media grammar's "CHARACTERIZED role" pulls toward invented traits.
- The five reks around an unknown title are still generated from the model's guess about it. The S1.5 guard is the backstop, and it's off without a key.

BRAD MUST:
1. **A working TMDb key** (themoviedb.org → Settings → API → the "API Read Access Token" `eyJ…`): put it in `.env.local` and add it to Vercel **Production** yourself. This unblocks S1.6 acceptance AND turns S1.5's real-title guard back on. Production has no key today, and invented titles ("Whisper Frequency", "Soundwave Conspiracy") shipped on the main preview during this run.
2. Joint session for PR #7. Do not merge it from a validation batch.

NEXT SESSION SHOULD KNOW:
- Once the key exists: set Preview + Development (§11.3), then re-run the scratchpad count harness against the live API (fixtures: Undertone poster, key art, Apple TV synopsis screen, Winchester '73 poster). A missing key gets the `[anchor-grounding] no tmdb source { reason: 'disabled' }` line; a rejected key gets `lookup_failed` plus `[fake-title] tmdb lookup non-OK { status: 401 }`.
- **Bash-tool gotcha on this machine:** inside a heredoc, `\` arrives as `\`. Any edit that writes escaped `\n` into TS source must go through a script file written with the Write tool, not a heredoc.

---

## Chain close (S2 → S3.6 → S1.6) — local agent mode (§11) — 2026-10-11

**Merged (§10.3 + §11.4):** S2 shareable anchors, PR #5, merge **`c302ea5`**; S3.6 rate caps, PR #6, merge **`7255623`**. Each reverts on its own: `git revert -m 1 <sha>`.
**Open:** S1.6, PR #7, VOICE: joint session, BLOCKED on the TMDb key.
**Toolchain (§11.1), checked at start:** `gh` logged in (BradAsselin); `vercel whoami` bradasselin-8214, linked project `rekomendr`; psql `select 1` OK through the session pooler, **same project ref as `SUPABASE_URL`**; `pg_dump` 17.11 vs server 17.6 (same major); bypass header 302 → 200 on the main preview.

### Brad's twenty minutes — combined (§10.6), against the main preview
Main preview: https://rekomendr-git-main-brad-asselins-projects.vercel.app (carries S0, S1, S1.5, S2 and S3.6).

What to do, in this order:
1. Open `<main preview>/api/health`. Expect `"db":"ok"` and `"mint":"ok"`. **`"tmdb":"disabled"` is expected until the key is fixed. It means S1.5's guard is off.**
2. **S2:** snap a wine → Save → **Share** appears under the card → Show details → Share → text it to yourself → open it (signed in to Vercel, since this is a preview) and see the rich card with the long.
3. **S2:** snap a movie → Save without details → Share → open the link → reload after a minute and the long appears.
4. **S2:** snap a vitamin bottle → Save. **No Share appears.**
5. **S2:** open `<main preview>/a/00000000-0000-4000-8000-000000000000` → "This rek isn't here anymore."
6. **S3.6:** use the app normally for a few minutes: a search, a "+ More like this", a recipe, Show details. **Nothing should feel different**; the caps are invisible at human pace.
7. **S1.6 (PR #7 preview, joint session):** snap the Undertone poster and confirm no invented plot.

What it should feel like:
- [ ] Saving is instant; Share is the only new tap target, and only on a saved anchor.
- [ ] A shared page reads like the card you saved.
- [ ] No Share near anything health-related.
- [ ] Search, snap, details, chain and recipe all feel exactly as before.
- [ ] (After the key fix) no invented movie titles anywhere.

What to screenshot if it's wrong:
- the anchor area after Save;
- any shared page that doesn't match what you saved;
- the health JSON;
- any search or recipe that fails during normal use (that would be a cap misfire);
- Vercel log lines `[api-cap]`, `[snapshot]`, `[share]`, `[anchor-grounding]`.

### Production promotion checklist (§11.8)
**Production environment variables to add (Brad, in Vercel → Settings → Environment Variables → Production) before promoting `main → release/v2`:**
- `MINT_SIGNING_SECRET`: copy the **same value** that is in `.env.local` (and now in Preview). Don't generate a new one, or previews and production will sign differently. If it ever has to be rotated: `openssl rand -base64 48`, then update `.env.local`, Preview and Production together. Without it, Save/Share is invisibly off in production (the app degrades to today's behavior).
- `TMDB_API_KEY`: a **new, working** TMDb key (see BRAD MUST above). The current one is rejected (401).

**Migrations already live** (one database, shared by previews and production):
- `anchor_snapshots` (S2), backup `backups/2026-10-11-1300-s2.sql`;
- `api_usage` (S3.6), backup `backups/2026-10-11-1316-s3.6.sql`.
Both are additive. Rollback is the `drop table` in each SQL file's BLOCK 5; the code fails soft without either table.

**Revert SHAs if needed:** `c302ea5` (S2), `7255623` (S3.6).

**Production test residue:** `anchor_snapshots` holds 4 agent rows (`anon_agent_s2check_*`), all revoked. `api_usage` holds ~370 agent rows (`anon_agent_s36*`, `anon_agent_s16count_*`) that age out of the 24h window by themselves.

---

## Charter amendment §12 (the decision rule) — 2026-10-11 — committed directly to main (charter-only, on Brad's instruction) — no PR

SHIPPED:
- Charter §12 "The decision rule" appended verbatim to `docs/BUILD_CHARTER.md` (before the closing line). Docs only. §2 untouched.

FOUND, NOT FIXED: nothing.

BRAD MUST: nothing for this entry.

NEXT SESSION SHOULD KNOW:
- Every open choice in a plan now cites a precedent (§12.2), and anything that changes look or feel ships to a preview with its reasoning for Brad's phone (§12.4).

VALIDATION: none — docs only.

---

## Session 2.1 — health-tab-wall — 2026-10-11 — branch auto/s2.1-health-tab-wall — PR #9 (local agent mode, §11)

SHIPPED:
- **A health, medical or supplement snap shows only Similar.** "Use it for" and "Instead try" are gone for those anchors, and so is the toggle row (one pill is not a choice). Field case: Vitafusion → "take after exercising to support muscle recovery".
- **Why hide rather than neutralize (§12):** there is no neutral "Use it for" a supplement — any answer is a use instruction, i.e. the claim. A prompt rule only makes a claim less likely (the existing "never imply efficacy" rule let the field case through), and the FTC's Health Products Compliance Guidance (2022) holds benefit claims to scientific substantiation that a generated sentence never has. Precedents: the app's own anchor wall removes rather than weakens; the hide-vs-disable rule (NN/g): a control that can never be available in this context is removed.
- **Structural, server-first:** `/api/reksnap` empties `uses`/`alternatives` for a health anchor before the response leaves the server (`[health-wall] uses/alternatives withheld` tripwire), and the mode falls to `similar`. Backfill for those two modes on a health anchor → 403, no OpenAI call. Client twin in `RekSnapResults.tsx` (no tab row, Similar forced, the other lists emptied). Same gate as the anchor wall: `HEALTH_MEDICAL_CATEGORIES`.
- Edge fixed: the S1.5 "This one's new to me" notice now reads the title guard's own output, so a wall-emptied supplement never gets that voice.
- `validate-s21` **126/126**; regression s15 54, s2 97, s36 59; tsc clean. **Preview by machine: 19/19** — three real vitamin snaps (categories `vitamins`, `supplements`, `vitamins`) each 5/0/0, mode similar, no notice; backfill uses/alternatives 403, similar 200; wine control 5/5/5.

FOUND, NOT FIXED:
- The Similar list on a health anchor still runs on the existing conservative-health prompt rule. If a claim shows up there, the cure is a prompt change (joint session).

BRAD MUST: nothing (no env, no migration).

NEXT SESSION SHOULD KNOW:
- Any new list or surface on a snap result inherits this: health anchors get Similar only. Gate on `HEALTH_MEDICAL_CATEGORIES`, server first.

VALIDATION: folded into the combined §10.6 batch at the end of this chain.

---

## Session 2.2 — one-tap-share — 2026-10-11 — branch auto/s2.2-one-tap-share — PR #10 (local agent mode, §11)

SHIPPED:
- **Share is on every shareable anchor from the start.** Tapping it on an unsaved anchor saves it (same `handleSave`: mark, signal, mint), then opens the share sheet; the Save mark lights up, because sharing is keeping (the snapshot is the save, Ledger #18). Save alone still works and opens nothing. Health anchors still have no Share. Still one new tap target (`src/components/RekSnapResults.tsx`: `anchorShareable` no longer needs `savedNames`; `handleShareAnchor` saves first, after the `working` guard so a double tap can't save twice; the existing pending-mint await means one mint).
- **Why (§12):** §12.3 — Share used to appear only after Save, a prerequisite the user had to discover. §12.2 precedent: Share sits on the item itself in Spotify, YouTube, Apple/Google Photos, Google Docs and Notion, none of which require a prior save; Docs/Notion create the link on demand, which is what minting on the tap is.
- **Share is readable on the phone.** It was `#1E3A8A` on the phone's `#0b1725` background (~1.5:1; WCAG AA asks 4.5:1) — nearly invisible in the screenshot. Now light blue on mobile, unchanged on the white desktop layout. Pre-existing from S2; it mattered once Share was always on screen.
- **Real browser on the preview (Playwright, bypass header, `navigator.share` captured): 14/14.** Wine: Share visible before Save → one tap → one `/api/save` + one `/api/share` → sheet gets `/a/<uuid>` on the preview origin → anchor marked Saved → page 200; second tap re-sends the same link, no new mint. Movie: Save alone → mint only, no sheet, Share still there. Vitamin: no Share, no "Use it for"/"Instead try". Regression s2 97, s21 126; tsc clean.

FOUND, NOT FIXED:
- **Health anchors' Similar cards still make benefit and comparison claims.** Live vitamin snap on the preview: "enhanced absorption and immune support", "a more comprehensive antioxidant effect", "a slightly more potent formula"; the anchor short itself says "intended to support immune health". §2.2 says health anchors get "no comparisons". The cure is either code (health anchors show the anchor only, no list — one line in the S2.1 wall) or prompt (joint session). Brad's call; recommendation: anchor-only, for the same reason S2.1 hid the tabs — a prompt rule already failed here.

BRAD MUST: nothing (no env, no migration). Test the feel on the phone (§12.4).

NEXT SESSION SHOULD KNOW:
- The anchor's Share is now always on screen for non-health attested anchors; any future anchor affordance shares that row.
- The browser driver (Playwright, bypass header via `extraHTTPHeaders`, `navigator.share` stubbed in an init script, `setInputFiles` on the hidden snap input) lived in the session scratchpad. The header has its own app-level "Share" button with a `title`; target the anchor's with `button:not([title])`.

VALIDATION: folded into the combined §10.6 batch at the end of this chain.

---

## Session 2.3 — housekeeping — 2026-10-11 — branch auto/s2.3-housekeeping — PR #11 (local agent mode, §11)

SHIPPED:
- **`/api/health` now asks TMDb whether the key works**, instead of checking that one is set. `tmdb`: `ok` | `disabled` | `rejected` (401/403) | `unreachable` (network/timeout/5xx). One call to TMDb's `/3/authentication`, cached per process 10 min (1 min when unreachable), concurrent probes share one request, a changed key re-probes at once, `no-store` fetch, key never logged; tripwire `[health] tmdb key probe {state, status}` (`probeTmdbKey`, `src/lib/tmdbVerify.ts`). HTTP status and `ok` still mean "database reachable" — the keep-warm ping's contract. Real TMDb API: the current key → `ok`; bogus v4 and v3 keys → `rejected`. Preview: `"tmdb":"ok"`.
- **TMDb attribution**: "This product uses the TMDB API but is not endorsed or certified by TMDB." — small grey footer on every page (root layout), AA contrast on both backgrounds (gray-400 on the phone's dark, gray-500 on desktop white). Precedent: Letterboxd's footer credit.
- `validate-s23` **32/32**; regression s1 50, s15 54, s2 97, s36 59, s21 126; tsc + lint clean.

REPORT (no Vercel change): `SUPABASE_KEY` and `SURVEY_BONUS_TOKENS` are read nowhere and never appear in git history. `GLOBAL_DAILY_CAP` is read nowhere; its last reader was a site-wide cap in `pages_backup`, deleted 2026-01-03 (`ff08321`); S3.6's per-client caps replace it. All three are set in Development, Preview and Production and are dead.

FOUND, NOT FIXED:
- TMDb's terms also ask for their logo, less prominent than ours. A visual choice → Brad (§12.4).
- `TMDB_API_KEY` is set for Production and Preview but not Development (`vercel env ls`). Only `vercel dev` would notice. §11.3 lets a session add it; not in this run's ask.
- Option for Brad: make `tmdb: "rejected"` turn health red, so the external ping alerts on a dead key. Left off because it would also wake him for a DB-unrelated blip.

BRAD MUST: nothing required. Optional: delete the three dead variables in Vercel; decide the logo.

NEXT SESSION SHOULD KNOW:
- Health is now a real TMDb signal. `rejected` on production means every movie/TV rek is being dropped (the guard fails closed).

VALIDATION: folded into the combined §10.6 batch at the end of this chain.

---

## Chain close (S2.1 → S2.2 → S2.3) — local agent mode (§11) — 2026-10-11

**Merged (§10.3 + §11.4):** S2.1 health tab wall, PR #9, **`3f5737b`** · S2.2 one-tap Share, PR #10, **`81c2491`** · S2.3 housekeeping, PR #11, **`1dfa054`**. Each reverts on its own: `git revert -m 1 <sha>`.
**Charter:** §12 "The decision rule" appended, `2e0cf06` (Brad-authorized, charter-only).
**Carry-forward (§10.2), at start:** s1 50, s15 54, s2 97, s36 59, tsc clean; main preview health `db/tmdb/mint` ok. Brad had already put a working `TMDB_API_KEY` in Production + Preview and `MINT_SIGNING_SECRET` in Production (`vercel env ls`; `a5914c6`); the `.env.local` key now answers 200.
**§10.5 judgment call, recorded:** S2.1 and S2.2 both list the same carried item (claims in the health Similar list). Read as one finding restated, not two sessions piling up in one file; S2.3 touched different files, so the chain continued. Brad may read it stricter.
**Open from earlier:** PR #7 (S1.6, VOICE) — its TMDb blocker is gone; the next local session can re-run its counts against the live API.

### Banked for later (Brad's instruction — do not build yet)
- **Wine anchors and reks missing producer names.** "Primitivo 2023", "Zinfandel 2022": unfindable on a shelf. A wine name without a producer is not a decision. Touches the wine grammar / vision prompt → likely a joint session.
- **Dependency/security upgrade as its own session.** 28 `npm audit` findings; Next 14. Its own branch, its own plan, full harness + preview regression.

### Found in this run, for Brad
- **Health anchors' Similar cards still make claims** ("enhanced absorption and immune support", "more potent formula"; the anchor short: "intended to support immune health"). §2.2 says no comparisons on health anchors. Recommendation: anchor-only for health (one line in the S2.1 wall), for the same reason the tabs were hidden — the prompt rule already failed here.
- TMDb logo (their terms ask for it) — a visual call.
- Three dead Vercel variables: `SUPABASE_KEY`, `SURVEY_BONUS_TOKENS`, `GLOBAL_DAILY_CAP` (read nowhere).

### Brad's twenty minutes — combined (§10.6), against the main preview
Main preview: https://rekomendr-git-main-brad-asselins-projects.vercel.app (S0 → S3.6, plus S2.1, S2.2, S2.3).

What to do, in this order:
1. Open `<main preview>/api/health`. Expect `"db":"ok"`, `"mint":"ok"`, `"tmdb":"ok"` — the TMDb value is now a real check against TMDb, not just "a key is set".
2. **S2.1:** snap a vitamin or supplement bottle. Only the anchor and one list of similar products; no "Use it for" / "Instead try" pills at all, and no Share.
3. **S2.1 control:** snap a wine. All three pills are there as before.
4. **S2.2:** on that wine, without tapping Save, look under the card: **Share** is already there, readable on the dark background. Tap it → the share sheet opens → the bookmark (Save) fills in. Send it to yourself and open it.
5. **S2.2:** snap a movie and tap **Save** only. Nothing opens; Share is still there if you want it later.
6. **S2.3:** scroll to the bottom of the home screen: one small grey line about TMDB.
7. Use the app normally for a few minutes: a search, "+ More like this", a recipe, Show details. Nothing else should feel different.

What it should feel like:
- [ ] A supplement snap feels calm and plain — nothing that reads like dosing or health advice in the tabs (because there are none).
- [ ] Share is one tap, from the first second; you never have to think "save first".
- [ ] After sharing, it's in your saved things without you asking.
- [ ] Share reads clearly on the phone; it doesn't shout.
- [ ] The TMDB line is easy to miss, which is the point.
- [ ] Wine, food and movie snaps are otherwise exactly as before.

What to screenshot if it's wrong:
- a supplement snap showing pills or a Share;
- the anchor area before and after tapping Share;
- the bottom of the home screen;
- the health JSON if `"tmdb"` isn't `"ok"`.

### Production promotion checklist (§11.8)
**Production environment variables to add:** none new this run. `MINT_SIGNING_SECRET` and `TMDB_API_KEY` are already in Production (Brad, today; names confirmed with `vercel env ls`, values not read). After promoting, `<production>/api/health` should show `"tmdb":"ok"` — now a real TMDb check.
**Optional cleanup (Brad):** remove `SUPABASE_KEY`, `SURVEY_BONUS_TOKENS`, `GLOBAL_DAILY_CAP` from every environment — nothing reads them.
**Migrations this run:** none. Already live from the previous run: `anchor_snapshots` (backup `backups/2026-10-11-1300-s2.sql`), `api_usage` (backup `backups/2026-10-11-1316-s3.6.sql`).
**Revert SHAs if needed:** `3f5737b` (S2.1), `81c2491` (S2.2), `1dfa054` (S2.3); earlier this day `c302ea5` (S2), `7255623` (S3.6).
**Production test residue added this run:** `anchor_snapshots` gained 6 agent rows from three browser runs (fresh Playwright `anon_*` clients): three Sainte Magdeleine wine shares — **all three revoked after the run** (the link now 404s, checked) — and three private Winchester '73 saves. `api_usage` gained rows from the preview checks; they age out of the 24h window.

---

## Charter amendment §10.5 — 2026-10-11 — committed directly to main (charter-only, on Brad's instruction) — no PR

SHIPPED:
- **BRAD-AUTHORIZED CHANGE (2026-10-11): §10.5** stop condition now reads "two consecutive sessions logging NEW found-not-fixed items in the same file". A carried item restated in a later session no longer halts a chain. Settles the judgment call recorded in the S2.1→S2.3 chain close. §2 untouched.

FOUND, NOT FIXED: nothing. BRAD MUST: nothing. VALIDATION: none — docs only.

---

## Session 2.4 — health-anchor-only — 2026-10-11 — branch auto/s2.4-health-anchor-only — PR #12 (local agent mode, §11)

Brad's decisions (2026-10-11): (1) health anchors show no rek list, one quiet plain-voice line instead — Brad tests the wording; (2) TMDb logo beside the footer attribution; (3) TMDb status stays out of the alerting `ok` flag — no code; (4) §10.5 amended — on main, `f03880f`.

SHIPPED:
- **A health, medical or supplement snap shows the anchor and nothing under it**: no pills (S2.1), no cards, no Share. One grey line under the title: *"Rekomendr doesn't recommend health products."* It rides the anchor card's existing `markerLine` slot (the S1 quiet line: no chrome, no tap target), so it reads as a fact about the app, not an error or a badge (§12.2: the app's own precedent). Save and thumbs on the anchor are unchanged.
- **Server first:** `/api/reksnap` withholds `similar` too (all three lists empty for a health anchor; tripwire `[health-wall] rek lists withheld`); backfill refuses every mode for a health anchor (403, no OpenAI call). The "new to me" notice still never shows on a supplement. Client twin empties every list.
- **TMDb logo** beside the footer notice: TMDb's official "blue_short" SVG (themoviedb.org/about/logos-attribution), `public/tmdb-logo.svg`, 2 KB, inspected before it went in (shapes, one gradient, internal reference only; no script, no external link). 10 px tall — less prominent than ours, per their terms — and not a link.
- `validate-s21` updated to the decision, **133/133**; `validate-s23` **35/35** (logo asserted); regression s1 50, s15 54, s2 97, s36 59; tsc clean. **Preview, real browser: 31/31** — three real vitamin snaps (`health`, `supplements`, `vitamins`): server sent 0/0/0, the line on screen once, only the anchor card, no pills, no Share, no notice; wine control: three pills, cards, Share, no line; logo loads at 77×10 on phone and desktop, no link.

FOUND, NOT FIXED (NEW):
- **The health anchor's own short profile still makes benefit claims.** Live snap: "providing antioxidant support for immune health… designed to enhance overall wellness". The vision prompt's EXCEPTION asks for "one plain, factual identifying sentence only" (`app/api/reksnap/route.ts`, the SYSTEM_PROMPT health EXCEPTION line); the model writes two sentences of claims. The cure is prompt text → joint session (§2.3/§5), or a code option for Brad: replace a health anchor's short with the product name and category only.
- The vision call still generates three lists for a health snap that the server then discards (token cost only). Skipping it is a prompt change.

BRAD MUST: test the line's wording on the phone (§12.4).

NEXT SESSION SHOULD KNOW:
- A health anchor now has no rek surface anywhere. Any new surface on a snap result inherits that: gate on `HEALTH_MEDICAL_CATEGORIES`, server first.
- Long branch names get shortened in Vercel's alias (`…-git-auto-s24-health-anc-e99917-…`); read the preview URL from the Vercel bot's PR comment rather than building it.

VALIDATION (verbatim from PR #12's "Brad's twenty minutes", against the main preview after merge):
- What to do: (1) Snap a vitamin or supplement bottle. (2) Snap a wine. (3) Scroll to the bottom of the home screen.
- What it should feel like: [ ] the supplement shows the anchor and one small grey line — "Rekomendr doesn't recommend health products." — and nothing under it: no pills, no cards, no Share; [ ] the line reads calm and plain, a fact, not an error — your call on the wording; [ ] the wine is exactly as before; [ ] at the bottom, a small TMDB logo beside the grey notice, quieter than the Rekomendr mark.
- What to screenshot if it's wrong: the whole supplement snap; the bottom of the home screen.

---

## Session 2.5 — health-anchor-short — 2026-10-11 — branch auto/s2.5-health-anchor-short — PR #13 (local agent mode, §11)

Brad's decision (2026-10-11): the code fix for S2.4's NEW found-not-fixed item. A health anchor's description becomes the product name and category only. The S2.4 quiet line stays. No long tier. Gate it on the same server-side category check as the tab wall. The AI instructions stay unchanged. Log the token cost of the three discarded lists for the joint session.

**§10.2 carry-forward:** S2.4 re-verified before building: `validate-s21` 133/133, `validate-s23` 35/35, tsc clean.

SHIPPED:
- **A health anchor's short is built in code, never taken from the model:** `"<name> · <Category>"` (`healthAnchorShort` in `src/lib/categoryGates.ts`). Example: *"Tylenol Extra Strength Rapid Release Gels · Medication"*. `/api/reksnap` replaces it **before signing**, gated on `anchorIsHealthMedical` (the tab-wall check). So the model's sentence never leaves the server, and the token covers only the replacement: no save, backfill, chain or detail request can bring the model's text back. Tripwire: `[health-wall] anchor short replaced`.
- **Long tier:** already 403 on the server for health. The client also stops passing `long` to a health card, on top of `expandable=false`.
- **Save paths:** the snapshot mint was already refused at `/api/save` (403), at completion, at share and on the public read. The client now skips that doomed mint request. A Save still marks the anchor and writes its signal, which holds name and category only.
- **Client twin:** the card renders the same `healthAnchorShort(...)`, so it holds even against an older server.
- **Token cost, measured (no estimate):** `[health-wall] rek lists withheld` now carries `promptTokens` and `completionTokens`.
- `validate-s21` **165/165** (32 new: four health categories × short replaced / claim absent / tripwire / usage logged / token signs the replacement / token refuses the model's sentence; wine positive control; Show details 403 with no OpenAI call; four client-source asserts). Regression: s1 50, s15 54, s2 97, s23 35, s36 59. tsc clean.
- **Preview, real browser, real photos: 45/45.** Vitamin (*Sundance Vitamin C 1000 mg with Rose Hips · Supplements*), pain reliever (*Tylenol Extra Strength Rapid Release Gels · Medication*), skincare (*Nivea Creme · Skincare*). Each one: health category; the server short is exactly name · Category; it is on screen; the quiet line shows once; no Show details; no rek cards, pills or Share; Save marks the anchor and sends no `/api/save`; no detail request ever; a direct detail probe with the anchor's own valid token → 403. Wine control (Sainte Magdeleine): the model's own sentence, three pills, cards, Share, Show details, no line.

**For the joint session — the three wasted lists (measured on the preview, 3 health snaps):** every health snap is **5,083 prompt tokens + 819–994 completion tokens** on the vision call (gpt-4o). The server throws away 15 reks. The prompt tokens get paid either way, because the image and the system prompt are needed to identify the item. The skippable part is almost all of the completion: roughly 750–930 of those tokens are the three lists (the anchor's name, category and description are a few dozen). Skipping them is a prompt change (a "health → detected_item only" instruction), so it stays in the joint session. It would also shorten health-snap latency.

FOUND, NOT FIXED (NEW): nothing.
- Observation, not a defect (Brad's feel call, §12.4): on screen the card now shows the name twice, as the title and again in the short ("Tylenol … Gels" / "Tylenol … Gels · Medication"). That is literally "product name and category". If it reads redundant on the phone, the one-line alternative is to show just the category (e.g. "Medication") in the short slot.

BRAD MUST: look at one health snap on the phone and judge the name-twice point above.

NEXT SESSION SHOULD KNOW:
- A health anchor's text is now the code's, end to end: `healthAnchorShort` is the only short a health anchor can carry, because the token signs it. Any new surface that shows anchor text inherits it for free. Don't read `detected.description` directly for a health anchor.
- On Windows the `validate-*.cjs` harnesses call `npx` without a shell and fail with `spawnSync npx ENOENT`. Run them with a preload that sets `shell: true` (`node -r <shim> scripts/validate-*.cjs`). The scripts themselves weren't changed.

VALIDATION ("Brad's twenty minutes", against the main preview after merge):
- What to do: (1) Snap a vitamin or supplement. (2) Snap a pain reliever (Tylenol, Advil). (3) Snap a skin cream. (4) On one of them, tap Save. (5) Snap a wine.
- What it should feel like: [ ] each health snap shows its name, the grey line, and under it only "<name> · <category>" — no sentence about what it does; [ ] no "Show details", no cards, no pills, no Share; [ ] Save fills in quietly and nothing else happens; [ ] the wine is exactly as before, with its own description and Show details; [ ] your call: is the name appearing twice fine, or should the short be just the category?
- What to screenshot if it's wrong: the whole health snap; any health card that shows a sentence.

---

## Session 2.6 — health-anchor-category — 2026-10-11 — branch auto/s2.6-health-anchor-category — PR #14 (local agent mode, §11)

Brad's decision (2026-10-11): under the title, a health anchor shows only its category ("Medication", "Supplements", "Skincare"), not "name · category". The title already names the product. Same server-side path.

**§10.2 carry-forward:** S2.5 re-verified first: `validate-s21` 165/165. S2.5 merged as `89b742e`.

SHIPPED:
- `healthAnchorShort(category)` returns the capitalized category alone. The server path is unchanged from S2.5: the short is replaced in `/api/reksnap` before `signAnchor`, gated on `anchorIsHealthMedical`, and the token signs the category text. The client twin calls the same helper.
- `validate-s21` **166/166** (S2.5 expectations updated, plus one assert that the name isn't repeated). Regression: s1 50, s15 54, s2 97, s23 35, s36 59. tsc clean.
- **Preview, real browser, real photos: 45/45.** Vitamin → "Supplements"; Tylenol → "Health"; Nivea → "Skincare". Each: the short is the category alone, no name repeated, the line once, no Show details / cards / pills / Share, Save sends no `/api/save`, a detail probe with a valid token → 403. Wine control unchanged.

FOUND, NOT FIXED (NEW): nothing.
- Observation for Brad (feel, §12.4): the word shown is the vision model's own category, and it varies between snaps of the same item. Tylenol came back "medication" in S2.5 and "health" in this run, so the card said "Health" this time. It is still always a word on the health wall, never a claim. If you want a steadier label, a small display map (e.g. medication/drug/otc → "Medication", vitamin/supplement → "Supplements", skincare/cream/lotion → "Skincare", the rest → "Health") is a code-only follow-up.

BRAD MUST: nothing beyond the phone check below.

VALIDATION ("Brad's twenty minutes", against the main preview after merge):
- What to do: snap a vitamin, a pain reliever and a skin cream; then a wine.
- What it should feel like: [ ] each health card shows the product name, the grey line, and one word under it (e.g. "Supplements"); [ ] the name isn't repeated; [ ] wine exactly as before; [ ] your call: is a varying word ("Health" vs "Medication" for the same bottle) fine?
- What to screenshot if it's wrong: the whole health snap.
