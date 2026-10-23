#!/usr/bin/env node
/* S10 — wine snaps stop the vision stream after Similar (Use it for /
 * Instead try are never shown on wine); the bottom-of-results wine tip is
 * gone; the line under RekSnap is a set of rotating tips (Brad-approved
 * wording, two held back). Run: node scripts/validate-s10.cjs */

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
function load(rel) {
  const out = ts.transpileModule(read(rel), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, jsx: ts.JsxEmit.React },
  }).outputText;
  const m = { exports: {} };
  new Function("module", "exports", "require", out)(m, m.exports, (id) =>
    id === "react" ? { useEffect() {}, useMemo() {}, useRef() {}, useState() {} } : id.startsWith(".") ? {} : require(id)
  );
  return m.exports;
}

console.log("1. extractCompleteArray (reads Similar out of a streaming answer)");
const { extractCompleteArray } = load("src/lib/jsonEarly.ts");
const full = JSON.stringify({
  detected_item: { name: "Josh Cabernet", description: 'Not "similar" to anything [really].', category: "wine" },
  mode: "uses",
  results: { similar: [{ name: "A [1]", d: 'q"x]' }, { name: "B" }], uses: [{ name: "Dish" }] },
});
const cutAt = full.indexOf('"uses":[');
check("complete Similar, mid-stream (uses not yet closed)", extractCompleteArray(full.slice(0, cutAt + 10), "similar", "results")?.map((r) => r.name), ["A [1]", "B"]);
check("Similar still open → null", extractCompleteArray(full.slice(0, full.indexOf('{"name":"B"')), "similar", "results"), null);
check('"similar" in the anchor text is not the list', extractCompleteArray(full.slice(0, full.indexOf('"results"')), "similar", "results"), null);
check("no results yet → null", extractCompleteArray('{"detected_item":{}}', "similar", "results"), null);
check("empty Similar is still a complete list", extractCompleteArray('{"results":{"similar":[],"uses":', "similar", "results"), []);

console.log("\n2. The route: wine stops after Similar; everything else unchanged");
const route = read("app/api/reksnap/route.ts");
const vStart = route.indexOf("const early = await vision.detected;");
const vision = route.slice(vStart, route.indexOf("let parsed: any = null;", vStart));
check("cut only when startWine took the anchor (wine, not health)", /if \(startWine\(early\)\) \{\s*const sim = await vision\.similar;/.test(vision), true);
check("stops the stream, ships Similar with empty uses/alternatives", ["vision.stop();", "uses: [], alternatives: []", 'mode: "similar"'].every((t) => vision.includes(t)), true);
check("Similar never closed → full read as before", vision.includes("if (!wineCut) ({ text, usage, finishReason, refusal } = await vision.done());"), true);
check("media path still first", vision.indexOf("tryMediaSnap") < vision.indexOf("startWine(early)"), true);
check("cut is logged", vision.includes('"[wine] vision cut after Similar"'), true);
check("empty read still fails (strip retry intact)", /if \(\s*cleanedRaw\.similar\.length === 0 &&\s*cleanedRaw\.uses\.length === 0/.test(route), true);
check("no new-to-me notice when wine picks ship", /alternatives\.length === 0 &&\s*cleaned\.similar\.length === 0;/.test(route), true);
check("strips + typed branches untouched (still full reads)", (route.match(/(content|system): SYSTEM_PROMPT/g) || []).length, 3);

console.log("\n3. Wine results: the bottom tip is gone (S11 also removed the camera-screen tip)");
const results = read("src/components/RekSnapResults.tsx");
check("no SHELF_TIP on results", results.includes("SHELF_TIP"), false);
check("Snap the shelf still under the anchor", results.includes("Snap the shelf"), true);
const page = read("app/page.tsx");
check("camera-screen tip removed (S11, Brad)", page.includes("SHELF_TIP"), false);
check("tips follow the bar's category", page.includes("<RekSnapButton onClick={openSnapPicker} category={barCategory} />"), true);

console.log("\n4. Snap tips (Brad-approved wording, 2026-10-17)");
// S11 made the set context-aware (tipsFor); the full Wine + go-to set
// still carries S10's five approved tips word for word.
const { tipsFor, TIP_INTERVAL_MS } = load("src/components/SnapTips.tsx");
const all = tipsFor("Wine", true);
const text = all.map((t) => t.snap + t.rest);
check("S10's approved tips, word for word", [
  "Snap a wine shelf to compare every bottle at once",
  "Snap a label to see how it stacks up to your go-to",
  "Snap a movie poster for the trailer and where to watch",
  "Snap your cart to keep track of what you bought",
  "Snap it, then send it. Friends see the card, no app needed",
].every((t) => text.includes(t)), true);
check("held back: restaurant wine list", text.some((t) => /wine list/i.test(t)), false);
check("each tip leads with its snap phrase", all.every((t) => t.snap.startsWith("Snap")), true);
check("rotation every 4–5 s", TIP_INTERVAL_MS >= 4000 && TIP_INTERVAL_MS <= 5000, true);
const tipsSrc = read("src/components/SnapTips.tsx");
check("reduced motion: no transition, no timer", tipsSrc.includes("if (reduced) return;") && tipsSrc.includes("style={reduced ? undefined"), true);
check("pause on touch", ["onPointerDown={hold}", "onPointerUp={release}"].every((t) => tipsSrc.includes(t)), true);
check("storage wrapped in try/catch", /try \{\s*let n = Number\(localStorage/.test(tipsSrc), true);
check("old static line gone", read("src/components/RekSnapButton.tsx").includes("Rek anything"), false);

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
