#!/usr/bin/env node
/* S18c — a title watched in the snap lane (this snap, or any earlier
 * visit per the server's list) never comes back on a backfill or chain.
 * Source checks on the lane + the server's drop-set. No network.
 * Run: node scripts/validate-s18c.cjs */

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
let passed = 0;
let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? passed++ : failed++;
  process.stdout.write(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)}, expected ${JSON.stringify(want)})`}\n`);
}
const say = (s) => process.stdout.write(s + "\n");

const rs = read("src/components/RekSnapResults.tsx");
say("\n1. The lane remembers what was watched");
check("a watch adds the title, an un-watch removes it", /if \(on\) watchedNamesRef\.current\.add\(item\.title\);\s*else watchedNamesRef\.current\.delete\(item\.title\);\s*onWatchedChange\?\.\(item, on\);/.test(rs), true);
check("a new snap starts clean", /touchedRef\.current = new Set\(\);\s*watchedNamesRef\.current = new Set\(\);/.test(rs), true);
check("server-known watches: Movies/TV only, newest 60", /serverMarks\.watched\s*\.filter\(\(x\) => x\.category === "Movies" \|\| x\.category === "TV Shows"\)\s*\.slice\(0, 60\)/.test(rs), true);
check("only on D2 (books/wine unchanged)", /serverWatchedRef\.current = d2\s*\?/.test(rs), true);

say("\n2. Both requests carry them");
check("backfill excludeNames include the watched", /excludeNames: Array\.from\(new Set\(\[\.\.\.excludeNames, \.\.\.watchedExclude\(\)\]\)\)/.test(rs), true);
const union = rs.slice(rs.indexOf("const buildExcludeNames"), rs.indexOf("const buildExcludeNames") + 400);
check("chain exclusion union includes the watched", /watchedExclude\(\)\.forEach\(\(n\) => names\.add\(n\)\)/.test(union), true);
check("chain + re-roll both use the union", (rs.match(/excludeNames: buildExcludeNames\(\)/g) || []).length, 2);

say("\n3. The server drops them (the guarantee, not just the prompt)");
const route = read("app/api/reksnap/route.ts");
check("backfill + chain both put excludeNames in the drop set", (route.match(/\.\.\.excludeNames\.map\(normalize\)/g) || []).length, 2);

say(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
