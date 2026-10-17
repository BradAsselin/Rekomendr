#!/usr/bin/env node
/* S11 — context-aware snap tips (cart on Wine only; the label tip names
 * the go-to only once one is starred; the TV tip back), the camera-screen
 * shelf tip removed, and a cable banner's season/episode stripped before
 * the TMDb show lookup. Run: node scripts/validate-s11.cjs */

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
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}  (got ${JSON.stringify(got)}, expected ${JSON.stringify(want)})`);
}
// Transpile one TS module; relative imports are stubbed (pure helpers only).
function load(rel) {
  const out = ts.transpileModule(read(rel), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, jsx: ts.JsxEmit.React },
  }).outputText;
  const m = { exports: {} };
  new Function("module", "exports", "require", out)(m, m.exports, (id) =>
    id === "react" ? { useEffect() {}, useMemo() {}, useRef() {}, useState() {} } : id.startsWith(".") ? new Proxy({}, { get: () => () => "" }) : require(id)
  );
  return m.exports;
}

console.log("1. Cable banner → the show (stripEpisodeInfo)");
const { stripEpisodeInfo } = load("src/lib/tmdbMedia.ts");
const cases = [
  [`Breaking Bad S5 E14 'Ozymandias'`, "Breaking Bad"],
  [`Breaking Bad S5 E14 "Ozymandias"`, "Breaking Bad"],
  ["Breaking Bad S05E14", "Breaking Bad"],
  ["Severance S2:E1", "Severance"],
  ["The Office (S3 E5)", "The Office"],
  ["Friends 5x14 The One Where Everybody Finds Out", "Friends"],
  [`Succession, Season 4, Episode 3`, "Succession"],
  [`Succession: Season 4 Episode 3 "Connor's Wedding"`, "Succession"],
  ["Seinfeld - Ep. 12", "Seinfeld"],
  ["Mad Men Episode 13", "Mad Men"],
  ["9-1-1 S6 E10", "9-1-1"],
];
for (const [inp, want] of cases) check(`"${inp}"`, stripEpisodeInfo(inp), want);
console.log("  — titles that must survive untouched");
for (const t of ["The Bear", "Se7en", "S.W.A.T.", "Stranger Things 4", "The Sopranos Season 6", "Fahrenheit 9/11", "2001: A Space Odyssey", "S1m0ne", "Ocean's 11", "Apollo 13", "Episodes"]) {
  check(`"${t}" unchanged`, stripEpisodeInfo(t), t);
}
check("a marker at the start is not a show name", stripEpisodeInfo("S5 E14 Ozymandias"), "S5 E14 Ozymandias");

const tmdb = read("src/lib/tmdbMedia.ts");
check("only TV/unknown kinds are cut (never a movie)", tmdb.includes('const read = kindHint === "movie" ? name : stripEpisodeInfo(name);'), true);
check("the cut is logged", tmdb.includes('"[media-snap] episode info stripped"'), true);
check("the lookup uses the cut name", tmdb.includes("splitTypedYear(read.replace(PACKAGE_NOISE"), true);

console.log("\n2. Context-aware tips");
const { tipsFor, tipIndexFor } = load("src/components/SnapTips.tsx");
const ids = (c, g) => tipsFor(c, g).map((t) => t.id);
check("Wine, no go-to", ids("Wine", false), ["shelf", "label", "poster", "tv", "cart", "send"]);
check("Wine, go-to starred", ids("Wine", true), ["shelf", "label-goto", "poster", "tv", "cart", "send"]);
check("Movies: no cart", ids("Movies", false), ["shelf", "label", "poster", "tv", "send"]);
check("TV Shows / Books / none: no cart", [ids("TV Shows", true), ids("Books", false), ids(undefined, false)].every((l) => !l.includes("cart")), true);
const words = Object.fromEntries(tipsFor("Wine", false).concat(tipsFor("Wine", true)).map((t) => [t.id, t.snap + t.rest]));
check("label, no go-to (Brad-approved S11)", words.label, "Snap a label to see how it compares");
check("label, go-to (S10 wording)", words["label-goto"], "Snap a label to see how it stacks up to your go-to");
check("TV tip (Brad's wording)", words.tv, "Snap the TV to see what's playing and where to stream it");
check("cart tip (S10 wording)", words.cart, "Snap your cart to keep track of what you bought");
check("still no restaurant wine-list tip", Object.values(words).some((t) => /wine list/i.test(t)), false);
const start = (c) => tipsFor(c, false)[tipIndexFor(tipsFor(c, false), c)].id;
check("starts: Wine shelf, Movies poster, TV Shows tv, Books send, none → first", ["Wine", "Movies", "TV Shows", "Books", undefined].map(start), ["shelf", "poster", "tv", "send", "shelf"]);
const tipsSrc = read("src/components/SnapTips.tsx");
check("go-to read from the stored favorite, live on change", tipsSrc.includes("return onWineFavoriteChange(read);") && tipsSrc.includes("setHasGoTo(!!getWineFavorite())"), true);

console.log("\n3. The camera-screen shelf tip is gone");
const page = read("app/page.tsx");
check("no QuietTip / SHELF_TIP on the home screen", [page.includes("QuietTip"), page.includes("SHELF_TIP")], [false, false]);
check("SHELF_TIP constant retired", read("src/lib/wineShelf.ts").includes("SHELF_TIP"), false);
check("single-bottle tip on results kept", read("src/components/RekSnapResults.tsx").includes('storageKey="shelf-after-single"'), true);

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
