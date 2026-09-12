# REKOMENDR — BUILD CHARTER
**Phase: "Taste memory that illuminates" — September 2026**
**Read this document in full at the top of every autonomous session. It is the goal, the fence, and the route.**

---

## 0. How to use this document

You are Claude Code, running an autonomous session on the `Rekomendr-App` repository. Brad — the founder, a non-coder behavioral economist — is not watching. He will see only two things from your session: **a pull request** and **a Vercel preview URL**. He validates by using the preview on his phone. His ear is the only pass/fail instrument for anything involving feel.

Your job is to reach the **goal in §1** by executing **one session from §6** per run, inside the **invariants in §2**, under the **operating rules in §3**, and to stop at the **acceptance test** for that session. You own the route. Brad owns the destination and the veto.

When this document and any older doc in `docs/` disagree, this document wins. When this document and Brad's margin notes (§7) disagree, Brad's notes win.

---

## 1. The goal

Rekomendr is a **decision compression engine**: snap or type one thing, get a usable decision in under a minute, with very little effort, from a voice like a knowledgeable friend across a table.

The measurable feel this phase must deliver, in Brad's words:

> **Friday, 9pm. "I feel like something clever." → a movie I can't wait to watch, in under ninety seconds, five nights out of five.**

And its wine twin:

> **Standing at a shelf of bottles I've never heard of → I know which one is for me, described in terms of a wine I already love, before the person next to me finishes reading one label.**

Every mechanism in the app either serves those two sentences or it changes. The current failure they name is **staleness**: two months of taste memory used only to *subtract* (exclusions, avoid-lists, shading, "next shelf down") produced reks that feel obscure, flat, and "trying too hard to get to know me." This phase turns taste memory into something that *illuminates* — makes the unknown legible in terms of what the user already loves — and gives excitement a home the app can show again.

Field validation is the only validation. Six wows on the ledger share one beat: *the app understood something I thought only a person could understand.* Recognition, not retrieval. Build toward that beat.

---

## 2. Invariants — no session may cross these

1. **The firewall is the moat.** Every rek is chosen on user fit first; any link (watch, buy, share) is attached after, never the reverse. Never steer toward a paying link. Send the user where the thing actually is.
2. **Health and medical stay behind a hard wall, everywhere.** Health anchors: no verbs, no chaining, no sharing, no comparisons, no enrichment. `NON_RECIPE_CATEGORIES` / `anchorIsHealthMedical` gates are structural, not conditional. Extend the wall to every new surface (panel, share, benchmark) before the surface ships.
3. **Katrina's standing order: the snap-lane rek voice is locked** ("perfect — don't mess them up"). `DIFFERENTIATOR_VOICE`, `USES_VOICE`, and the wine verdict grammar do not change in autonomous sessions. Voice work is **joint-session only** (§5). Autonomous sessions may *prepare* voice diffs (§3.9) but never merge them.
4. **Honest-short over canned-full.** Never pad AI results with pool data. Never route high-intent users to canned silently. A silent failure is worse than a wrong answer — every fail-soft path gets a server-side tripwire that names the failure.
5. **Anchor grammar holds.** The snapped/typed item is the subject; it never dismisses; its identity doesn't flip when the pills do; it reads as an answer, not a menu (at most one instinctive verb collapsed). Position is meaning: LEFT learn / MIDDLE complete / RIGHT continue; top-right = verdict cluster (Save + thumbs); decided trail above, undecided frontier below.
6. **One new affordance per feature, maximum.** If the collapsed UI of any surface grows more than one new tap target from a session, the design is wrong. Modes are forbidden; slots are allowed.
7. **Human recommendations only.** No platform imports, no aggregating other apps' lists, no rebuilding the Google info page, no licensed review data on cards. Crowd data may be plumbing (quality floor), never surface.
8. **Production is untouchable from a session.** `release/v2` deploys production. Sessions never push to `release/v2` or `main`. Branch → PR → preview → Brad merges. No exceptions, including "tiny."
9. **Schema changes ship as SQL in the PR, never executed by the session.** Every `CREATE TABLE` includes explicit GRANTs and REVOKEs (anon/authenticated) and RLS enabled with zero client policies unless the charter says otherwise. Every policy that joins through another table gets that table a matching read policy. Every adversarial suite includes a **positive control**.
10. **The model is gpt-4o-mini + the tuned prompts.** No model swaps, no reasoning-tier models. Both flagship pilots were run and closed in August; `ANTHROPIC_API_KEY` in `.env.local` is dev-only and not to be used in product code.
11. **Timeouts sit above the p99 of legitimate completions** — hang protection, never a latency SLA. Any timeout extension re-audits every response landing site (a request that lives longer arrives later).
12. **Two-tier exclusion canon:** an uncapped drop-set at the single response site is the guarantee; the capped prompt avoid-list is pressure. Guarantees never truncate.

