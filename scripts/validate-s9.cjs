#!/usr/bin/env node
/* S9 — wine results drop the Similar / Use it for / Instead try tabs and
 * (S9b) gain one "Snap the shelf" button under the anchor. Source fences only:
 * the change is client render gating, and every gate is a single
 * expression. Run: node scripts/validate-s9.cjs */

const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "../src/components/RekSnapResults.tsx"), "utf8");

let passed = 0;
let failed = 0;
function check(name, got, want) {
  const ok = got === want;
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}  (got ${got}, expected ${want})`);
}

console.log("1. Tabs: gone for wine, kept for everything else");
check(
  "tab row gated on !anchorIsWine (health + TMDb gates unchanged)",
  src.includes("const showModePills = !anchorIsHealthMedical && !result.media && !anchorIsWine;"),
  true
);
check("the three tabs still exist for other anchors", /\{ mode: "uses", label: "Use it for" \}/.test(src), true);
check(
  "a wine result always opens on Similar",
  src.includes('health || isWineCategory(result.detected_item.category) ? "similar" : result.mode'),
  true
);
check(
  "price chips still render on Similar",
  src.includes('wineMeta && wineMeta.scene !== "haul" && activeMode === "similar"'),
  true
);

console.log("2. Snap the shelf");
const btn = src.indexOf("Snap the shelf");
check("button exists once", btn > 0 && src.indexOf("Snap the shelf", btn + 1) === -1, true);
const block = src.slice(src.lastIndexOf("{anchorIsWine && !limitReached", btn), btn);
// S26b — and on a shelf snap (the photo already is the shelf).
check("wine only, hidden at the snap limit, on a checkout snap and on a shelf", block.includes('{anchorIsWine && !limitReached && wineMeta?.scene !== "haul" && !shelfTop && ('), true);
check("opens the same camera as Snap another", block.includes("onClick={() => onSnapAgain?.()}"), true);
const anchorEnd = src.indexOf("{anchorShareable && (");
const trail = src.indexOf("{trail.length > 0 && (");
check("sits under the anchor (after its Share row, before the trail)", btn > anchorEnd && btn < trail, true);
check("Snap another kept", (src.match(/Snap another/g) || []).length >= 2, true);

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
