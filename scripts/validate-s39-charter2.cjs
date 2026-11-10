/* eslint-disable no-console */
//
// scripts/validate-s39-charter2.cjs — S39, charter part 2
// (docs/2026-11-10_test_row_cleanup_and_charter_part2.md §B):
//
//   The charter equals main @aac610e plus exactly the four approved B
//   edits, byte for byte. It is read from this session's own commit
//   (subject "S39: charter"), or the working tree before that commit
//   exists, so later charter changes don't break it. Also checks
//   CURRENT_STATE.md carries the §C lines. No keys, no network.
//
//   node scripts/validate-s39-charter2.cjs
//
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BASE = "aac610e";
const lf = (s) => s.replace(/\r\n/g, "\n");
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 });
const show = (ref, p) => lf(git("show", `${ref}:${p}`));
const disk = (p) => lf(fs.readFileSync(path.join(ROOT, p), "utf8"));

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

console.log("Charter: only the approved B edits");
const EDITS = [
  [ // B1
    "8. **Production is untouchable from a session.** `release/v2` deploys production. Sessions never push to `release/v2` or `main`. Branch → PR → preview → Brad merges, except as §10.3 allows. No exceptions, including \"tiny.\"",
    "8. **Production is untouchable from a session.** `release/v2` deploys production. Sessions never push or merge to `release/v2`, and never push directly to `main`. The path is branch → PR → preview; a session merges its own PR into `main` only under §10.3 and §11.4. Brad alone promotes `main` to `release/v2`. No exceptions, including \"tiny.\" *(Reworded 2026-11-10 to match §10.3 and §11.4; approved by Brad.)*",
  ],
  [ // B2
    "\nBrad merges. Production promotion is a separate PR",
    "\nThe session merges into `main` under §10.3 and §11.4; otherwise Brad merges. Production promotion is a separate PR",
  ],
  [ // B3
    "Anything that changes this charter's §2 invariants.",
    "Anything that changes this charter's §2 invariants, unless Brad has approved the exact wording in chat or in a launch doc (§11.6).",
  ],
  [ // B4
    "It is the goal, the fence, and the route.**\n",
    "It is the goal, the fence, and the route.**\n\n**How sessions run now (added 2026-11-10).** Work comes from dated launch docs in `docs/` (§3.13), and `docs/CURRENT_STATE.md` is the present (§3.14). The \"Phase\" line above, \"0. How to use this document\", §6, §7 and §9 describe the September 2026 plan and are kept as history. §3.3's list of spec documents, §3.10's prompt markers and §8's log format are from the same period. Where any of them disagrees with a launch doc, `CURRENT_STATE.md` or current practice in the session log, the newer one wins. §0 (the one aim), §2 (invariants), §10, §11 and §12 are current and binding.\n",
  ],
];
let expected = show(BASE, "docs/BUILD_CHARTER.md");
EDITS.forEach(([from, to], i) => {
  ok(expected.split(from).length - 1 === 1, `B${i + 1} anchor occurs exactly once in the base`);
  expected = expected.replace(from, to);
});
const own = git("log", "--format=%H", "-1", "--grep", "^S39: charter", "--all").trim();
const actual = own ? show(own, "docs/BUILD_CHARTER.md") : disk("docs/BUILD_CHARTER.md");
console.log(`  (charter read from ${own ? own.slice(0, 7) : "working tree"})`);
ok(actual === expected, "charter == main @aac610e + the four B edits, byte for byte");
ok(actual.indexOf("**How sessions run now") < actual.indexOf("## §0. The one aim"), "B4 sits before §0");

console.log("CURRENT_STATE.md (§C)");
const cs = disk("docs/CURRENT_STATE.md");
ok(cs.includes("Real-device counts before 2026-11-10 are overstated: early browser tests (S2 chain, 2026-10-11) used real-format ids and cannot be separated."), "real-device overcount line");
ok(cs.includes("`src/lib/llm.ts` still falls back to OpenAI for generation if the Anthropic key is missing; Build 5 removes it."), "llm.ts open item");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
