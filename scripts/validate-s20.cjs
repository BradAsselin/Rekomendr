#!/usr/bin/env node
/* S20 — chip pools keep the typed moods' keep-outs, and the "vs." lead
 * says "your" only for a starred favorite (Brad's decisions, 2026-10-24).
 * Feel-good chips keep out TMDb's sad tags (and horror by keyword on TV);
 * TV Crime + Dark keeps out teen drama and horror; other chips are as
 * they were. No network: TMDb is a stub.
 * Run: node scripts/validate-s20.cjs */

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

let passed = 0;
let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)}, expected ${JSON.stringify(want)})`}`);
}
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function load(rel, stubs) {
  const out = ts.transpileModule(read(rel), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true },
  }).outputText;
  const m = { exports: {} };
  new Function("module", "exports", "require", out)(m, m.exports, (id) => (stubs[id] !== undefined ? stubs[id] : require(id)));
  return m.exports;
}
for (const level of ["warn", "info", "error"]) console[level] = () => {};

(async () => {
  const sent = [];
  const media = {
    tmdbGet: async (p, params) => {
      sent.push({ p, ...params });
      return { results: [] };
    },
    rowTitle: (r) => r.title ?? r.name ?? "",
    rowYear: () => null,
    safePosterPath: () => null,
    loadMediaBundle: async () => null,
    resolveSnappedTitle: async () => null,
  };
  const R = load("src/lib/slotRecipe.ts", { "./tmdbVerify": { normalizeTitle: norm }, "./tmdbMedia": media, "./synopsis": { shortSynopsis: (s) => s } });
  const tone = (vibe) => ({ kind: "tone", vibe });
  const out = async (kind, lane, refiner) => {
    sent.length = 0;
    await R.loadPools(kind, lane, refiner);
    const ids = new Set();
    for (const q of sent) for (const id of (q.without_keywords ?? "").split(",").filter(Boolean)) ids.add(Number(id));
    return { ids, every: sent.every((q) => q.without_keywords === sent[0].without_keywords) };
  };
  const SAD = [10614, 10163, 323809, 10703, 186956, 9872, 1647, 2689];
  const HORROR = [315058, 12339];
  const TEEN = [193400, 369277];
  const has = (set, list) => list.every((i) => set.has(i));
  const none = (set, list) => list.every((i) => !set.has(i));

  console.log("\n1. Feel-good chips keep out TMDb's sad tags");
  let r = await out("movie", "romance", tone("Feel-good"));
  check("Movies Romance + Feel-good: tragedy, cancer, depressing, tragic romance, grief, sadness, dementia out", has(r.ids, SAD), true);
  check("…on every discover (main, fresh, classic)", r.every, true);
  check("…movies keep Horror out by genre, not keyword", none(r.ids, HORROR), true);
  r = await out("tv", "drama", tone("Feel-good"));
  check("TV Drama + Feel-good: sad tags out", has(r.ids, SAD), true);
  check("…and horror by keyword (TV has no Horror genre)", has(r.ids, HORROR), true);
  r = await out("movie", null, tone("Comfort watch"));
  check("a comfort tone counts as feel-good", has(r.ids, SAD), true);

  console.log("\n2. TV Crime + Dark keeps out teen drama and horror");
  r = await out("tv", "crime", tone("Dark"));
  check("TV Crime + Dark: teen drama + horror out", has(r.ids, [...TEEN, ...HORROR]), true);
  check("…no sad keep-out on a dark chip", none(r.ids, SAD), true);
  r = await out("tv", "thriller", tone("Dark"));
  check("TV Thriller (Mystery|Crime) + Dark: the same", has(r.ids, [...TEEN, ...HORROR]), true);

  console.log("\n3. The other chips are as they were");
  for (const [kind, lane, refiner, label] of [
    // S21 — every TV Dark chip now keeps out teen/horror/procedurals (validate-s20b).
    ["movie", "crime", tone("Dark"), "Movies Crime + Dark"],
    ["movie", "comedy", null, "Movies Comedy (no refiner)"],
    ["tv", "comedy", tone("Smart"), "TV Comedy + Smart"],
  ]) {
    r = await out(kind, lane, refiner);
    check(`${label}: no keyword keep-out`, r.ids.size, 0);
  }

  console.log("\n4. Mood pools carry the chip's keep-outs plus their own exclusions");
  sent.length = 0;
  await R.loadMoodPools("tv", "crime", tone("Dark"), [{ ids: [6075], exclude: false }, { ids: [10292], exclude: true }]);
  const mk = sent[0].without_keywords.split(",").map(Number);
  check("TV crime dark mood: teen + horror + the words' exclusion", has(new Set(mk), [...TEEN, ...HORROR, 10292]), true);
  check("…each id once", mk.length, new Set(mk).size);
  sent.length = 0;
  await R.loadMoodPools("movie", "comedy", null, [{ ids: [6075], exclude: false }]);
  check("no tone, no exclusion → no without_keywords", sent[0].without_keywords, undefined);

  console.log("\n5. The vs. lead: \"your\" only for a starred favorite");
  const res = read("src/components/ResultsV4.tsx");
  check("starred go-to → vs. your <short name>:", res.includes("`vs. your ${goToShortName(rek.vsGoTo)}:`"), true);
  check("a named title → vs. <full name>:", res.includes("`vs. ${rek.vsGoTo}:`"), true);
  check("the starred check is the go-to list", /isGoTo\(category, rek\.vsGoTo\)/.test(res), true);
  // The same rule, run.
  const lead = (starred, name) => (starred ? `vs. your ${name.replace(/^(the|a|an)\s+/i, "")}:` : `vs. ${name}:`);
  check("example: named The Office", lead(false, "The Office"), "vs. The Office:");
  check("example: starred The Office", lead(true, "The Office"), "vs. your Office:");

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