---

## 3. Operating rules for autonomous sessions

1. **One session per run, one branch per session:** `auto/s<N>-<slug>`. Base and PR target: `main`. Never rebase or force-push.
2. **Plan before plumbing.** Write the plan as the first section of the PR description *before* editing: files, mechanism, races considered, blast radius, what is deliberately out of scope. If the plan reveals the session is bigger than one run, split it and say so.
3. **Read before writing.** `docs/` blueprints and traces are the spec (`s3-shareable-anchors-blueprint.md`, `s3-build-plan.md`, `s3-minting-integrity.md`, `typed-lane-trace.md`, `typed-lane-anchor-contract.md`, `category-mislabel-diagnosis.md`, `slice3-pills-plan.md`, `pool-copy-rewrite.md`). A carried bug list can outrun reality — readback from disk before acting on any "known issue."
4. **Scope fence in the PR title's first line**, e.g. `[S2] Staleness: freshness slot + shortlist strip — no persistence, no schema, no prompt voice changes.` Anything outside the fence goes in the PR's "Found, not fixed" section, not in the diff.
5. **Commit working states.** Small commits, descriptive messages, `tsc --noEmit` clean before every commit. Never leave the branch mid-refactor.
6. **Verify by readback, not by summary.** Grep the file after every edit. Diff surface must match the plan; an unexplained file in `git status` gets one readback before proceeding.
7. **Tripwire everything new.** New fail-soft path → new server-side log line that names the failure. New env dependency → boot-time check. New generation site → the `[prompt-diag]`-style fingerprint (dev only).
8. **When blocked, stop and write — never guess.** Missing secret, ambiguous spec, a Q-list call not yet marked, a migration that must run first: put a `BLOCKED:` section at the top of the PR description with the exact paste-block or decision Brad needs, and end the session. A stalled PR costs nothing; a guessed migration can cost the database.
9. **Voice work is prepare-only.** Sessions may draft prompt tunes on a branch **with a counted-generation report attached** (run the affected generation path 5+ times via a script against the text-only branches, count the target construction before/after), but the PR is labeled `VOICE — joint session required` and is never a candidate for merge from a validation batch.
10. **Stale-bundle discipline.** `buildAIPrompt` runs client-side. Any prompt change must be validated against a *fresh* bundle, and any validation report must include the fingerprint markers from the request log (`hasSimulationClose`, `hasBannedRegister`, `hasExpectLine`, `hasPrimeRule`).
11. **Never run `scripts/generatePoolCopy.ts`** unless the session is explicitly the pool-copy session.
12. **End every session by appending to `docs/SESSION_LOG.md`** (format in §8): what shipped, what was found-not-fixed, what Brad must do, what the next session should know. Fable's memory is not the record; the log is.

---

## 4. Acceptance — Brad's validation batch

Every PR ends in a section titled **"Brad's twenty minutes"** written in user terms only — no buffer formulas, no epoch guards, no p99 math. It contains:

- The preview URL.
- **What to do**, as a numbered list of taps and searches on a phone ("Run three fresh Romance + Weird/Offbeat searches. Snap a wine. Open the panel.").
- **What it should feel like**, as a checklist he can tick or cross.
- **What to screenshot if it's wrong.**
- The paste-block (SQL / env / dashboard step) if any, labeled and with expected output.

The pass criterion for any feel-level change is **counted, not felt on one screen**: three generations minimum, and the target construction counted across all of them. Brad's own rule: at polish level, the model's variance equals the defect size; single screenshots prove nothing.

Brad merges. Production promotion is a separate PR from `main` → `release/v2` that Brad opens when a batch of merged PRs has been validated on preview.

---

## 5. Joint sessions (Brad + terminals hot) — NOT autonomous

