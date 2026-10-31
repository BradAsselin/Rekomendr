#!/usr/bin/env node
/* S31 — More like this lines stand alone; Compare to starts unchecked
 * (Brad, 2026-10-31). The prompt half and the guarantee, run on the real
 * code with the model stubbed; the browser half is scripts/pw-s31-mlt.cjs.
 *
 *   1. The Movies/TV chooser (src/lib/mediaReks.ts): the More like this
 *      prompt carries no comparison instruction; the other paths keep
 *      CHOOSER_PROMPT byte for byte; a comparing line never ships.
 *   2. The search lane's seeded prompt (src/engine/rekomendrEngine.ts):
 *      a seeded Movies/TV/Books prompt is the no-seed prompt plus the
 *      pick line and the seed's name, nothing else; Wine's seeded verdict
 *      grammar is unchanged; a comparing sentence never ships.
 *   3. The prompt diffs are pinned to the S31 commit's base.
 *
 * Run: node -r ./scripts/npx-shim.cjs scripts/validate-s31.cjs  (Windows)
 *      node scripts/validate-s31.cjs                            (elsewhere) */

const { execFileSync, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BASE = "f863990"; // main before S31
const CACHE = path.join(ROOT, "node_modules", ".cache");
fs.mkdirSync(CACHE, { recursive: true });
const OUT = fs.mkdtempSync(path.join(CACHE, "s31-validate-"));

console.log("Compiling mediaReks, the engine and standaloneLine from source…");
execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "tsc", "src/lib/mediaReks.ts", "src/engine/rekomendrEngine.ts", "src/lib/standaloneLine.ts",
    "--outDir", OUT, "--rootDir", ".", "--module", "commonjs", "--target", "es2020",
    "--moduleResolution", "node", "--esModuleInterop", "--skipLibCheck", "--lib", "es2020,dom",
    "--resolveJsonModule",
  ],
  { stdio: "inherit", cwd: ROOT, shell: process.platform === "win32" }
);

