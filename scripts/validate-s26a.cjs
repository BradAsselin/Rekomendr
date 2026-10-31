#!/usr/bin/env node
/* S26a — home fits one screen, the two-row top bar, Go (Brad's S25 brief
 * "Home fits one screen, Go button, wine shelf Compare to", items 1–3, 8).
 * Static checks only; the browser half is scripts/pw-s26a-home.cjs.
 * Run: node scripts/validate-s26a.cjs */

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

let passed = 0;
let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)}, expected ${JSON.stringify(want)})`}`);
}

const layout = read("app/layout.tsx");
const page = read("app/page.tsx");
const mark = read("src/components/HomeWordmark.tsx");
const sp = read("src/components/SavedPage.tsx");
const bar = read("src/components/SearchBar.tsx");
const pair = read("src/components/SayOrSnap.tsx");

console.log("1. Header");
// S28c — ⋯ alone on row 1, then the wordmark centered, then the tiles.
check("row 1: ⋯ alone (and the install plumbing), then the centered wordmark", /justify-end gap-2">\s*<div className="-mr-2 flex items-center">\s*<MoreMenu attribution=\{<Attribution \/>\} \/>\s*<InstallButton \/>\s*<\/div>\s*<\/div>\s*<div className="flex justify-center[^"]*">\s*<HomeWordmark \/>/.test(layout), true);
check("row 2: the tiles", layout.indexOf("<SavedPage />") > layout.indexOf("<MoreMenu "), true);
check("wordmark text unchanged", mark.includes("Rekomendr<span") && mark.includes(">.AI</span>") && mark.includes('aria-label="Back to home"'), true);
check("wordmark on / asks the page; elsewhere navigates home", /pathname === "\/"\) window\.dispatchEvent\(new Event\(HOME_EVENT\)\);\s*else window\.location\.assign\("\/"\);/.test(mark), true);
check("the page comes home on the event", /window\.addEventListener\(HOME_EVENT, goHome\)/.test(page) && /const goHome = \(\) => resetToHomeRef\.current\(\);/.test(page), true);
check("the big centered wordmark is gone from the page", /text-3xl font-bold tracking-tight/.test(page), false);
check("tiles: outlined, four columns", /grid grid-cols-4/.test(sp) && /rounded-xl border border-white\/15/.test(sp), true);
check("tile colors: amber, green, light gray, light blue", /Favorites: "text-amber-400",\s*Watched: "text-emerald-400",\s*Recent: "text-gray-300",\s*Saved: "text-sky-300",/.test(sp), true);
check("Say it / Snap it pair unchanged, Reks Ray line stays", pair.includes(">Say it</span>") && pair.includes(">Snap it</span>") && pair.includes(">powered by Reks Ray™<"), true);
check("snap tips gone (item 8)", /SnapTips/.test(pair.replace(/\/\/.*$/gm, "")), false);

console.log("\n2. One screen");
check("body uses the visible height (100dvh), not 100vh", /<body className="flex min-h-\[100dvh\] flex-col /.test(layout) && !/min-h-screen/.test(layout), true);
check("main no longer adds a screen's height under the bar", /<main className="min-h-screen/.test(page), false);
check("both chip rows scroll inside a clip (no indicator bar)", (bar.match(/-mx-4 overflow-hidden sm:mx-0/g) || []).length === 2 && (bar.match(/-mb-4 flex gap-2 overflow-x-auto overscroll-x-contain px-4 pb-4/g) || []).length === 2, true);
check("chips still hide the scrollbar", (bar.match(/\[scrollbar-width:none\] \[&::-webkit-scrollbar\]:hidden/g) || []).length, 2);

console.log("\n3. Go");
check("Go shows only with text", /const showGo = input\.trim\(\) !== "";/.test(bar) && /\{showGo && \(/.test(bar), true);
check("Go is the form's submit when not listening (Enter still works)", /type=\{listening \? "button" : "submit"\}/.test(bar) && /<form\s+onSubmit=\{handleSubmit\}/.test(bar), true);
check("Go sits inside the field before the mic", bar.indexOf('data-testid="search-go"') > bar.indexOf("<input") && bar.indexOf('data-testid="search-go"') < bar.indexOf('data-testid="voice-mic"'), true);
check("while listening Go stops the mic and runs the words now", /const epoch = \+\+voiceEpoch\.current;\s*listenerRef\.current\?\.stop\(\);\s*listenerRef\.current = null;\s*setListening\(false\);\s*setHint\(null\);\s*if \(heard\) void runVoice\(heard, epoch\);/.test(bar), true);
check("the pause's own end becomes a no-op after Go (epoch)", /onEnd: \(\) => \{\s*listenerRef\.current = null;\s*if \(epoch !== voiceEpoch\.current \|\| fellBackRef\.current\) return;/.test(bar), true);
check("auto-run after silence kept", /const heard = heardRef\.current\.trim\(\);\s*if \(heard\) void runVoice\(heard, epoch\);/.test(bar), true);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
