#!/usr/bin/env node
/* S25 — follow-ups to S24 (Brad, 2026-10-25).
 * Books get "vs. your [Book]:" lines in the movie format (the same writer,
 * the anchor named a book, each card's own text as its synopsis); the
 * "Movie"/"TV"/"Book" sheet labels approved; the ⋯ button reads "More
 * options"; the snap tips stay (Brad changed his mind). Wine and the
 * prompt strings untouched. No network: the writer and the cap are stubs.
 * Run: node scripts/validate-s25.cjs */

const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

let passed = 0;
let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)}, expected ${JSON.stringify(want)})`}`);
}
function load(rel, stubs) {
  const out = ts.transpileModule(read(rel), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true },
  }).outputText;
  const m = { exports: {} };
  new Function("module", "exports", "require", out)(m, m.exports, (id) => (stubs[id] !== undefined ? stubs[id] : require(id)));
  return m.exports;
}
const quiet = {};
for (const level of ["warn", "info", "error"]) {
  quiet[level] = console[level];
  console[level] = () => {};
}

// ---- the route, with the writer and the cap stubbed ----------------------
const writes = [];
let capped = false;
let writerThrows = false;
const route = load("app/api/slots/route.ts", {
  "../../../src/lib/envCheck": { runEnvCheck() {} },
  "../../../src/lib/llm": { withLlmContext: (_req, fn) => fn() },
  "../../../src/lib/anchorSnapshots": { cleanClientId: (x) => (typeof x === "string" ? x : null) },
  "../../../src/lib/apiUsage": { capGate: async () => (capped ? { status: 429 } : null) },
  "../../../src/lib/tmdbMedia": { mediaConfigured: () => false, loadMediaBundle: async () => null, whereOf: () => null },
  "../../../src/lib/tmdbVerify": { normalizeTitle: (s) => s, verifyTitles: async () => null },
  "../../../src/lib/mediaReks": {
    raceTaste: async () => ({ liked: [], disliked: [], watched: [] }),
    linesVsGoTo: async ({ goTo, candidates }) => {
      if (writerThrows) throw new Error("writer down");
      writes.push({ goTo, candidates });
      return new Map(candidates.map((c) => [c.id, `Same missing-wife dread, but the marriage is in ${c.title}.`]));
    },
  },
  "../../../src/lib/slotRecipe": { leadLine: (s) => s, loadPools: async () => null, loadGoTos: async () => [] },
  "../../../src/lib/openaiFailure": { maybeSimulateOpenAIFailure() {}, openAIFailureResponse: () => null },
});
const post = (body) => route.POST(new Request("http://x/api/slots", { method: "POST", body: JSON.stringify(body) }));
const book = (name) => ({ name, tmdbKind: null, tmdbId: null, at: "2026-10-25" });
const items = [
  { title: "Sharp Objects", year: 2006, overview: "A reporter returns to her hometown to cover two murders." },
  { title: "The Silent Patient", year: 2019, overview: "A painter shoots her husband and never speaks again." },
  { title: "Behind Closed Doors", year: 2016 },
];

