#!/usr/bin/env node
/* S12b — Steer by + the slot recipe for Movies/TV mood chips: the recipe
 * per go-to count, the no-repeat guarantee, the wildcard slot, nearest
 * go-to, the "vs. your <go-to>:" lead, the touchstone label, and no prompt
 * text change anywhere. Run: node scripts/validate-s12b.cjs */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

let passed = 0;
let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}  (got ${JSON.stringify(got)}, expected ${JSON.stringify(want)})`);
}
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function load(rel, stubs) {
  const out = ts.transpileModule(read(rel), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText;
  const m = { exports: {} };
  new Function("module", "exports", "require", out)(m, m.exports, (id) => (stubs[id] !== undefined ? stubs[id] : require(id)));
  return m.exports;
}
const R = load("src/lib/slotRecipe.ts", {
  "./synopsis": load("src/lib/synopsis.ts", {}), // S17v: shortSynopsis lives there now
  "./tmdbVerify": { normalizeTitle: norm },
  "./tmdbMedia": { loadMediaBundle: async () => null, resolveSnappedTitle: async () => null, rowTitle: () => "", rowYear: () => null, tmdbGet: async () => null },
});

// Seeded random, so every run samples the same way.
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const mk = (prefix, n, votes0, genre = 35) =>
  Array.from({ length: n }, (_, i) => ({ id: prefix.charCodeAt(0) * 1000 + i, kind: "movie", title: `${prefix} ${i}`, year: 2000, overview: "x.", genreIds: [genre], votes: votes0 - i * 10, rating: 7 }));
const tier1 = mk("T", 50, 30000);
const pools = {
  tier1, tier2: mk("U", 50, 9000), tier3: mk("V", 50, 4000),
  touchstones: tier1.slice(0, 20), popular: tier1.slice(20),
  fresh: mk("F", 50, 2000), classic: mk("C", 50, 8000),
};
const web = mk("N", 30, 6000);

console.log("1. The recipe per go-to count");
check("0 go-tos", R.recipeFor(0), "none");
check("1 go-to", R.recipeFor(1), "one");
check("3 go-tos", R.recipeFor(3), "many");
check("0: 2 touchstones · popular · wildcard · fresh", R.slotsFor("none"), ["touchstone", "touchstone", "popular", "wildcard", "fresh"]);
check("1: touchstone · 3 neighbors (one wildcard) · fresh", R.slotsFor("one"), ["touchstone", "neighbor", "neighbor", "wildcard", "fresh"]);
check("2+: 2 less-famous neighbors · wildcard neighbor · classic · new", R.slotsFor("many"), ["neighbor", "neighbor", "wildcard", "classic", "new"]);
for (const recipe of ["none", "one", "many"]) {
  check(`every recipe keeps one wildcard slot (${recipe})`, R.slotsFor(recipe).filter((s) => s === "wildcard").length, 1);
}

console.log("\n2. Slots draw from the right pools");
const a0 = R.assemble({ recipe: "none", pools, neighbors: [], excluded: new Set(), rand });
check("0: touchstones are top-20 tier 1", a0.filter((p) => p.slot === "touchstone").every((p) => pools.touchstones.includes(p) || pools.touchstones.some((t) => t.id === p.id)), true);
check("0: wildcard comes from tier 3", pools.tier3.some((t) => t.id === a0.find((p) => p.slot === "wildcard").id), true);
check("0: fresh from the fresh pool", pools.fresh.some((t) => t.id === a0.find((p) => p.slot === "fresh").id), true);
const a1 = R.assemble({ recipe: "one", pools, neighbors: web, excluded: new Set(), rand });
check("1: neighbors from the go-to's web, close end", a1.filter((p) => p.slot === "neighbor").every((p) => web.slice(0, 12).some((w) => w.id === p.id)), true);
check("1: wildcard from the far end of the web", web.slice(15).some((w) => w.id === a1.find((p) => p.slot === "wildcard").id), true);
const a2 = R.assemble({ recipe: "many", pools, neighbors: web, excluded: new Set(), rand });
const byVotes = [...web].sort((x, y) => y.votes - x.votes);
check("2+: neighbors one tier less famous (most-voted third skipped)", a2.filter((p) => p.slot === "neighbor").every((p) => byVotes.slice(10).some((w) => w.id === p.id)), true);
check("2+: classic from the classic pool", pools.classic.some((t) => t.id === a2.find((p) => p.slot === "classic").id), true);
check("2+: new release from the fresh pool", pools.fresh.some((t) => t.id === a2.find((p) => p.slot === "new").id), true);

console.log("\n3. The guarantee: nothing excluded ever ships, and nothing repeats");
const shown = new Set();
let repeats = 0;
let excludedShipped = 0;
let total = 0;
const banned = new Set([...pools.touchstones.slice(0, 15), ...web.slice(0, 5)].map((c) => norm(c.title)));
for (let i = 0; i < 25; i++) {
  const ex = new Set([...shown, ...banned]);
  const set = R.assemble({ recipe: i % 3 === 0 ? "none" : i % 3 === 1 ? "one" : "many", pools, neighbors: web, excluded: ex, rand });
  for (const p of set) {
    if (banned.has(norm(p.title))) excludedShipped++;
    if (shown.has(norm(p.title))) repeats++;
    total++;
    shown.add(norm(p.title));
  }
}
check("25 sets: excluded titles shipped", excludedShipped, 0);
check("25 sets: repeats", repeats, 0);
check("25 sets: every shipped title distinct", shown.size, total);
check("25 sets: nearly full (honest-short only when a pool ran dry)", total >= 115, true);
const tiny = { tier1: mk("T", 3, 100), tier2: [], tier3: [], touchstones: mk("T", 2, 100), popular: [], fresh: [], classic: [] };
const short = R.assemble({ recipe: "none", pools: tiny, neighbors: [], excluded: new Set(), rand });
check("dry pools ship honest-short, never a repeat", short.length <= 3 && new Set(short.map((p) => p.title)).size === short.length, true);
const one = R.assemble({ recipe: "one", pools, neighbors: web, excluded: new Set(), count: 1, only: "wildcard", rand });
check("a one-card replacement keeps its slot", one.map((p) => p.slot), ["wildcard"]);

console.log("\n4. Neighbors stay in the chip's genre");
const spy = { name: "Lioness", tmdbKind: "tv", tmdbId: 1, at: "2026-10-18", bundle: { genreIds: [18, 10768], candidates: mk("S", 20, 3000, 18) } };
const nb = R.neighborPool(spy, [35], 6.9, pools);
check("no comedy in the web → every neighbor is a comedy from the lane pool", nb.length > 0 && nb.every((c) => c.genreIds.includes(35)), true);
check("no lane (Surprise me) → the whole web", R.neighborPool(spy, [], 6.9, pools).length, 20);

console.log("\n5. Nearest go-to");
const lane = [35];
const comedyFan = { name: "Grand Budapest", at: "2026-10-01T00:00:00Z", bundle: { genreIds: [35, 18], candidates: pools.tier1.slice(0, 5) } };
const crimeFan = { name: "Heat", at: "2026-10-18T00:00:00Z", bundle: { genreIds: [80, 53], candidates: [] } };
const r1 = R.rankGoTos([crimeFan, comedyFan], lane, pools);
check("genre + web links beat recency", r1.order.map((g) => g.name), ["Grand Budapest", "Heat"]);
const r2 = R.rankGoTos([{ ...comedyFan, bundle: null }, { ...crimeFan, bundle: null }], lane, pools);
check("no signal → most recent first", r2.order.map((g) => g.name), ["Heat", "Grand Budapest"]);

console.log("\n6. Card text");
check("lead lower-cases an ordinary opener", R.leadLine("Same CIA pressure, but the mole is inside."), "same CIA pressure, but the mole is inside.");
check("lead keeps a name", R.leadLine("Sing Street swaps the war for a band."), "Sing Street swaps the war for a band.");
check("synopsis short ≤ 220 at a sentence end", (() => { const t = R.shortSynopsis("A ".repeat(60) + "end. " + "B ".repeat(80) + "end."); return t.length <= 220 && t.endsWith("."); })(), true);
const SC = load("src/lib/slotsClient.ts", { "./userPrefs": {}, "./goTos": {}, "./screenVisit": {}, "./aiServiceError": {} });
check("vs. your Grand Budapest Hotel (article dropped)", SC.goToShortName("The Grand Budapest Hotel"), "Grand Budapest Hotel");
check("vs. your Lioness", SC.goToShortName("Lioness"), "Lioness");
check("a one-word 'The X' keeps its article when the rest is tiny", SC.goToShortName("The It"), "The It");

console.log("\n7. No prompt text changed");
// S13a: S12's own range (main has moved on; S13 routes the call through llm.ts).
const promptDiff = execSync("git diff 6588529~1 3ccba4d -- src/lib/mediaReks.ts", { cwd: root, encoding: "utf8" });
const removed = promptDiff.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---"));
check("mediaReks.ts: nothing removed (CHOOSER_PROMPT untouched)", removed.length, 0);
check("lines call uses CHOOSER_PROMPT verbatim", /(content|system): CHOOSER_PROMPT \+ ownSlotsNote\(args\.candidates\.length\)/.test(read("src/lib/mediaReks.ts")), true);
const engineDiff = execSync("git diff main -- src/engine/rekomendrEngine.ts", { cwd: root, encoding: "utf8" });
check("engine: buildAIPrompt untouched", /^[-+].*(buildAIPrompt|You are Rekomendr)/m.test(engineDiff), false);
const route = read("app/api/slots/route.ts");
// S24a — the writer runs per Compare to ref (linesByRef): no ref, no call.
check("no-ref sets make no model call (lines only for a steering ref)", route.includes("if (!ref.bundle || cards.length === 0) return;"), true);
check("the line call is capped like every chooser call", route.includes('capGate(args.clientId, "reksnap-text")'), true);
check("a failed line call ships synopses, named", route.includes('"[slots] compare lines failed — synopses shipped"'), true);
check("TMDb down is loud", route.includes('"[slots] FALLBACK TMDb discover failed; the AI chip search runs"'), true);

console.log("\n8. Screens");
const page = read("app/page.tsx");
check("Movies/TV chip taps run the recipe", page.includes('(meta && (nextCategory === "Movies" || nextCategory === "TV Shows")'), true);
check("a failed recipe falls back loudly to the AI chip search", page.includes('console.warn("[slots] FALLBACK — running the AI chip search"'), true);
check("every landed set is counted for repeats", (page.match(/noteSetShown\(/g) || []).length >= 3, true);
// S17 — the Steer by row is gone; favorites still steer underneath (the slot recipe).
check("Steer by row removed (S17)", page.includes("SteerByRow"), false);
const res = read("src/components/ResultsV4.tsx");
check("touchstone label + inline star", res.includes("A classic to steer by") && res.includes('logGoToEvent("touchstone_star"'), true);
check("touchstones shown are counted", res.includes('logGoToEvent("touchstone_shown"'), true);
check("vs lead names the go-to", res.includes("`vs. your ${goToShortName(rek.vsGoTo)}:`"), true);
check("backfill on a recipe card comes from the recipe", res.includes("backfillOverride && removed.slot"), true);
const row = read("src/components/SteerByRow.tsx");
check("Steer by row hidden with no go-tos", row.includes("if (names.length === 0) return null;"), true);

console.log("\n9. New wording: only the approved strings");
// S12's own range (6588529~1 = pre-S12 main → the #39 merge), so the check keeps its
// meaning after the merge; a later diff against main would be empty.
const diff = execSync("git diff 6588529~1 3ccba4d -- src app", { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const added = diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
const jsxText = added.flatMap((l) => [...l.matchAll(/>\s*([A-Za-z][^<>{}]*?)\s*</g)].map((m) => m[1].trim())).filter(Boolean);
// "Promise" is a TypeScript generic (Promise<Rek | null>), not JSX text.
const allowed = new Set(["Your go-tos", "+ More like this", "Wine", "Steer by", "Promise"]);
check("visible JSX text added", [...new Set(jsxText)].filter((t) => !allowed.has(t)), []);
check("touchstone label text", added.some((l) => l.includes("A classic to steer by")), true);

console.log("\n10. Wine unchanged");
const wineDiff = execSync("git diff 6588529~1 3ccba4d --stat -- app/api/wine src/lib/wineVisit.ts src/lib/wineShelf.ts src/lib/wineReks.ts src/components/WineFacts.tsx src/components/HaulConfirm.tsx src/components/WineFollowup.tsx", { cwd: root, encoding: "utf8" });
check("wine route + libs byte-identical across S12", wineDiff.trim(), "");

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