- **The voice round:** search-lane S1-S2 re-fire (summary-verb and "leading to" bans against the simulation-close rule mass; ~8 leaks counted Aug 1) + VARY THE ENTRY hardening against the "You'll find yourself…" gravity well + snap-lane anchor band fix ("Built for X, not Y" mold, 10/10 across Costco/Mackinac/Brys; stock differencing template) + the "casual sip" negation leak + the "aromatic experience" descriptor-inventory drift. Evidence file: Brad's August screenshots. Autonomous sessions may *prepare* these diffs per §3.9.
- **Any decision in §7 that Brad hasn't marked.**

---

## 6. The session sequence

Sessions are ordered by dependency and by leash: the boring one runs first so the leash is observed before the sessions that matter. Each session = one branch, one PR, one "Brad's twenty minutes."

### Session 0 — Charter + ops hardening (code half)
**Goal:** the app cannot die of neglect again, and every silent failure has a voice.
- Commit this charter to `docs/BUILD_CHARTER.md` and create `docs/SESSION_LOG.md`.
- **Supabase keep-warm:** a lightweight `/api/health` route that touches the database, plus a Vercel cron (or documented external ping) hitting it every 12 hours. Free-tier pause is a two-week fuse; this defuses it.
- **OpenAI failure surfacing:** when generation fails with `insufficient_quota` / 401 / 429, the user-facing empty state says so honestly in *plain voice* (machinery, not Reks Ray — the persona owns AI moments, plain voice owns failures), and the server logs the reason. Two-week silent outage on Sept 11 is the body.
- **Staleness guard (S3.1 from the typed-lane trace):** activity stamp + `pageshow` reset via existing `resetToHome` if older than N hours. Kills the January-bundle resurrection class.
- **Permanent dev-only `[prompt-diag]` fingerprint** on the generation route (markers: `hasSimulationClose`, `hasBannedRegister`, `hasExpectLine`, `hasPrimeRule`), gated to non-production.
- Extend the boot-time env-mismatch warning to cover every Supabase/OpenAI env pair.
- Housekeeping: `npx update-browserslist-db@latest`; retire-or-wire the orphaned `buildMoviePrompt.ts`/scorer (document the call).
- **Out of scope:** SMTP/Resend (dashboard work — write the paste-steps into the log for Brad), OpenAI auto-recharge (Brad, done Sept 11), any prompt change.
- **Acceptance (Brad's twenty minutes):** preview loads; one snap and one search behave exactly as production; the log section shows the health route returning OK; the honest-failure copy is shown in a screenshot the session captured by simulating a quota error in dev.

### Session 1 — Staleness: the frontier learns to remember excitement
**Goal:** five nights out of five, at least one card in the first five reads as *can't-wait-to-watch* — including familiar and beloved-but-unwatched titles.
- **The Shortlist strip:** liked-but-not-watched titles (from `user_likes` for the active category, newest first) rendered as a compact horizontal strip above the frontier on the search lane, persistent across searches within the visit. This is the recall home in its minimum viable form — the pen made visible. Tap = expand-in-place (title→Google stays for media per the August decision). No new schema; reads through the existing `/api/prefs` route (category-casing normalization: fix `Movies` ≠ `movies` here, it bites this strip first).
- **The freshness slot:** exactly one of the five frontier positions (default: position 3 — Brad may re-mark) is exempt from the "next shelf down" instruction and from the *liked*-exclusion (never from the disliked-exclusion): it may be canon, familiar, or a liked-unwatched title resurfacing, and its card carries a quiet marker when it's a resurfacing like ("You liked this in July"). The landmark slot's real job.
- **Soften "next shelf down":** apply only under exclusion pressure (when `markedCount` is large), never on a cold search with a short avoid-list. A cold Friday search should read like the app's *best* picks, not its deepest.
- **Watched vs liked:** add the `watched` signal type (schema SQL in the PR, not executed): a "Watched it" action on Shortlist cards and expanded cards. Watched titles leave the Shortlist and are excluded from the frontier permanently; liked-unwatched titles stay eligible for the freshness slot. This is the taste-vein arc's first real signal.
- **Out of scope:** panel/hamburger, sharing, prompt voice changes (prepare-only per §3.9 if the session touches the register line).
- **Acceptance:** Brad runs five fresh searches across three lanes over a week on the preview and counts sets containing a card he can't wait to watch (target ≥ 4/5); the Shortlist shows his real liked titles; one search shows a resurfaced like with its marker; "Watched it" removes a title from the strip and it never returns to the frontier.

### Session 2 — S3: shareable anchors (the snapshot IS the save)
**Goal:** a saved item opens back up and tells you what you saved; a share link shows the anchor to someone with no account.
- Per `docs/s3-shareable-anchors-blueprint.md` and `docs/s3-build-plan.md`: `anchor_snapshots` table (UUID pk = unguessable token; RLS on, zero client policies; service-role routes; public reads filter `shared_at is not null`; private rows indistinguishable from nonexistent). Snapshot minted at **save-tap**, full rich profile (short + long + mode + category); Share flips `shared_at`. Never regenerated: page + OG render columns only, no OpenAI import (DoS posture for public URLs). Health anchors unshareable at every layer (no affordance, 403, 404). Server-verified payloads only (mint from server-generated anchors). `next/og` for the preview image; add `metadataBase` to `layout.tsx`; `?v=N` cache-busting for design iterations.
- **Out of scope:** the panel, deep links/Universal Links, watched-signal capture beyond S1.
- **Blocked-by:** any Q-list call in the blueprint Brad hasn't marked → `BLOCKED:` per §3.8.
- **Acceptance:** Brad saves a wine and a movie on the preview, pastes the migration SQL when prompted, taps Share, texts himself the link, opens it in Safari signed-out and sees the rich card with an image preview in iMessage; tries a health anchor and finds no Share; tries a guessed URL and gets 404.

### Session 3 — S4: the panel (Recent · Saved · Shortlist · Favorites)
**Goal:** every decision the app ever helped with is one tap away, and tapping it puts the anchor back on top.
- Hamburger top-left, AI-chat-list pattern. **Recent** = landing tab; emergent category headers (S1's honest rek categories feed this); **Saved** (from `anchor_snapshots`); **Shortlist** (the S1 strip, now with a home); **Favorites** = a promoted tier *within* Saved (star inside the panel — never a second keep-gesture on cards; the heart stays dead). Tap any item → front door with that anchor on top, mode restored. "Watched it" available on Recent/Shortlist items. `account_devices` read-own policy already exists (Aug 1).
- Cross-search recall: this retires the "MLT feeds the pen" interim and the "search trail clears on new search" limitation — the trail can stay session-scoped because the panel is the visit-scoped home.
- **Out of scope:** benchmark slot, share polish.
- **Acceptance:** Brad opens the panel and sees the last week of his real snaps and searches grouped sensibly; taps a saved wine and lands on it as the anchor; stars a favorite and finds it in the tier; nothing about the card page grew a new control.

### Session 4 — The benchmark slot (compare-to-what-I-love)
**Goal:** an unknown wine is described in terms of a wine the user has tasted.
- **One pinnable referent slot.** Default referent = the anchor (today's behavior, unchanged). One affordance on the anchor — `Compare to…` — opens a one-tap picker: the last few *Saved* items in the anchor's category (most recent first, most recent as the single-tap default) or "Snap another." Once pinned: the referent renders on top with the accent; the anchor is re-characterized **relative to the referent**; the five reks are **placed against the referent** (placement, not extrapolation — trajectory-walking remains the chain's job); every subsequent snap in the session inherits the pin; Save/dismiss on candidates writes signals tagged with the referent id (attribute-level signal for free).
- **Grounding rule:** the referent's *saved snapshot text* goes into the prompt as the comparison base — the model compares against the user's validated description, never its own recall of the wine. This is the structural kill for stock-template comparisons.
- **Referent naming:** with a pinned benchmark, each comparative names it once ("than your Bonanza") — this deliberately reverses the July referent-echo ban for the pinned case only; the bare-comparative default stays when the referent is the on-screen anchor.
- Snap-to-compare (second snap as referent) re-anchors rather than joins; the panel/tray holds the history.
- Health wall: health anchors can neither be referents nor candidates.
- **Out of scope:** search-lane benchmark (seeded search already is one), shelf-reading, value/price.
- **Acceptance:** Brad snaps an unfamiliar Cab, pins Bonanza in one tap, and reads an anchor card that tells him how it differs from Bonanza in the axis language he knows; snaps the next bottle and sees it placed against Bonanza without re-pinning; saves one and dismisses one; reads one comparative that could *only* have been written from Bonanza's saved description.

### Session 5 — Quality floor (generation-side, anchors exempt)
**Goal:** Rekomendr never recommends a movie broadly agreed to be bad — quietly, with no score on the card.
- TMDb `vote_average` + `vote_count` lookup per rek title before shipping; per-lane floors (defaults for Brad to re-mark: drama/general 6.9, comedy 5.0, horror 5.5, documentary 7.2; minimum vote count 500); anchors and typed/snapped inputs **always exempt**; floor relaxes toward the anchor's own score when the anchor is low-rated (a guilty pleasure's neighborhood shouldn't strand it); full floor on cold searches; unverifiable/unmatched titles **pass** (the floor catches known disasters, not obscurity); dropped titles are covered by the existing over-ask sizing; drops instrumented in the `[short-sets]` log. Movies/TV only in v1. No score rendered anywhere.
- **Acceptance:** Brad runs five searches and finds no card he'd call a dud; the log shows the drop counts; a snapped guilty-pleasure anchor still gets five reks.

### Session 6 — Share polish + deep links
Per `docs/s3-build-plan.md` S5: Universal Links config (three silent failure points documented), landing page as fallback, cache-busting verified with the iMessage/WhatsApp validators. Lowest priority; can slip.

### Prepared-only (any session with headroom, per §3.9)
- The voice round diffs with counted-generation reports (search S1-S2 re-fire, VARY THE ENTRY hardening, snap anchor band fix, "casual sip" negation, descriptor-inventory drift).
- Pool copy rewrite per `docs/pool-copy-rewrite.md` (data-only; the one-button first impression still carries pre-July-3 grammar).
- Typed-lane anchor contract per `docs/typed-lane-anchor-contract.md` (design doc → implementation proposal; required before any `?q=` deep-linking).
- Media-adjacent verb pairs (music/books/games — Listen / Read).
- Search-lane signals schema pass (`chain_depth`/`chain_origin` on `user_likes`).

---

## 7. Brad's calls — mark in the margin before the relevant session runs

Sessions that reach an unmarked call stop with `BLOCKED:`. Defaults are Claude's recommendation; strike and replace as needed.

1. **Freshness slot position** — default: position 3 of 5. (Alternative: position 1, "the one you'll recognize"; or 5, "the safe landing.")
2. **Resurfacing likes: marker copy** — default: a quiet grey line, "You liked this in July." (Alternative: no marker; or a small ↺ glyph only.)
3. **Quality floor tiers** — defaults in Session 5. Confirm or adjust per lane; confirm minimum vote count 500.
4. **Benchmark picker default** — default: most recent Saved item in the category is the one-tap pin; picker shows the last five. (Alternative: Favorites first.)
5. **Panel landing tab** — default: Recent. (Alternative: Shortlist.)
6. **S3 blueprint Q-list** — the seven open questions in `docs/s3-shareable-anchors-blueprint.md §6`; mark them in that file.
7. **Production promotion cadence** — default: Brad opens `main → release/v2` after each validated batch. (Alternative: after every merged PR.)

---

## 8. `docs/SESSION_LOG.md` — format

Each session appends one entry:

```
## Session <N> — <slug> — <date> — branch auto/s<N>-<slug> — PR #<n>
SHIPPED: <one line per change, user terms first, file/mechanism second>
FOUND, NOT FIXED: <anything outside the fence, with the file and line>
BRAD MUST: <paste-blocks, decisions, dashboard steps — or "nothing">
NEXT SESSION SHOULD KNOW: <state, gotchas, anything the charter should be updated to say>
VALIDATION: <the "Brad's twenty minutes" checklist, verbatim>
```

The log, not any assistant's memory, is the record of this phase. Truth lives on disk.

---

## 9. Definition of done for this phase

- A Friday search returns a set with at least one can't-wait-to-watch card, five nights of five, counted by Brad over two weeks.
- Liked-but-unwatched titles have a visible home and can resurface; watched titles never do.
- A saved anchor reopens rich; a shared anchor renders for a stranger with an image preview; health anchors cannot be shared or compared.
- An unknown wine can be described relative to a saved one in one tap.
- The app cannot silently die of a paused database or an empty API balance.
- Katrina has taken one cold read of the benchmark slot and one of the panel, unprompted, and neither needed explaining.
- The voice round has been run jointly and the search-lane and snap-lane voices are declared done, with the mold counts at zero across ten counted generations.

Then: the ops dashboard session (SMTP, Supabase tripwire verification, usage alerts), the 50-person test date, and the GTM bucket.

---

*Be honest before helpful. Diagnose before fixing. Measure, don't estimate. Bound at the source. Prove the grant, not just the denial. The saved thing must be rich on return — that is the product. And when in doubt about feel: stop, write, and let the founder's ear decide.*
