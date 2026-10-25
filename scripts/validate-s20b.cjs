#!/usr/bin/env node
/* S20b — chip tones, Brad's approved follow-ups (2026-10-24):
 * every TV Dark chip keeps out teen drama, horror and procedurals (not
 * "police procedural" or "spin off": they tag MINDHUNTER, Sherlock, Better
 * Call Saul); TV Drama + Feel-good keeps out teen drama; Romance +
 * Feel-good requires Comedy (romcoms), in discover and in a named title's
 * web. No network: TMDb is a stub.
 * Run: node scripts/validate-s20b.cjs */

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
  // Pools are cached per spec in the module, so each check loads it fresh.
  const fresh = () => load("src/lib/slotRecipe.ts", { "./tmdbVerify": { normalizeTitle: norm }, "./tmdbMedia": media, "./synopsis": { shortSynopsis: (s) => s } });
  const first = async (kind, lane, refiner) => {
    sent.length = 0;
    await fresh().loadPools(kind, lane, refiner);
    const q = sent[0];
    return { q, ids: new Set((q.without_keywords ?? "").split(",").filter(Boolean).map(Number)) };
  };
  const TEEN = [193400, 369277, 6270, 33910, 246466, 188237];
  const HORROR = [315058, 12339, 256183, 295907, 250593];
  const PROC = [207694, 298849, 157241, 180668, 15271, 206958, 212513, 281585];
  const has = (set, list) => list.every((i) => set.has(i));

  console.log("\n1. Every TV Dark chip: no teen drama, no horror, no procedurals");
  for (const lane of ["crime", "drama", "mystery", "thriller", "sci-fi", null]) {
    const { ids } = await first("tv", lane, tone("Dark"));
    check(`TV ${lane ?? "(any)"} + Dark`, has(ids, [...TEEN, ...HORROR, ...PROC]), true);
  }
  let r = await first("tv", "crime", tone("Dark"));
  check("not 'police procedural' (tags MINDHUNTER, Sherlock, Dexter)", r.ids.has(268067), false);
  check("not 'spin off' (tags Better Call Saul)", r.ids.has(15285), false);
  check("not 'teenager' (tags Unbelievable)", r.ids.has(296608), false);
  r = await first("movie", "crime", tone("Dark"));
  check("movie Dark chips unchanged (no keyword keep-out)", r.ids.size, 0);

  console.log("\n2. TV Drama + Feel-good: no teen drama");
  r = await first("tv", "drama", tone("Feel-good"));
  check("TV Drama + Feel-good keeps teen out", has(r.ids, TEEN), true);
  r = await first("tv", "comedy", tone("Feel-good"));
  check("TV Comedy + Feel-good keeps teen comedies (Never Have I Ever)", TEEN.some((i) => r.ids.has(i)), false);

  console.log("\n2b. S20c — TV Feel-good keeps Crime out unless the lane carries it");
  const wg = (q) => (q.without_genres ?? "").split(",").filter(Boolean).map(Number);
  for (const lane of ["drama", "comedy", "mystery", "sci-fi", null]) {
    r = await first("tv", lane, tone("Feel-good"));
    check(`TV ${lane ?? "(any)"} + Feel-good: Crime out`, wg(r.q).includes(80), true);
  }
  r = await first("tv", "crime", tone("Feel-good"));
  check("TV Crime + Feel-good keeps Crime", [wg(r.q).includes(80), r.q.with_genres], [false, "80"]);
  r = await first("tv", "thriller", tone("Feel-good"));
  check("TV Thriller (Mystery|Crime) + Feel-good keeps Crime (the lane carries it)", wg(r.q).includes(80), false);
  r = await first("tv", "drama", tone("Dark"));
  check("TV Dark chips keep Crime", wg(r.q).includes(80), false);
  r = await first("movie", "drama", tone("Feel-good"));
  check("movie Feel-good unchanged (Crime allowed)", wg(r.q).includes(80), false);

  console.log("\n3. Romance + Feel-good is romcom");
  r = await first("movie", "romance", tone("Feel-good"));
  check("with_genres = Romance AND Comedy", r.q.with_genres, "10749,35");
  r = await first("movie", "romance", tone("Comfort watch"));
  check("a comfort tone too", r.q.with_genres, "10749,35");
  r = await first("movie", "romance", null);
  check("Romance alone stays Romance", r.q.with_genres, "10749");
  r = await first("movie", "romance", tone("Dark"));
  check("Romance + Dark stays Romance", r.q.with_genres, "10749");
  r = await first("movie", "comedy", tone("Feel-good"));
  check("Comedy + Feel-good stays Comedy", r.q.with_genres, "35");
  r = await first("tv", "thriller", null);
  check("an OR lane keeps its OR (TV thriller = Mystery|Crime)", r.q.with_genres, "9648|80");
  sent.length = 0;
  await fresh().loadMoodPools("movie", "romance", tone("Feel-good"), [{ ids: [6075], exclude: false }]);
  check("a typed feel-good romance mood is romcom too", sent[0].with_genres, "10749,35");
  const cand = (id, genreIds) => ({ tmdbId: id, title: `T${id}`, year: 2010, genreIds, votes: 5000, rating: 7.5, kind: "movie" });
  const web = R.webPools("movie", "romance", tone("Feel-good"), {
    candidates: [cand(1, [10749, 18]), cand(2, [10749, 35]), cand(3, [35, 10749, 18])],
  });
  check("a named title's web keeps only romcoms", web.all.map((c) => c.tmdbId).sort(), [2, 3]);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
