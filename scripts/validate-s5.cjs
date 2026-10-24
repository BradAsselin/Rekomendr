/* eslint-disable no-console */
//
// scripts/validate-s5.cjs — S5: mood chips up front.
//
// Compiles the REAL engine and src/lib/moodChips.ts from source, stubs the
// transport (no key, no network), and drives getTop5FromEngine with the
// exact query each chip and refiner sends. Proves:
//   * one chip tap = one AI search carrying that lane (no GO, no lane UI);
//   * refiners reach the model through channels that already existed — a
//     tone refiner as the engine's own tuned tone clause, an era refiner
//     in the lane — so NO prompt text changed (the engine is untouched);
//   * category-aware rows (TV's own set, Wine's styles);
//   * the old lane UI is gone from the source.
//
//   node scripts/validate-s5.cjs
//
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), "s5-validate-"));
console.log("Compiling the engine and moodChips from source…");
execFileSync(
  "npx",
  ["tsc", "src/engine/rekomendrEngine.ts", "src/lib/moodChips.ts", "--outDir", OUT, "--rootDir", ".", "--module", "commonjs", "--target", "es2020", "--moduleResolution", "node", "--esModuleInterop", "--skipLibCheck"],
  { stdio: "inherit", cwd: ROOT }
);
const engine = require(path.join(OUT, "src/engine/rekomendrEngine.js"));
const chips = require(path.join(OUT, "src/lib/moodChips.js"));

let captured = [];
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith("/api/verify/titles")) {
    const { items } = JSON.parse(init.body);
    return { ok: true, json: async () => ({ enabled: true, verdicts: items.map((i) => ({ title: i.title, resolved: true })) }) };
  }
  const body = JSON.parse(init.body);
  if (!String(body.prompt).includes("THIS IS THE RECALL SLOT")) captured.push(body.prompt);
  const items = Array.from({ length: 8 }, (_, i) => ({ title: `Pick ${captured.length}-${i}`, year: 2010 + i, short: "A. B. C.", long: "x", genre: "Comedy", vibeTags: [] }));
  return { ok: true, text: async () => JSON.stringify(items) };
};

