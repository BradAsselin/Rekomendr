# Housekeeping: charter truth-up, lighter session log, naming rule, test-row report

Written Nov 10, 2026 (Claude, with Brad). Build 1 of docs/ACTION_PLAN_nov10.md. Nothing in the app changes; no user-visible difference.

## Why
The files the builder reads at the top of every session have drifted from how the project really runs. That causes wrong stops, wasted effort, and sessions that run out of working memory.

## Standing rules (unchanged)
- Self-merge to main when green. Never touch release/v2, never deploy --prod, never set Production env vars. Brad promotes.
- Never send Brad's email or other personal info to outside services.
- Only Brad changes §0. The §2 edits below are authorized by Brad pasting this doc's launch line (§11.6).

## 1. Charter edits (docs/BUILD_CHARTER.md)
Make exactly these edits, word for word, and nothing else in the charter.

**1a. Replace all of §2.10 with:**

> 10. **The models are Anthropic Claude, assigned per step by environment variable** (`REKS_MODEL_PROVIDER`, `REKS_PROVIDER_<STEP>`, `REKS_MODEL_<STEP>`): Opus 5.5 reads the shelf; Sonnet 5.5 handles vision, wine, lines, search and snap; Haiku 5.5 handles mood, detail, recipe and classify. `/api/health` reports the live assignment and is the source of truth. OpenAI is used for moderation only. A session never changes a Production model assignment (Production env vars are Brad's). A model change on Preview needs Brad's OK and a counted before-and-after report. *(Replaced 2026-11-10; the app moved to Claude on 2026-10-24. Approved by Brad.)*

**1b. Add to the end of §2.3 (keep the existing text):**

> **Single-instruction exception (Brad, 2026-11-10).** Brad may approve a change to one named instruction in a prompt, in chat or in a launch doc that says exactly which instruction changes. The session then changes only that instruction, proves with a test that the rest of the prompt is byte-identical, runs a live check with the real model and reports what it saw, and may self-merge. Anything broader (tone, register, a rewrite, a new voice) is still joint-session only.

**1c. Add this sentence to the end of §3.9, of the first sentence of §10.4, and of §11.6:**

> The one exception is a single-instruction change approved under §2.3.

**1d. Add two rules to the end of §3:**

> 13. **Names.** Launch docs are named by date and topic (`docs/2026-11-10_housekeeping_launch.md`), never by session number. The session takes the next free number from `docs/CURRENT_STATE.md` and uses it for its branch, tests and log entry. Before creating any `validate-*` or `pw-*` file, check that the name is not already taken.
> 14. **Current state.** `docs/CURRENT_STATE.md` is one page. Read it at the top of every session, before the session log, and update it at the end. The session log is the history; this page is the present.

## 2. Lighter session log
- Move every entry before "Session 26" from docs/SESSION_LOG.md into docs/archive/SESSION_LOG_through_S25.md, unchanged. Keep the log's header and add one line pointing to the archive.
- Check: the two files together contain every line of the original (same total line count, plus the pointer line).

## 3. docs/CURRENT_STATE.md (new, one page)
Write it from the session log and the repo as they are today. Sections:
- **Last session:** number, date, merge SHA. **Next free session number.**
- **Production:** what is promoted (compare `origin/release/v2` with `origin/main`, read-only) and what is waiting on main.
- **Models:** as `/api/health` reports.
- **What the app does today,** in ten lines or fewer: home, lists, search types, wine shelf, Compare to (§2.14), Recent, share cards.
- **Standing rules in one place:** the five bullets under "Standing rules" above.
- **Open items:** the found-not-fixed items still open from Sessions 26 to 37.
- **Where things are:** launch docs in docs/, the action plan, the promote link.

## 4. Test-row report (report only; delete nothing)
Preview and production share one database, so the builder's test rows sit beside real ones.
- In a read-only transaction, count rows per table that belong to builder test clients (client ids beginning `anon_agent_`, and any other test prefix the session log names).
- Report the counts, the tables, and the exact DELETE statements you would run, and say whether any of those rows are shared cards (§2.13).
- Stop there. Deleting is Brad's call after he reads the report (§11.7).
- From now on, every test client id starts with `anon_agent_`. Add that line to CURRENT_STATE.md.

## Tests
- All existing suites, tsc, lint and build still pass (nothing in src/ changes).
- A check that the charter diff contains only the edits in section 1.

## Report back
Merge SHAs; the production-versus-main answer; the test-row counts and proposed DELETEs; anything in the charter you found that still contradicts how the project runs (list it, do not change it).
