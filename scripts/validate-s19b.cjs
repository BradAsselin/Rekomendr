#!/usr/bin/env node
/* S19b — typed titles with subtitles (docs/s19-fast-moods-plan.md, Part B).
 * "Glass Onion" lands on Glass Onion: A Knives Out Mystery; an exact match
 * and the head matches compete, and a winner must lead by 1.25× or the
 * search runs. TMDb is a stub serving the vote counts measured on
 * 2026-10-24.
 * Run: node scripts/validate-s19b.cjs */

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
function load(rel, stubs) {
  const out = ts.transpileModule(read(rel), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true },
  }).outputText;
  const m = { exports: {} };
  new Function("module", "exports", "require", out)(m, m.exports, (id) => (stubs[id] !== undefined ? stubs[id] : require(id)));
  return m.exports;
}
for (const level of ["warn", "info", "error"]) console[level] = () => {};

const verify = load("src/lib/tmdbVerify.ts", {});
const M = (title, year, votes, id) => ({ id, title, original_title: title, release_date: `${year}-01-01`, vote_count: votes, overview: "o" });
const T = (name, year, votes, id) => ({ id, name, original_name: name, first_air_date: `${year}-01-01`, vote_count: votes, overview: "o" });
const DB = {
  movie: {
    "Glass Onion": [M("Glass Onion: A Knives Out Mystery", 2022, 7309, 1)],
    Dune: [M("Dune", 2021, 15801, 2), M("Dune: Part Three", 2026, 0, 3), M("Dune: Part Two", 2024, 8817, 4), M("Dune", 1984, 3585, 5)],
    "Spider-Man": [M("Spider-Man: Brand New Day", 2026, 6047, 6), M("Spider-Man", 2002, 21654, 7), M("Spider-Man: Homecoming", 2017, 24130, 8), M("Spider-Man: No Way Home", 2021, 23416, 9), M("The Amazing Spider-Man", 2012, 19274, 10)],
    Lioness: [M("Lioness", 2008, 4, 11), M("Lioness", 2024, 5, 12)],
    "Mission Impossible": [M("Mission: Impossible", 1996, 10396, 13), M("Mission: Impossible - Ghost Protocol", 2011, 11112, 14), M("Mission: Impossible - Fallout", 2018, 9495, 15)],
    "John Wick": [M("John Wick", 2014, 21521, 16), M("John Wick: Chapter 4", 2023, 8458, 17), M("John Wick: Chapter 2", 2017, 14770, 18)],
    "Knives Out": [M("Knives Out", 2019, 14684, 19), M("Glass Onion: A Knives Out Mystery", 2022, 7308, 1)],
  },
  tv: {
    Dune: [T("Dune: Prophecy", 2024, 671, 20)],
    "Spider-Man": [T("Spider-Man", 1994, 1188, 21)],
    Lioness: [T("Lioness", 2023, 1717, 22), T("Lioness", 2021, 6, 23)],
  },
};
let down = false;
global.fetch = async (url) => {
  const u = new URL(url);
  const kind = u.pathname.endsWith("/movie") ? "movie" : "tv";
  if (down) return { ok: false, status: 503, json: async () => ({}) };
  return { ok: true, json: async () => ({ results: DB[kind][u.searchParams.get("query")] ?? [] }) };
};
process.env.TMDB_API_KEY = "test-key";
const media = load("src/lib/tmdbMedia.ts", { "./tmdbVerify": verify });

(async () => {
  console.log("\n1. Heads");
  check("every colon / spaced dash", media.titleHeads("Mission: Impossible - Fallout"), ["Mission", "Mission: Impossible"]);
  check("a hyphen in a word is not a separator", media.titleHeads("Spider-Man"), []);
  check("no separator, no head", media.titleHeads("Knives Out"), []);

  console.log("\n2. Brad's four (plus the measured neighbours)");
  const r = async (text, kind) => (await media.resolveTypedTitleChecked(text, kind)).hit;
  const name = (h) => (h ? `${h.title} (${h.year})` : null);
  check('"Glass Onion" → the Knives Out mystery', name(await r("Glass Onion", "movie")), "Glass Onion: A Knives Out Mystery (2022)");
  check('"Dune" → still the 2021 film (1.79× Part Two)', name(await r("Dune", "movie")), "Dune (2021)");
  check('"Dune" under TV → still the 2021 film', name(await r("Dune", "tv")), "Dune (2021)");
  check('"Spider-Man" → search (Homecoming 1.11× the 2002 film)', await r("Spider-Man", "movie"), null);
  check('"Lioness" → the show, unchanged', [name(await r("Lioness", "tv")), (await r("Lioness", "tv")).kind], ["Lioness (2023)", "tv"]);
  check('"Lioness" under Movies → still the show', (await r("Lioness", "movie")).kind, "tv");
  check('"Mission Impossible" → search (Ghost Protocol vs 1996)', await r("Mission Impossible", "movie"), null);
  check('"John Wick" → 2014 (1.46× Chapter 2)', name(await r("John Wick", "movie")), "John Wick (2014)");
  check('"Knives Out" → Knives Out (Glass Onion\'s head is not Knives Out)', name(await r("Knives Out", "movie")), "Knives Out (2019)");
  check("a year still picks among head matches", name(await r("Dune 2024", "movie")), "Dune: Part Two (2024)");
  check("the vote floor holds for heads (Part Three, 0 votes)", name(await r("Dune 2026", "movie")), null);

  console.log("\n3. Ambiguity is a clean 'not a title', never a lookup error");
  check("no lookupError on an ambiguous head", (await media.resolveTypedTitleChecked("Spider-Man", "movie")).lookupError, null);
  down = true;
  check("a failed TMDb still says so", (await media.resolveTypedTitleChecked("Glass Onion", "movie")).lookupError, "movie:http_503,tv:http_503");
  down = false;
  check("the ambiguity is logged", read("src/lib/tmdbMedia.ts").includes('"[typed-anchor] ambiguous title — search"'), true);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
