/* eslint-disable no-console */
//
// scripts/validate-s38-housekeeping.cjs — S38, housekeeping
// (docs/2026-11-10_housekeeping_launch.md):
//
//   1. The charter diff contains ONLY the approved section-1 edits: the
//      base charter (main @0dea5fa) with exactly those edits applied must
//      equal the charter this session committed, byte for byte.
//   2. The session log split lost nothing: base header + the archive +
//      the kept entries rebuild the base log exactly, with one pointer
//      line added.
//   3. docs/CURRENT_STATE.md exists, has every section the launch doc
//      names, and carries the anon_agent_ rule.
//
// Later sessions may change the charter again, so check 1 reads the
// charter from this session's own commit (subject "S38: charter"), or the
// working tree before that commit exists. No keys, no network.
//
//   node scripts/validate-s38-housekeeping.cjs
//
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BASE = "0dea5fa";
const lf = (s) => s.replace(/\r\n/g, "\n");
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 });
const show = (ref, p) => lf(git("show", `${ref}:${p}`));
const disk = (p) => lf(fs.readFileSync(path.join(ROOT, p), "utf8"));

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

// ---------- 1. charter ----------
console.log("Charter: only the approved edits");
const EXC = "The one exception is a single-instruction change approved under §2.3.";
const EDITS = [
  [
    "Autonomous sessions may *prepare* voice diffs (§3.9) but never merge them.\n4. **Honest-short",
    "Autonomous sessions may *prepare* voice diffs (§3.9) but never merge them.\n\n   **Single-instruction exception (Brad, 2026-11-10).** Brad may approve a change to one named instruction in a prompt, in chat or in a launch doc that says exactly which instruction changes. The session then changes only that instruction, proves with a test that the rest of the prompt is byte-identical, runs a live check with the real model and reports what it saw, and may self-merge. Anything broader (tone, register, a rewrite, a new voice) is still joint-session only.\n4. **Honest-short",
  ],
  [
    "10. **The model is gpt-4o-mini + the tuned prompts.** No model swaps, no reasoning-tier models. Both flagship pilots were run and closed in August; `ANTHROPIC_API_KEY` in `.env.local` is dev-only and not to be used in product code.",
    "10. **The models are Anthropic Claude, assigned per step by environment variable** (`REKS_MODEL_PROVIDER`, `REKS_PROVIDER_<STEP>`, `REKS_MODEL_<STEP>`): Opus 5.5 reads the shelf; Sonnet 5.5 handles vision, wine, lines, search and snap; Haiku 5.5 handles mood, detail, recipe and classify. `/api/health` reports the live assignment and is the source of truth. OpenAI is used for moderation only. A session never changes a Production model assignment (Production env vars are Brad's). A model change on Preview needs Brad's OK and a counted before-and-after report. *(Replaced 2026-11-10; the app moved to Claude on 2026-10-24. Approved by Brad.)*",
  ],
  [
    "is never a candidate for merge from a validation batch.",
    `is never a candidate for merge from a validation batch. ${EXC}`,
  ],
  [
    "those PRs stay open, labeled VOICE — joint session required. Anything",
    `those PRs stay open, labeled VOICE — joint session required. ${EXC} Anything`,
  ],
  [
    "merge a VOICE PR; edit §2 except as Brad authorizes in chat.",
    `merge a VOICE PR; edit §2 except as Brad authorizes in chat. ${EXC}`,
  ],
  [
    "Fable's memory is not the record; the log is.\n",
    "Fable's memory is not the record; the log is.\n13. **Names.** Launch docs are named by date and topic (`docs/2026-11-10_housekeeping_launch.md`), never by session number. The session takes the next free number from `docs/CURRENT_STATE.md` and uses it for its branch, tests and log entry. Before creating any `validate-*` or `pw-*` file, check that the name is not already taken.\n14. **Current state.** `docs/CURRENT_STATE.md` is one page. Read it at the top of every session, before the session log, and update it at the end. The session log is the history; this page is the present.\n",
  ],
];
let expected = show(BASE, "docs/BUILD_CHARTER.md");
for (const [from, to] of EDITS) {
  const n = expected.split(from).length - 1;
  ok(n === 1, `edit anchor occurs exactly once: ${from.slice(0, 50).replace(/\n/g, "⏎")}…`);
  expected = expected.replace(from, to);
}
const own = git("log", "--format=%H", "-1", "--grep", "^S38: charter", "--all").trim();
const actual = own ? show(own, "docs/BUILD_CHARTER.md") : disk("docs/BUILD_CHARTER.md");
console.log(`  (charter read from ${own ? own.slice(0, 7) : "working tree"})`);
ok(actual === expected, "charter == base + the six approved edits, byte for byte");
ok(/§2.3/.test(actual) && actual.split(EXC).length - 1 === 3, "exception sentence appears exactly three times (§3.9, §10.4, §11.6)");

// ---------- 2. session log split ----------
console.log("Session log: nothing lost");
const POINTER = "Entries before Session 26 (Sessions 0–25, Sept 12 – Oct 25, 2026) are in `docs/archive/SESSION_LOG_through_S25.md`, unchanged.";
const baseLog = show(BASE, "docs/SESSION_LOG.md").split("\n");
const curLog = disk("docs/SESSION_LOG.md").split("\n");
const arch = disk("docs/archive/SESSION_LOG_through_S25.md").split("\n");
const cut = baseLog.findIndex((l) => l.startsWith("## Session 26 "));
const first = baseLog.findIndex((l) => l.startsWith("## Session 0 "));
ok(cut > 0 && first > 0, "base log has Session 0 and Session 26 headings");
ok(arch.slice(0, -1).join("\n") === baseLog.slice(first, cut).join("\n"), "archive == base log's Session 0..25 lines, unchanged");
ok(!arch.some((l) => l.startsWith("## Session 26 ")), "archive stops before Session 26");
const pIdx = curLog.indexOf(POINTER);
ok(pIdx > 0, "log carries the pointer line");
const rebuilt = [...curLog.slice(0, pIdx), ...curLog.slice(pIdx + 1)];
const header = baseLog.slice(0, first);
ok(rebuilt.slice(0, first).join("\n") === header.join("\n"), "log header unchanged (pointer aside)");
const kept = baseLog.slice(cut);
const tail = rebuilt.slice(first, first + kept.length);
// The base's last element is "" (trailing newline); later sessions append after it.
ok(tail.slice(0, kept.length - 1).join("\n") === kept.slice(0, -1).join("\n"), "Sessions 26–37 kept verbatim, in place");
ok((first + (cut - first) + kept.length) === baseLog.length, "line count: header + archive + kept == base");

// ---------- 3. CURRENT_STATE ----------
console.log("CURRENT_STATE.md");
const cs = disk("docs/CURRENT_STATE.md");
for (const h of ["Last session", "Next free session number", "Production", "Models", "What the app does today", "Standing rules", "Open items", "Where things are"]) {
  ok(cs.includes(h), `has "${h}"`);
}
ok(/anon_agent_/.test(cs), "states the anon_agent_ test-client rule");
ok(cs.split("\n").length <= 80, "fits on one page (≤ 80 lines)");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
