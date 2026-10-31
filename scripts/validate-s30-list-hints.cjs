#!/usr/bin/env node
/* S30 — the lists' hint line and row chevrons (Brad, 2026-10-31). Static
 * checks; the browser half is scripts/pw-s30-list-hints.cjs.
 * (validate-s30.cjs is S3.0's harness, unrelated.)
 * Run: node scripts/validate-s30-list-hints.cjs */

const fs = require("fs");
const path = require("path");
const sp = fs.readFileSync(path.join(__dirname, "..", "src/components/SavedPage.tsx"), "utf8");

let passed = 0;
let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)}, expected ${JSON.stringify(want)})`}`);
}

check("the approved hint, exactly", (sp.match(/const LIST_HINT = "([^"]*)";/) || [])[1], "Tap any title for more like it, or to share it.");
check("one hint for every tab with rows, small gray", /\{tabCount\[tab\] > 0 && \(\s*<p data-testid="saved-hint" className="pt-3 text-\[13px\] text-gray-500">\s*\{LIST_HINT\}/.test(sp), true);
check("Saved / Watched / Favorites rows end in a › that opens the card", /\{control\}<\/span>\s*<Chevron onClick=\{\(\) => openItem\(targetFor\(category, name, goTo\)\)\} \/>\s*<\/li>/.test(sp), true);
check("Recent rows end in a › inside the row's button", /<\/span>\s*<Chevron \/>\s*<\/button>/.test(sp), true);
check("› is small gray ChevronRight, decorative", /aria-hidden="true"[^>]*data-testid="saved-chevron"[^>]*text-gray-400/.test(sp) && /<ChevronRight size=\{16\}/.test(sp), true);
check("Favorites rows lost + More like this", /MoreLikeThisButton/.test(sp), false);
check("the title still opens the card, not counted", /onClick=\{\(\) => openItem\(targetFor\(category, name, goTo\)\)\}\s*className="min-w-0 flex-1/.test(sp), true);
check("empty lines unchanged", sp.includes('Favorites: "No favorites yet. Tap ☆ on a card you love."') && sp.includes('Saved: "Nothing saved yet. Tap the bookmark on any card to keep it here."') && sp.includes('Watched: "Nothing marked watched yet."'), true);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