let pass = 0, fail = 0;
const check = (label, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `  (got ${a}, expected ${e})`}`);
};
const run = async (rawQuery) => {
  captured = [];
  const res = await engine.getTop5FromEngine({ rawQuery, likedTitles: [], dislikedTitles: [], watchedTitles: [], shortlist: [] });
  return { reks: res.reks, prompt: captured[0] ?? "" };
};
const find = (cat, label) => chips.chipsFor(cat).find((c) => c.label === label);
const ref = (cat, label) => chips.refinersFor(cat).find((r) => r.label === label);

(async () => {
  console.log("\n1. Row 1 — the lanes, category-aware");
  check("Movies", chips.chipsFor("Movies").map((c) => c.label), ["Comedy", "Drama", "Thriller", "Crime", "Action", "Romance", "Sci-Fi", "Surprise me"]);
  check("TV gets its own set", chips.chipsFor("TV Shows").map((c) => c.label), ["Comedy", "Drama", "Crime", "Thriller", "Sci-Fi", "Reality", "Documentary", "Surprise me"]);
  check("Wine gets styles", chips.chipsFor("Wine").map((c) => c.label), ["Bold Red", "Crisp White", "Bubbles", "Rosé", "Surprise me"]);
  check("Row 2 refiners (media)", chips.refinersFor("Movies").map((r) => r.label), ["Feel-good", "Dark", "Smart", "Classic", "New"]);

  console.log("\n2. One tap on Comedy = five comedy reks, AI, no other step");
  const q = chips.chipQuery("Movies", find("Movies", "Comedy"), null);
  check("the query a tap sends", q, "Movies||Comedy||||mode:ai");
  let r = await run(q);
  check("five reks", r.reks.length, 5);
  check("the model is asked for the Comedy lane", r.prompt.includes("Lane/Clarifier: Comedy"), true);
  check("no typed text rides along", r.prompt.includes("User text:"), false);
  check("fresh bundle markers (§3.10): no EXPECT line", r.prompt.includes("THE EXPECT LINE"), false);

  console.log("\n3. Row 2 re-runs through existing channels (no prompt text changed)");
  r = await run(chips.chipQuery("Movies", find("Movies", "Comedy"), ref("Movies", "Dark")));
  check("Dark → the engine's own Dark & Twisty tone clause on Comedy", r.prompt.includes("Tone instruction: the subject stays Comedy; play it played grim and serpentine"), true);
  r = await run(chips.chipQuery("Movies", find("Movies", "Comedy"), ref("Movies", "Feel-good")));
  check("Feel-good → Feel-Good Crowd Pleaser clause", r.prompt.includes("played big-hearted and winning"), true);
  r = await run(chips.chipQuery("Movies", find("Movies", "Thriller"), ref("Movies", "Smart")));
  check("Smart → Smart & Witty clause on Thriller", r.prompt.includes("the subject stays Thriller; play it played sharp and verbal"), true);
  r = await run(chips.chipQuery("Movies", find("Movies", "Comedy"), ref("Movies", "Classic")));
  check("Classic → the lane says so", r.prompt.includes("Lane/Clarifier: Classic Comedy"), true);
  r = await run(chips.chipQuery("Movies", find("Movies", "Crime"), ref("Movies", "New")));
  check("New → the lane says so", r.prompt.includes("Lane/Clarifier: New Crime releases"), true);
  r = await run(chips.chipQuery("TV Shows", find("TV Shows", "Comedy"), ref("TV Shows", "Feel-good")));
  check("TV Feel-good → Comfort Rewatch clause", r.prompt.includes("ensemble hangouts"), true);
  const tones = Object.values(chips.REFINERS_BY_CATEGORY).flat().filter((x) => x.kind === "tone").map((x) => x.vibe);
  const engineSrc = fs.readFileSync(path.join(ROOT, "src/engine/rekomendrEngine.ts"), "utf8");
  check("every tone refiner is an existing TONE_BY_VIBE key", tones.filter((v) => !engineSrc.includes(`"${v}":`)), []);
  // S6: pinned to S5's own commit (86efd9c) — "vs main" started failing as
  // soon as a later session legitimately touched /api/reksnap (S6 signs reks).
  const diff = execFileSync("git", ["diff", "--stat", "86efd9c^", "86efd9c", "--", "src/engine", "app/api/openai", "app/api/reksnap"], { cwd: ROOT }).toString().trim();
  check("engine and prompt routes untouched vs main (no VOICE change)", diff, "");

  console.log("\n4. Surprise me and Wine");
  check("Surprise me = no lane (generic discovery, as an empty GO)", chips.chipQuery("Movies", find("Movies", "Surprise me"), null), "Movies||||||mode:ai");
  r = await run(chips.chipQuery("Movies", find("Movies", "Surprise me"), null));
  check("…no lane line in the prompt", r.prompt.includes("Lane/Clarifier:"), false);
  check("Surprise me + Classic → 'Classics'", chips.chipQuery("Movies", find("Movies", "Surprise me"), ref("Movies", "Classic")), "Movies||Classics||||mode:ai");
  check("Bubbles asks for Sparkling", chips.chipQuery("Wine", find("Wine", "Bubbles"), null), "Wine||Sparkling||||mode:ai");
  check("Wine row 2 = its own styles", chips.refinersFor("Wine").map((x) => x.label), ["Easy sipper", "Special occasion", "Crisp & dry", "Rich & cozy"]);

  console.log("\n5. The old lane UI is gone; typed + snap unchanged");
  const sb = fs.readFileSync(path.join(ROOT, "src/components/SearchBar.tsx"), "utf8");
  const code = sb.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  check("no 'Pick a lane first'", code.includes("Pick a lane first"), false);
  check("no 'Lane:' line", /Lane:\s*</.test(code), false);
  check("no + dropdown (Plus icon / 'Pick a lane' / 'Clear lane')", [code.includes("Plus"), code.includes('title="Pick a lane"'), code.includes("Clear lane")], [false, false, false]);
  check("no Play button in the bar", code.includes("<Play"), false);
  // S17 — both rows (genre, vibe) always show, wrapping.
  check("row 1 and row 2 both render unconditionally", [/\{chips\.map\(/.test(code), /\{activeChip && \(/.test(code)], [true, false]);
  check("a chip tap searches at once (no GO)", /const tapChip[\s\S]{0,300}startSearch\(chipQuery\(/.test(code), true);
  check("category switch never searches (3eaa04b holds)", /const handleSelectCategory[\s\S]{0,260}startSearch/.test(code), false);
  check("typed text keeps its path: cat||||text||mode:ai", code.includes("startSearch(`${categoryRef.current}||||${trimmed}||mode:ai`"), true);
  check("camera still opens RekSnap", code.includes("onClick={() => onSnap?.()}"), true);
  const pg = fs.readFileSync(path.join(ROOT, "app/page.tsx"), "utf8");
  check("stale responses still dropped (searchIdRef guard from 401886b)", pg.includes("if (searchId !== searchIdRef.current) return;"), true);

  console.log(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log("HARNESS CRASH", e?.stack ?? e); process.exit(1); });
