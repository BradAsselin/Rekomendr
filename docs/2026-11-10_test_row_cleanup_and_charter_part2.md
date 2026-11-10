# Test-row cleanup and charter part 2

Written Nov 10, 2026 (Claude, with Brad). Follows Session 38. No app change.

## Standing rules (unchanged)
- Self-merge to main when green. Never touch release/v2, never deploy --prod, never set Production env vars. Brad promotes.
- Never send Brad's email or other personal info to outside services.
- Only Brad changes §0. The §2 edits below are authorized by Brad pasting this doc's launch line (§11.6).

## A. Delete the test rows (approved by Brad, including the 13 test cards under §2.13)
Brad approves the eleven DELETE statements in the Session 38 log entry, exactly as written, including the 13 agent `anchor_snapshots`. Those are the builder's own test cards; all ten that were shared are already revoked, so no real person's link stops working. This approval covers only rows whose client id matches the test prefixes in those statements.

Run it this way:
1. Take the full `pg_dump` backup first (§11.2), check it is not empty, and log its filename.
2. Before deleting, re-count each statement's rows in a read-only transaction. Counts may have grown since Session 38 only if a test ran since; say so if they differ.
3. Confirm that none of the four old-format real ids (`anon_<base36>_<rand>`) and no `anon_<uuid>` id matches any of the patterns.
4. Run the statements in the order given, in one transaction. After each, compare the deleted count with the re-count from step 2. If any differs, roll back and report; do not commit.
5. After commit, read back: zero rows left for each pattern, and the row totals for real clients are unchanged from before (137 uuid ids / 1,832 rows and 4 old ids / 466 rows, plus anything real people did in between).
6. Confirm on production that a real save, a share link (`/a/<id>` of a real card) and `/api/stats` still work.

## B. Charter part 2 (docs/BUILD_CHARTER.md): make exactly these edits and nothing else

**B1. Replace all of §2.8 with:**

> 8. **Production is untouchable from a session.** `release/v2` deploys production. Sessions never push or merge to `release/v2`, and never push directly to `main`. The path is branch → PR → preview; a session merges its own PR into `main` only under §10.3 and §11.4. Brad alone promotes `main` to `release/v2`. No exceptions, including "tiny." *(Reworded 2026-11-10 to match §10.3 and §11.4; approved by Brad.)*

**B2. In §4's last paragraph, replace the sentence "Brad merges." with:**

> The session merges into `main` under §10.3 and §11.4; otherwise Brad merges.

**B3. In §10.4, replace the sentence "Anything that changes this charter's §2 invariants." with:**

> Anything that changes this charter's §2 invariants, unless Brad has approved the exact wording in chat or in a launch doc (§11.6).

**B4. Directly under the charter's title block (before "§0. The one aim"), add:**

> **How sessions run now (added 2026-11-10).** Work comes from dated launch docs in `docs/` (§3.13), and `docs/CURRENT_STATE.md` is the present (§3.14). The "Phase" line above, "0. How to use this document", §6, §7 and §9 describe the September 2026 plan and are kept as history. §3.3's list of spec documents, §3.10's prompt markers and §8's log format are from the same period. Where any of them disagrees with a launch doc, `CURRENT_STATE.md` or current practice in the session log, the newer one wins. §0 (the one aim), §2 (invariants), §10, §11 and §12 are current and binding.

## C. Update docs/CURRENT_STATE.md
- Remove the "test leftovers" open item and note the cleanup with its backup filename.
- Add: "Real-device counts before 2026-11-10 are overstated: early browser tests (S2 chain, 2026-10-11) used real-format ids and cannot be separated."
- Add under Open items: "`src/lib/llm.ts` still falls back to OpenAI for generation if the Anthropic key is missing; Build 5 removes it."

## Tests
- A check that the charter equals main plus exactly the B edits.
- All suites, tsc, lint and build pass.

## Report back
Backup filename; the deleted counts per table; the readback; merge SHAs.
