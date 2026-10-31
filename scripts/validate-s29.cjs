#!/usr/bin/env node
/* S29 — home's Say it / Snap it square and the rotating nudge line (Brad,
 * 2026-10-31). Static checks; the browser half is scripts/pw-s29-home-square.cjs.
 * Run: node scripts/validate-s29.cjs */

const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const pair = fs.readFileSync(path.join(root, "src/components/SayOrSnap.tsx"), "utf8");
const page = fs.readFileSync(path.join(root, "app/page.tsx"), "utf8");

let passed = 0;
let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)}, expected ${JSON.stringify(want)})`}`);
}

const nudges = (pair.match(/export const NUDGES = \[([\s\S]*?)\];/) || [])[1] || "";
check("nudge lines are exactly Brad's approved four, in order", [...nudges.matchAll(/'([^']*(?:‘[^’]*’[^']*)?)'/g)].map((m) => m[1]), [
  "Try saying ‘a cozy mystery for tonight’",
  "Snap a wine shelf and we’ll pick the best bottle on it",
  "Snap the TV screen to find what’s like it",
  "Say a movie you loved, and we’ll find its cousins",
]);
check("rotates every 5 seconds", /const NUDGE_MS = 5000;/.test(pair) && /setInterval\(\(\) => setNudge\(\(n\) => \(n \+ 1\) % NUDGES\.length\), NUDGE_MS\)/.test(pair), true);
check("interval cleared on unmount", /return \(\) => window\.clearInterval\(t\);/.test(pair), true);
check("nudge 14px gray", /text-\[14px\][^"]*text-gray-400/.test(pair), true);
check("one dot per line, the current one lit", /NUDGES\.map\(\(_, i\) =>/.test(pair) && /i === nudge \? 'bg-gray-300' : 'bg-gray-600'/.test(pair), true);
check("square: 260px, 200px on a short screen, 34px corners, the blue, soft shadow", /size-\[260px\]/.test(pair) && /\[@media\(max-height:700px\)\]:size-\[200px\]/.test(pair) && /rounded-\[34px\]/.test(pair) && /bg-\[#2D5AB5\]/.test(pair) && /shadow-\[/.test(pair), true);
check("divider: 1px, white at 35%, inset top and bottom", /w-px/.test(pair) && /bg-white\/35/.test(pair) && /top-\[18%\] bottom-\[18%\]/.test(pair), true);
check("each half its own button, same actions", /onClick=\{onSay\}[^>]*data-testid="say-it"/.test(pair) && /onClick=\{onSnap\}[^>]*data-testid="snap-it"/.test(pair) && /<SayOrSnap onSay=\{\(\) => micRef\.current\?\.\(\)\} onSnap=\{openSnapPicker\}/.test(page), true);
check("hint lines gone", /Something fun and funny|A poster, a shelf, the TV/.test(pair), false);
check("powered by Reks Ray™ stays", pair.includes(">powered by Reks Ray™<"), true);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