let pass = 0;
let fail = 0;
const check = (label, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `  (got ${a}, expected ${e})`}`);
};

const { comparativeReason } = require(path.join(OUT, "src/lib/standaloneLine.js"));
const llm = require(path.join(OUT, "src/lib/llm.js"));
const media = require(path.join(OUT, "src/lib/mediaReks.js"));
const engine = require(path.join(OUT, "src/engine/rekomendrEngine.js"));

// Brad's named phrasings, and the shapes they come in.
const COMPARING = [
  "Same CIA-recruit-goes-undercover pressure, but the mole is inside the Agency.",
  "Trades the desert for a Dublin bedroom, where a teenager forms a band.",
  "Swaps the battlefield for a kitchen in Lyon.",
  "A wedding instead of a war, and the bride's father is the problem.",
  "Quieter than Arrival — the menace stays under the surface.",
  "Lighter and funnier, with the plot moved to an American high school, rather than a farm.",
];
const PLAIN = [
  "A linguist is recruited to talk to the visitors before the army loses patience.",
  "She has less than 72 hours to return the car before the audit.",
  "A night-shift auditor finds one guest checked into three rooms.",
  "A trade school dropout runs the best food truck in Tulsa.",
];

(async () => {
  console.log("\n0. The check itself");
  check("every named comparison shape is caught", COMPARING.map((l) => !!comparativeReason(l, "Arrival")), COMPARING.map(() => true));
  check("story sentences are not (numbers, 'a trade school')", PLAIN.map((l) => comparativeReason(l, "Heat")), PLAIN.map(() => null));
  check("naming the seed counts as comparing", comparativeReason("Like the film, a linguist decodes a language.", "Arrival") !== null && comparativeReason("It plays out like Arrival in a hospital.", "Arrival") !== null, true);

  /* ---------------- 1. The Movies/TV chooser ---------------- */
  console.log("\n1. Movies/TV chooser (mediaReks)");
  const calls = [];
  let reply = null;
  llm.llmCall = async (req) => {
    calls.push(req);
    return { text: JSON.stringify(reply), model: "stub" };
  };
  const candidates = [1, 2, 3, 4, 5, 6].map((i) => ({
    id: 100 + i,
    title: `Title ${i}`,
    year: 2000 + i,
    overview: `Candidate ${i} follows a pilot who must land a plane with no engines. Then more happens.`,
  }));
  const anchor = { title: "Arrival", year: 2016, kind: "movie", overview: "A linguist talks to aliens." };
  const lines = [COMPARING[0], COMPARING[1], COMPARING[4], PLAIN[0], COMPARING[3]];
  reply = { picks: lines.map((line, i) => ({ n: i + 1, line })), wildcard: null };

  const typed = await media.chooseMediaReks({ anchor, candidates, taste: media.EMPTY_TASTE, path: "typed" });
  const typedSystem = calls[0].system;
  check("typed title (not More like this): lines ship as written", typed.map((r) => r.description), lines);

  const mlt = await media.chooseMediaReks({ anchor, candidates, taste: media.EMPTY_TASTE, path: "typed", standalone: true });
  const mltSystem = calls[1].system;
  check("More like this: no description carries a comparison", mlt.map((r) => comparativeReason(r.description, "Arrival")), mlt.map(() => null));
  check("…a comparing line becomes the synopsis's first sentence", mlt.map((r) => r.description), [
    "Candidate 1 follows a pilot who must land a plane with no engines.",
    "Candidate 2 follows a pilot who must land a plane with no engines.",
    "Candidate 3 follows a pilot who must land a plane with no engines.",
    PLAIN[0],
    "Candidate 5 follows a pilot who must land a plane with no engines.",
  ]);
  check("…and still five picks, the chooser's order", mlt.map((r) => r.name), ["Title 1", "Title 2", "Title 3", "Title 4", "Title 5"]);
  check("the More like this prompt drops every comparison instruction", ["compares to the anchor", "Open on the comparison", "same-but", "Swaps the battlefield", "no comparison", "than the one you looked up", "two synopses"].filter((w) => mltSystem.includes(w)), []);
  check("…and says the line stands alone", mltSystem.includes("about that title on its own") && mltSystem.includes("names no other title"), true);
  check("…the choosing instructions are untouched (fit to the anchor first)", mltSystem.includes("Fit to the anchor comes first") && typedSystem.includes("Fit to the anchor comes first"), true);
  const mltDiff = typedSystem.split("\n").filter((l) => !mltSystem.split("\n").includes(l));
  check("…exactly the six swapped prompt lines differ from the typed-title prompt", mltDiff.length, 6);
  check("the typed-title prompt still compares (its own job, unchanged)", typedSystem.includes("saying how it compares to the anchor"), true);

  /* ---------------- 2. The search lane's seeded prompt ---------------- */
  console.log("\n2. Search lane seeded prompt (rekomendrEngine)");
  const prompts = [];
  let aiReply = [];
  global.fetch = async (url, init) => {
    if (String(url).includes("/api/openai")) {
      prompts.push(JSON.parse(init.body).prompt);
      return new Response(JSON.stringify(aiReply), { status: 200 });
    }
    if (String(url).includes("/api/verify/titles")) {
      const items = JSON.parse(init.body).items;
      return new Response(JSON.stringify({ enabled: true, verdicts: items.map((i, n) => ({ title: i.title, resolved: true, tmdbId: 9000 + n })) }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  };
  // Titles are unique per call: the engine's session list drops anything
  // it already showed (and lists it in the prompt's never-return line).
  let round = 0;
  const book = (t, short) => ({ title: `${t} ${round}`, year: 2020, short, long: "A long read. One for a slow Sunday.", genre: "Fiction", vibeTags: [] });
  const plainSix = () => {
    round++;
    return ["Book A", "Book B", "Book C", "Book D", "Book E", "Book F"].map((t) => book(t, `A clerk finds a ledger in ${t}. The ledger is wrong. You'll read it twice.`));
  };
  aiReply = plainSix();

  const seededBooks = await engine.getMoreLikeThisSet({ seed: { title: "Piranesi" }, category: "Books", rawQuery: "Books||||Piranesi||mode:ai" });
  const pSeed = prompts.at(-1);
  aiReply = plainSix();
  await engine.getMoreLikeThisSet({ seed: { title: "" }, category: "Books", rawQuery: "Books||||Piranesi||mode:ai" });
  const pNone = prompts.at(-1);
  check("seeded Books: five come back", seededBooks.length, 5);
  check("seeded prompt keeps the pick line and the seed's name", pSeed.includes('A seed title is provided below: recommend things that feel like a smart "more like this."') && pSeed.includes("Seed title:\nPiranesi"), true);
  check("seeded prompt carries no placement or referent", ["THE PLACEMENT", "Comparative referent", "bare comparative", "against Piranesi", "verdict beat"].filter((w) => pSeed.includes(w)), []);
  check("seeded prompt uses the standalone close", pSeed.includes("THE SIMULATION CLOSE"), true);
  // The session's own lists (shown titles) and the ask size (it grows with
  // the avoid list) differ between the two calls by construction;
  // everything else must match.
  const norm = (p) =>
    p
      .replace(/Generate \d+ /, "Generate N ")
      .replace(/Aim for exactly \d+ items/, "Aim for exactly N items")
      .replace(/(Current visible titles:\n)[^\n]*/, "$1<list>")
      .replace(/(Never return these titles[^\n]*\n)[^\n]*/, "$1<list>");
  const stripSeed = (p) =>
    norm(p.replace('- A seed title is provided below: recommend things that feel like a smart "more like this."\n', "").replace("Seed title:\nPiranesi\n\n", ""));
  check("seeded = no-seed prompt + the pick line + the seed's name, nothing else", stripSeed(pSeed) === norm(pNone), true);

  for (const cat of ["Movies", "TV Shows"]) {
    aiReply = plainSix();
    await engine.getMoreLikeThisSet({ seed: { title: "Arrival" }, category: cat, rawQuery: `${cat}||||x||mode:ai` });
    const p = prompts.at(-1);
    check(`seeded ${cat}: no placement, standalone close`, [p.includes("THE PLACEMENT"), p.includes("Comparative referent"), p.includes("THE SIMULATION CLOSE")], [false, false, true]);
  }

  aiReply = ["Wine A", "Wine B", "Wine C", "Wine D", "Wine E", "Wine F"].map((t) => ({ title: t, year: 2020, short: "Dry and citrus-led. Built for oysters.", long: "x. y. z.", genre: "White", vibeTags: [] }));
  await engine.getMoreLikeThisSet({ seed: { title: "Kim Crawford Sauvignon Blanc" }, category: "Wine", rawQuery: "Wine||||x||mode:ai" });
  const pWine = prompts.at(-1);
  check("seeded Wine keeps its verdict grammar and referent (charter §2.3)", [pWine.includes("the verdict beat — where this lands relative to the seed bottle"), pWine.includes("Comparative referent (sentence 3 places each rek against this):")], [true, true]);

  // The guarantee: comparing sentences leave; a card left with nothing goes.
  round++;
  aiReply = [
    book("Book A", "A clerk finds a ledger. The ledger is wrong. Quieter than Piranesi, and colder."),
    book("Book B", "A diver maps a flooded house. Each room holds a letter. You'll want a map of your own."),
    book("Book C", "Same labyrinth-as-home pressure, but the house is a hotel."),
    book("Book D", "A ferryman keeps a list. Trades the halls for a river, and the tides for clocks. The list is short."),
    book("Book E", "An archivist reads a name she wrote. Instead of a house, a library."),
    book("Book F", "A gardener plants a door. It opens."),
  ];
  const guarded = await engine.getMoreLikeThisSet({ seed: { title: "Piranesi" }, category: "Books", rawQuery: "Books||||Piranesi||mode:ai" });
  check("seeded results: no short carries a comparing sentence", guarded.map((r) => r.short.split(/(?<=[.!?])\s+/).filter((s) => comparativeReason(s, "Piranesi")).length), guarded.map(() => 0));
  check("a card made only of comparison doesn't ship; the rest keep their story", guarded.map((r) => [r.title.replace(/ \d+$/, ""), r.short]), [
    ["Book A", "A clerk finds a ledger. The ledger is wrong."],
    ["Book B", "A diver maps a flooded house. Each room holds a letter. You'll want a map of your own."],
    ["Book D", "A ferryman keeps a list. The list is short."],
    ["Book E", "An archivist reads a name she wrote."],
    ["Book F", "A gardener plants a door. It opens."],
  ]);
  const lastSix = aiReply;
  round++;
  aiReply = lastSix.map((r) => ({ ...r, title: r.title.replace(/ \d+$/, ` ${round}`) }));
  const unseeded = await engine.getMoreLikeThisSet({ seed: { title: "" }, category: "Books", rawQuery: "Books||||x||mode:ai" });
  check("…the guarantee is for seeded sets only", unseeded.some((r) => r.title.startsWith("Book C")), true);

  /* ---------------- 3. Diffs pinned ---------------- */
  console.log(`\n3. Prompt diffs against ${BASE}`);
  const diff = (f) => execSync(`git diff ${BASE} -- ${f}`, { cwd: ROOT, encoding: "utf8" });
  const changed = (d) => d.split("\n").filter((l) => /^[-+](?![-+])/.test(l));
  const eng = changed(diff("src/engine/rekomendrEngine.ts"));
  const removed = eng.filter((l) => l.startsWith("-")).map((l) => l.slice(1));
  const added = eng.filter((l) => l.startsWith("+")).map((l) => l.slice(1));
  check("engine: every removed line comes back with only hasSeed → placeAgainstSeed (or the referent moved inside it)", removed.filter((l) => !added.includes(l.replace("hasSeed", "placeAgainstSeed")) && !/^Comparative referent|^the seed title, \$\{seedTitle\}|^\s*: ""$|^`$/.test(l.trim())), []);
  check("engine: no prompt sentence was reworded", added.filter((l) => /^(- |  - )[A-Z]/.test(l.trim()) && !removed.includes(l)).length, 0);
  const med = changed(diff("src/lib/mediaReks.ts"));
  check("mediaReks: no line of CHOOSER_PROMPT itself changed", med.filter((l) => l.startsWith("-") && /^-\s+"/.test(l)), []);

  console.log(`\n${pass} passed, ${fail} failed`);
  fs.rmSync(OUT, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