(async () => {
  console.log("1. Books lines: the same writer, the anchor named a book");
  writes.length = 0;
  let res = await post({ clientId: "anon_agent_s25", category: "Books", action: "lines", refs: [book("Gone Girl"), book("Rebecca")], items });
  let json = await res.json();
  check("200 ok, even with TMDb off", [res.status, json.ok], [200, true]);
  check("one writer call, against the first reference", writes.map((w) => w.goTo), [{ title: "Gone Girl", year: null, kind: "book", overview: "" }]);
  check("each card's own text stands in for its synopsis", writes[0]?.candidates.map((c) => c.overview), [items[0].overview, items[1].overview, ""]);
  check("a line per card, vs. the reference", json.lines.map((l) => [l.title, l.vsGoTo]), items.map((i) => [i.title, "Gone Girl"]));
  check("the line is the writer's", json.lines[0]?.short, "Same missing-wife dread, but the marriage is in Sharp Objects.");

  console.log("\n2. Named, never silent: cap, failure, bad input");
  capped = true;
  writes.length = 0;
  json = await (await post({ clientId: "anon_agent_s25", category: "Books", action: "lines", refs: [book("Gone Girl")], items })).json();
  check("over cap: no writer call, the cards keep their text", [json.ok, json.lines.length, writes.length], [true, 0, 0]);
  capped = false;
  writerThrows = true;
  json = await (await post({ clientId: "anon_agent_s25", category: "Books", action: "lines", refs: [book("Gone Girl")], items })).json();
  check("writer fails: ok, no lines (synopses stand)", [json.ok, json.lines.length], [true, 0]);
  writerThrows = false;
  res = await post({ clientId: "anon_agent_s25", category: "Books", action: "lines", refs: [], items });
  check("no reference: 400", res.status, 400);
  res = await post({ clientId: "anon_agent_s25", category: "Books", action: "lines", refs: [book("Gone Girl")], items: [] });
  check("no items: 400", res.status, 400);
  res = await post({ clientId: "anon_agent_s25", category: "Books", refs: [book("Gone Girl")] });
  check("a Books set request still isn't the slot route's (400)", res.status, 400);

  console.log("\n3. The writer and the page");
  const mr = read("src/lib/mediaReks.ts");
  check("the anchor is named a book in the user message", /const kindWord = anchor\.kind === "movie" \? "movie" : anchor\.kind === "book" \? "book" : "TV show";/.test(mr), true);
  const diff = (files) => {
    try {
      return execSync(`git diff main -- ${files}`, { cwd: root }).toString();
    } catch {
      return "git diff failed";
    }
  };
  const promptDiff = diff("src/lib/mediaReks.ts src/lib/voiceMood.ts src/engine/rekomendrEngine.ts");
  check("the chooser prompt's strings are byte-identical", /^[-+]\s*("|'|`).*\\n/m.test(promptDiff) || /^[-+].*CHOOSER_PROMPT =/m.test(promptDiff), false);
  const page = read("app/page.tsx");
  check("Books with a reference: lines after the seeded five", /\} else if \(nextCategory === "Books" && bookRefs\.length\) \{\s*setLoading\(false\);\s*await addCompareLines\(next\.reks, "Books", searchId\);/.test(page), true);
  check("a book card sends its own text", /\.\.\.\(cat === "Books" \? \{ overview: r\.long \|\| r\.short \|\| "" \} : \{\}\)/.test(page), true);
  check("the client asks for Books", /category: "Movies" \| "TV Shows" \| "Books",/.test(read("src/lib/slotsClient.ts")), true);
  const r4 = read("src/components/ResultsV4.tsx");
  check("the lead: 'your' only for a starred favorite (same as movies)", r4.includes("? `vs. your ${goToShortName(rek.vsGoTo)}:`") && r4.includes(": `vs. ${rek.vsGoTo}:`"), true);

  console.log("\n4. Labels, the ⋯ name, the tips");
  check("sheet labels Movie / TV / Book (approved)", /const TYPE: Record<CompareCategory, string> = \{ Movies: "Movie", "TV Shows": "TV", Books: "Book" \};/.test(read("src/components/CompareSheet.tsx")), true);
  check("⋯ reads More options", /aria-label="More options"/.test(read("src/components/MoreMenu.tsx")), true);
  const pair = read("src/components/SayOrSnap.tsx");
  check("snap tips stay under Say it / Snap it", /<SnapTips category=\{category\} \/>/.test(pair), true);
  check("powered by Reks Ray™ stays", pair.includes(">powered by Reks Ray™<"), true);

  console.log("\n5. Untouched");
  check("wine: routes, libs and components byte-identical", diff("src/lib/wineReks.ts src/lib/wineShelf.ts src/lib/wineVisit.ts app/api/wine app/api/reksnap src/components/WineBought.tsx src/components/WineFacts.tsx src/components/WineFollowup.tsx"), "");

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
