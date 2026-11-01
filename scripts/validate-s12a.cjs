#!/usr/bin/env node
/* S12a — go-tos across categories: the star on movies/TV/books cards, the
 * home "Your go-tos" list, "+ More like this" from a go-to tile / the
 * starred anchor / a "Wine you bought" tile, and the /api/stats rows.
 * Wine's own go-to (S8) must be untouched. Run: node scripts/validate-s12a.cjs */

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
function load(rel) {
  const out = ts.transpileModule(read(rel), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText;
  const m = { exports: {} };
  new Function("module", "exports", "require", out)(m, m.exports, require);
  return m.exports;
}

console.log("1. Which categories carry a go-to star (an allow-list)");
const { goToCategoryFor, GOTO_EVENT_KINDS } = load("src/lib/goToCategory.ts");
for (const [inp, want] of [
  ["Movies", "movies"], ["movie", "movies"], ["film", "movies"],
  ["TV Shows", "tv"], ["tv", "tv"], ["TV Show", "tv"],
  ["Books", "books"], ["book", "books"],
  ["wine", null], ["Wine", null], ["supplements", null], ["vitamins", null],
  ["medication", null], ["food", null], ["", null], [undefined, null],
]) check(`goToCategoryFor(${JSON.stringify(inp)})`, goToCategoryFor(inp), want);
check("event kinds", [...GOTO_EVENT_KINDS].sort(), ["goto_more", "set_shown", "steer_switch", "touchstone_shown", "touchstone_star"]);

console.log("\n2. The migration: additive, RLS on, client roles revoked");
const sql = read("docs/sql/s12-go-tos.sql");
check("go_tos created", sql.includes("create table public.go_tos ("), true);
check("goto_events created", sql.includes("create table public.goto_events ("), true);
check("RLS enabled on both", (sql.match(/enable row level security/g) || []).length, 2);
check("anon/authenticated revoked on both", (sql.match(/revoke all on table public\.(go_tos|goto_events) from anon, authenticated;/g) || []).length, 2);
check("no client policy", /create policy/i.test(sql), false);
check("many go-tos, one live per name", sql.includes("on public.go_tos (client_id, category, lower(name)) where cleared_at is null"), true);
check("wine stays in wine_marks (refused here)", sql.includes("check (category in ('movies', 'tv', 'books'))"), true);
const block2 = sql.split("BLOCK 2")[1].split("BLOCK 3")[0];
check("no destructive DDL in the migration block", /\b(drop|delete|truncate)\b/i.test(block2.replace(/--.*$/gm, "")), false);
check("positive controls present", new Set(sql.match(/POSITIVE CONTROL \d/g) || []).size, 2);

console.log("\n3. /api/gotos");
const route = read("app/api/gotos/route.ts");
for (const a of ['action === "state"', 'action === "star"', 'action === "unstar"', 'action === "event"']) check(`handles ${a}`, route.includes(a), true);
check("service-role store (no client policies needed)", route.includes("getSnapshotStore()"), true);
check("no OpenAI import", /openai/i.test(route.replace(/\/\/.*$/gm, "")), false);
check("un-star keeps history (update, never delete)", /\.delete\(/.test(route), false);
check("missing table is named", route.includes('"migration_pending"'), true);
check("a repeat on screen is shouted", route.includes('"[go-tos] REPEAT shown"'), true);
check("screens resolve TMDb id + genres", route.includes("genreIds: b.genreIds"), true);
check("bundle carries genre ids", read("src/lib/tmdbMedia.ts").includes("genreIds: (Array.isArray(raw.genres)"), true);

console.log("\n4. The star on cards");
const star = read("src/components/GoToStar.tsx");
check("renders nothing outside the allow-list", star.includes("if (!goToCategoryFor(item.category)) return null;"), true);
const snap = read("src/components/RekSnapResults.tsx");
check("snap lane: health is checked before the go-to star", snap.includes("!anchorIsHealthMedical && goToCategoryFor(category ?? detectedCategory) ? ("), true);
check("snap lane: the anchor star carries its TMDb id", snap.includes("tmdbId: name === result.detected_item.name ? result.media?.id ?? null : null"), true);
check("snap lane: rek cards get the star (frontier + trail)", (snap.match(/rek\.wine \|\| goToCategoryFor\(/g) || []).length, 2);
check("snap lane: wine star path kept", snap.includes("anchorIsWine && isWineCategory(category ?? detectedCategory) ? ("), true);
const res = read("src/components/ResultsV4.tsx");
// S17 — a D2 frontier card (Movies/TV) always carries the star: `d2 ? <GoToStar …/> : starFor(rek)`.
check("search lane: star on frontier + trail cards", (res.match(/starSlot=\{[^\n]*starFor\(rek\)/g) || []).length, 2);

console.log("\n5. + More like this");
check("starred anchor shows it collapsed", snap.includes("!(anchorOpen || anchorIsStarred) ? undefined"), true);
check("starred-anchor taps are counted", snap.includes('if (anchorIsStarred) logGoToEvent("goto_more"'), true);
const page = read("app/page.tsx");
// S21 — no go-tos bar on the home screen in any category (Saved → Favorites holds them).
check("home shows no go-tos bar (S21)", page.includes("<GoTosList"), false);
check("Wine you bought rows have it (not counted as a go-to)", page.includes('moreFromGoTo({ category: "wine", name }, { counted: false })'), true);
check("screens open the go-to as the anchor (TMDb, then the chooser)", page.includes('action: "open"') && page.includes("fetchTypedReks(anchor.media, null)"), true);
// S31 — as a More like this set ({ mlt: true }: its Compare to starts unchecked).
// S36 — the set also names its title for Recent ("More like [Title]").
check("books + wine run the typed search on the name", page.includes("void handleSearch(`${bar}||||${t.name}||mode:ai`, bar, undefined, undefined, undefined, undefined, { mlt: true, mltName: t.name });"), true);
const anchorRoute = read("app/api/anchor/route.ts");
check('/api/anchor handles "open"', anchorRoute.includes('if (body?.action === "open") return await open(body);'), true);
check("open makes no model call (the reks follow via \"reks\")", anchorRoute.split("async function open")[1].split("async function card")[0].includes("chooseMediaReks"), false);
const list = read("src/components/GoTosList.tsx");
check("tiles carry + More like this", list.includes("+ More like this"), true);

console.log("\n6. New wording: only the approved strings");
// S13c: S12a's own merge (main has moved on).
const diff = execSync("git diff 6588529~1 6588529 -- src app", { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const added = diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
const jsxText = added
  .flatMap((l) => [...l.matchAll(/>\s*([A-Za-z][^<>{}]*?)\s*</g)].map((m) => m[1].trim()))
  .filter(Boolean);
// S12b's approved "Steer by" and a TypeScript generic (Promise<…>) also
// appear once S12b is stacked on this.
const allowed = new Set(["Your go-tos", "+ More like this", "Wine", "Steer by", "Promise"]);
check("visible JSX text added", [...new Set(jsxText)].filter((t) => !allowed.has(t)), []);

console.log("\n7. /api/stats");
const stats = read("app/api/stats/route.ts");
for (const k of ["stars_movies", "stars_tv", "stars_books", "stars_wine", "touchstone_star_rate_pct", "more_from_goto", "steer_switches", "repeats"]) {
  check(`readout has ${k}`, stats.includes(`["${k}",`), true);
}
check("agent traffic excluded", stats.includes('String(r.client_id).startsWith("anon_agent")'), true);

console.log("\n8. Wine unchanged");
// S13a: S12's own merge (main has moved on; S13 routes wine through llm.ts).
const wineDiff = execSync("git diff 6588529~1 6588529 --stat -- app/api/wine src/lib/wineVisit.ts src/lib/wineShelf.ts src/lib/wineReks.ts src/components/WineFacts.tsx src/components/HaulConfirm.tsx src/components/WineFollowup.tsx", { cwd: root, encoding: "utf8" });
check("wine route + libs byte-identical across S12a", wineDiff.trim(), "");

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
