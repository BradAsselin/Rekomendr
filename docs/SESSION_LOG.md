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

## Session 1 — staleness — 2026-09-12 — branch auto/s1-staleness — PR #2

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
2. Merge PR #2 after the twenty minutes pass.
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
- Preview URL: the Vercel bot's comment on PR #2.
- What to do: (1) **Run the SQL first** — `docs/sql/s1-watched-signal.sql`, Block 1, then 2, then 3, then 4. (2) On your phone, open the preview. Movies → type **"something clever"** → GO. Read all five. (3) Do that on five separate nights across the week, on at least three different lanes, and each time count: is there a card you can't wait to watch? (4) Look above the five for **Your shortlist** — chips of things you liked and never got to. Tap one. (5) Tap **"Watched it"** on that chip. (6) Search again in the same visit — the strip is still there, that title is gone from it. (7) Watch for a card with a grey line under the title: *"You liked this in July."*
- What it should feel like: [ ] at least one card in the five you can't wait to watch, **four nights out of five**; [ ] a cold search reads like the app's best picks, not its deepest cuts; [ ] the shortlist chips are YOUR real liked titles, in the right order; [ ] exactly one new tap target — the chip; nothing else on a card grew; [ ] "Watched it" removes the title and it never comes back; [ ] the resurfacing line reads as a quiet memory, not a badge.
- What to screenshot if it's wrong: the whole phone screen with the strip and all five cards; any card that reads as a deep cut on a cold search; the strip if a title you've watched is still in it.
- Paste-block: `docs/sql/s1-watched-signal.sql` — expected output is named under each block in the file.
