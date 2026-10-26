#!/usr/bin/env node
/* S21 — chip rows (docs/s21-chip-rows-plan.md, Brad 2026-10-25): genres in
 * one scrolling row in the approved order; vibes in a second row shown only
 * once a genre is picked (a second tap on the genre hides them); the ten
 * vibes and their TMDb pools (Funny, Cozy, Tense, Epic, Short new); new
 * lanes (War, Western; TV Sci-Fi & Fantasy, Action & Adventure, Western);
 * no go-tos bar on home; "+ More like this" on Favorites. No network:
 * TMDb is a stub. (Not validate-s21.cjs — that file is S10's.)
 * Run: node scripts/validate-s21-chip-rows.cjs */

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
function load(rel, stubs = {}) {
  const out = ts.transpileModule(read(rel), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true },
  }).outputText;
  const m = { exports: {} };
  new Function("module", "exports", "require", out)(m, m.exports, (id) => (stubs[id] !== undefined ? stubs[id] : require(id)));
  return m.exports;
}
for (const level of ["warn", "info", "error"]) console[level] = () => {};

(async () => {
  /* ---------------- chips and vibes ---------------- */
  const C = load("src/lib/moodChips.ts");
  const labels = (cat) => C.CHIPS_BY_CATEGORY[cat].map((c) => c.label);
  check(
    "Movies genres, approved order",
    labels("Movies"),
    ["Comedy", "Drama", "Thriller", "Action", "Romance", "Crime", "Sci-Fi", "Horror", "Mystery", "Animation", "Family", "Fantasy", "Documentary", "War", "Western", "Surprise me"]
  );
  check(
    "TV genres, approved order",
    labels("TV Shows"),
    ["Comedy", "Drama", "Crime", "Mystery", "Sci-Fi & Fantasy", "Action & Adventure", "Reality", "Documentary", "Animation", "Family", "Western", "Surprise me"]
  );
  check("Wine keeps its chips", labels("Wine"), ["Bold Red", "Crisp White", "Bubbles", "Rosé", "Surprise me"]);
  const VIBES = ["Feel-good", "Funny", "Dark", "Smart", "Cozy", "Tense", "Epic", "Classic", "New", "Short"];
  check("Movies vibes, approved order", C.REFINERS_BY_CATEGORY.Movies.map((r) => r.label), VIBES);
  check("TV vibes, approved order", C.REFINERS_BY_CATEGORY["TV Shows"].map((r) => r.label), VIBES);
  // S21b — Books keeps its chips and its five vibes, in the same layout.
  check("Books keeps its chips", labels("Books"), ["Mystery", "Thriller", "Romance", "Fantasy", "Sci-Fi", "Non-Fiction", "Surprise me"]);
  check("Books keeps its vibes", C.REFINERS_BY_CATEGORY.Books.map((r) => r.label), ["Feel-good", "Dark", "Smart", "Classic", "New"]);
  check("Wine keeps its styles", C.REFINERS_BY_CATEGORY.Wine.map((r) => r.label), ["Easy sipper", "Special occasion", "Crisp & dry", "Rich & cozy"]);
  const engine = read("src/engine/rekomendrEngine.ts");
  const tones = [...C.REFINERS_BY_CATEGORY.Movies, ...C.REFINERS_BY_CATEGORY["TV Shows"]].filter((r) => r.kind === "tone");
  check(
    "every tone vibe rides an existing TONE_BY_VIBE key (no prompt change)",
    tones.filter((r) => !engine.includes(`"${r.vibe}":`)).map((r) => r.vibe),
    []
  );
  const short = C.REFINERS_BY_CATEGORY.Movies.find((r) => r.label === "Short");
  check("Short on the AI fallback (movies)", C.chipQuery("Movies", { label: "Comedy", lane: "Comedy" }, short), "Movies||Comedy movies under 100 minutes||||mode:ai");
  check("Short on the AI fallback (TV)", C.chipQuery("TV Shows", { label: "Drama", lane: "Drama" }, short), "TV Shows||Drama limited series||||mode:ai");

  /* ---------------- pools ---------------- */
  const sent = [];
  let rows = [];
  let taggedRows = null; // when set, a with_keywords pull answers these
  const details = {};
  const media = {
    tmdbGet: async (p, params) => {
      if (/^(tv|movie)\/\d+$/.test(p)) return details[p] ?? null;
      sent.push({ p, ...params });
      const list = taggedRows && params.with_keywords ? taggedRows : rows;
      return { results: params.page === "1" ? list : [] };
    },
    rowTitle: (r) => r.title ?? r.name ?? "",
    rowYear: () => 2010,
    safePosterPath: () => null,
    loadMediaBundle: async () => null,
    resolveSnappedTitle: async () => null,
  };
  const fresh = () => load("src/lib/slotRecipe.ts", { "./tmdbVerify": { normalizeTitle: norm }, "./tmdbMedia": media, "./synopsis": { shortSynopsis: (s) => s } });
  const first = async (kind, lane, refiner) => {
    sent.length = 0;
    const pools = await fresh().loadPools(kind, lane, refiner);
    return { q: sent[0], pools };
  };
  const tone = (vibe) => ({ kind: "tone", vibe });
  const without = (q) => (q.without_genres ?? "").split(",").filter(Boolean).map(Number);
  const withoutK = (q) => new Set((q.without_keywords ?? "").split(",").filter(Boolean).map(Number));

  let r = await first("movie", "War", null);
  check("Movies War → 10752", r.q.with_genres, "10752");
  r = await first("movie", "Western", null);
  check("Movies Western → 37", r.q.with_genres, "37");
  r = await first("movie", "Horror", null);
  check("Movies Horror → 27", r.q.with_genres, "27");
  r = await first("tv", "Sci-Fi & Fantasy", null);
  check("TV Sci-Fi & Fantasy → 10765", r.q.with_genres, "10765");
  r = await first("tv", "Action & Adventure", null);
  check("TV Action & Adventure → 10759", r.q.with_genres, "10759");
  r = await first("tv", "Western", null);
  check("TV Western → 37", r.q.with_genres, "37");
  r = await first("tv", "sci-fi", null);
  check("old TV sci-fi alias still pools", r.q.with_genres, "10765");

  r = await first("movie", "Comedy", null);
  check("kids' animation stays out of Comedy", [16, 10751].every((g) => without(r.q).includes(g)), true);
  check("plain movie chips: the 60-minute floor, no cap", ["with_runtime.gte", "with_runtime.lte"].map((k) => r.q[k] ?? null), ["60", null]);
  check("the dead with_runtime_gte param is gone", r.q.with_runtime_gte ?? null, null);
  r = await first("tv", "Comedy", null);
  check("TV chips send no runtime floor", r.q["with_runtime.gte"] ?? null, null);
  r = await first("movie", "Comedy", null);
  r = await first("movie", "Animation", null);
  check("Movies Animation keeps Family (Pixar)", without(r.q).includes(10751), false);
  r = await first("movie", "Family", null);
  check("Movies Family keeps Animation", without(r.q).includes(16), false);
  r = await first("tv", "Animation", null);
  check("TV Animation keeps TV Kids out", without(r.q).includes(10762), true);
  r = await first("tv", "Family", null);
  check("TV Family lets TV Kids in", without(r.q).includes(10762), false);

  r = await first("movie", "Drama", tone("Goofy / Silly Fun"));
  check("Funny on Drama requires Comedy", r.q.with_genres, "18,35");
  r = await first("movie", "Comedy", tone("Goofy / Silly Fun"));
  check("Funny on Comedy is Comedy", r.q.with_genres, "35");

  r = await first("movie", "Drama", tone("Comfort Watch"));
  check("Cozy: warmth tags (OR)", (r.q.with_keywords ?? "").split("|").map(Number).includes(319357) && !(r.q.with_keywords ?? "").includes(","), true);
  check("Cozy: not friendship / small town (measured too loose)", [6054, 1415].some((k) => (r.q.with_keywords ?? "").split("|").map(Number).includes(k)), false);
  check("Cozy: horror, thriller, war, crime, action out", [27, 53, 10752, 80, 28].every((g) => without(r.q).includes(g)), true);
  check("Cozy: Feel-good's sad tags out", withoutK(r.q).has(10614), true);
  taggedRows = [{ id: 32, title: "Tagged Warm", overview: "x", genre_ids: [18], vote_count: 300, vote_average: 7 }];
  rows = [
    { id: 31, title: "Big Romcom", overview: "x", genre_ids: [18, 35], vote_count: 9000, vote_average: 7 },
    { id: 33, title: "Heavy Drama", overview: "x", genre_ids: [18], vote_count: 8000, vote_average: 8 },
  ];
  sent.length = 0;
  const cozyPools = await fresh().loadPools("movie", "Drama", tone("Comfort Watch"));
  const mainCalls = sent.filter((q) => q.page === "1" && !q["primary_release_date.gte"] && !q["primary_release_date.lte"]);
  check("Cozy: a tagged pull and an untagged fill", mainCalls.map((q) => !!q.with_keywords).sort(), [false, true]);
  check("Cozy: tagged titles lead; the fill is Comedy/Romance only", cozyPools.tier1.map((c) => c.title), ["Tagged Warm", "Big Romcom"]);
  taggedRows = null;
  rows = [];
  r = await first("tv", "Crime", tone("Comfort Watch"));
  check("Cozy on TV Crime keeps Crime", without(r.q).includes(80), false);
  r = await first("tv", "Drama", tone("Comfort Rewatch"));
  check("TV Feel-good is not Cozy (no warmth tags)", r.q.with_keywords ?? null, null);
  check("TV Feel-good keeps S20c Crime keep-out", without(r.q).includes(80), true);

  rows = [
    { id: 1, title: "Laugh", overview: "x", genre_ids: [35], vote_count: 900, vote_average: 7 },
    { id: 2, title: "Grip", overview: "x", genre_ids: [53, 18], vote_count: 800, vote_average: 7 },
    { id: 3, title: "Whodunit", overview: "x", genre_ids: [9648], vote_count: 700, vote_average: 7 },
  ];
  r = await first("movie", null, tone("Suspense / Edge-of-Seat"));
  check("Tense (movies): only Thriller/Mystery titles", r.pools.tier1.map((c) => c.title), ["Grip", "Whodunit"]);
  r = await first("tv", "Drama", tone("Edge-of-Seat"));
  check("Tense (TV): procedurals out", withoutK(r.q).has(207694), true);
  rows = [
    { id: 21, name: "Heroes Inc", overview: "x", genre_ids: [10759, 18], vote_count: 900, vote_average: 8 },
    { id: 22, name: "Cold Case", overview: "x", genre_ids: [80, 18], vote_count: 800, vote_average: 8 },
  ];
  r = await first("tv", "Drama", tone("Edge-of-Seat"));
  check("Tense (TV): Mystery/Crime only, not Action & Adventure", r.pools.tier1.map((c) => c.title), ["Cold Case"]);

  rows = [
    { id: 4, title: "Saga", overview: "x", genre_ids: [12, 18], vote_count: 900, vote_average: 8 },
    { id: 5, title: "Chamber", overview: "x", genre_ids: [18], vote_count: 800, vote_average: 8 },
  ];
  details["movie/4"] = { runtime: 160 };
  details["movie/5"] = { runtime: 170 };
  r = await first("movie", "Drama", tone("Epic / Immersive"));
  check("Epic (movies): 130+ minutes", r.q["with_runtime.gte"], "130");
  check("Epic (movies): scale genres only", r.pools.tier1.map((c) => c.title), ["Saga"]);
  rows = [
    { id: 6, title: "Long Cut", overview: "x", genre_ids: [12], vote_count: 900, vote_average: 8 },
    { id: 7, title: "True Epic", overview: "x", genre_ids: [12], vote_count: 800, vote_average: 8 },
  ];
  details["movie/6"] = { runtime: 111 }; // discover matched an alternate cut
  details["movie/7"] = { runtime: 150 };
  r = await first("movie", "Action", tone("Epic / Immersive"));
  check("Epic (movies): the title's own runtime decides", r.pools.tier1.map((c) => c.title), ["True Epic"]);
  r = await first("tv", "Drama", tone("Epic / Immersive"));
  check("Epic (TV): needs a scale tag (epic, kingdom, battle…)", (r.q.with_keywords ?? "").split("|").map(Number).includes(377433), true);

  rows = [
    { id: 8, title: "Quick One", overview: "x", genre_ids: [35], vote_count: 900, vote_average: 8 },
    { id: 9, title: "Just Over", overview: "x", genre_ids: [35], vote_count: 800, vote_average: 8 },
    { id: 10, title: "Too Long", overview: "x", genre_ids: [35], vote_count: 700, vote_average: 8 },
    { id: 15, title: "No Runtime", overview: "x", genre_ids: [35], vote_count: 600, vote_average: 8 },
  ];
  details["movie/8"] = { runtime: 88 };
  details["movie/9"] = { runtime: 102 };
  details["movie/10"] = { runtime: 109 };
  details["movie/15"] = { runtime: 0 };
  r = await first("movie", "Comedy", { kind: "short" });
  check("Short (movies): 60-100 minutes", [r.q["with_runtime.gte"], r.q["with_runtime.lte"]], ["60", "100"]);
  check("Short (movies): own runtime ≤ ~100; unknown dropped", r.pools.tier1.map((c) => c.title), ["Quick One", "Just Over"]);

  rows = [
    { id: 11, name: "Long Runner", overview: "x", genre_ids: [18], vote_count: 900, vote_average: 8 },
    { id: 12, name: "Two Seasons", overview: "x", genre_ids: [18], vote_count: 800, vote_average: 8 },
    { id: 13, name: "The Mini", overview: "x", genre_ids: [18], vote_count: 700, vote_average: 8 },
    { id: 14, name: "Unread", overview: "x", genre_ids: [18], vote_count: 600, vote_average: 8 },
  ];
  details["tv/11"] = { number_of_seasons: 7, type: "Scripted" };
  details["tv/12"] = { number_of_seasons: 2, type: "Scripted" };
  details["tv/13"] = { number_of_seasons: 1, type: "Miniseries" };
  r = await first("tv", "Drama", { kind: "short" });
  check("Short (TV): ≤2 seasons or miniseries; unread dropped", r.pools.tier1.map((c) => c.title), ["Two Seasons", "The Mini"]);
  rows = [];

  /* ---------------- route + client ---------------- */
  const route = read("app/api/slots/route.ts");
  check("route accepts the Short refiner", /raw\?\.kind === "short"\) return \{ kind: "short" \}/.test(route), true);
  check("route log names Short", /: "short"/.test(route), true);
  const page = read("app/page.tsx");
  check("page sends Short to the recipe", /: \{ kind: "short" \}/.test(page), true);

  /* ---------------- the bar ---------------- */
  const bar = read("src/components/SearchBar.tsx");
  check("genre row scrolls, no scrollbar, bleeds to the edge", /data-testid="genre-row"/.test(bar) && /overflow-x-auto/.test(bar) && /\[scrollbar-width:none\]/.test(bar) && /\[&::-webkit-scrollbar\]:hidden/.test(bar) && /-mx-4/.test(bar), true);
  check("chips don't shrink or wrap", /shrink-0 whitespace-nowrap rounded-full border px-3\.5/.test(bar), true);
  check("vibe row only once a genre is picked", /\{activeChip && \(\s*<div\s+className="vibe-row/.test(bar), true);
  check("second tap on the genre clears it and its vibe, no search", /if \(chipRef\.current\?\.label === c\.label\) \{\s*chipRef\.current = null;\s*setActiveChip\(null\);\s*setRefiner\(null\);\s*return;/.test(bar), true);
  check("vibe row fades/slides in; none under reduced motion", /@keyframes vibeIn/.test(bar) && /prefers-reduced-motion: reduce\) \{\s*\.vibe-row \{\s*animation: none;/.test(bar), true);
  check("one chip layout for every category (Books, Wine included: no per-category row)", (bar.match(/data-testid="genre-row"/g) || []).length === 1 && (bar.match(/data-testid="vibe-row"/g) || []).length === 1 && !/category === "(Books|Wine)"[^\n]*(genre-row|vibe-row|chips)/.test(bar), true);
  check("search box keeps mic + camera", /data-testid="voice-mic"/.test(bar) && /aria-label="Snap"/.test(bar), true);

  /* ---------------- go-tos ---------------- */
  check("home: no go-tos bar in any category", /<GoTosList/.test(page), false);
  check("home: wine follow-up and Bought stay", /<WineFollowup/.test(page) && /<WineBought/.test(page), true);
  // S24b — the RekSnap button split into Say it / Snap it.
  check("home: Say it / Snap it stays", /<SayOrSnap/.test(page), true);
  const sp = read("src/components/SavedPage.tsx");
  check("Favorites tiles have + More like this (wine included)", /more && <MoreLikeThisButton/.test(sp) && /f\.goTo,\s*true\s*\)/.test(sp), true);
  check("…and it counts as a go-to more", /openItem\(targetFor\(category, name, goTo\), true\)/.test(sp), true);
  const layout = read("app/layout.tsx");
  // S24b — Share is in the ⋯ menu.
  check("Saved + the ⋯ menu stay at the top", /<SavedPage \/>/.test(layout) && /<MoreMenu attribution=\{<Attribution \/>\} \/>/.test(layout), true);

  /* ---------------- typed / spoken moods know the new vibes ---------------- */
  const gate = read("src/lib/typedMoodGate.ts");
  check("typed-mood gate covers the new vibe words", ["funny:", "cozy:", "tense:", "epic:", "short:"].every((k) => gate.includes(k)), true);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
