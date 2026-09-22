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
