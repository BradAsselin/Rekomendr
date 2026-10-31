#!/usr/bin/env node
/* S24b — top bar, ⋯ menu, Say it / Snap it, Watched it (docs/s22-compare-to-plan.md).
 * Four labeled buttons open the Saved page on their tab; Share, Sign in,
 * the posters switch and the TMDb notice live in the ⋯ menu; the auth
 * listener stays mounted; home's pair starts voice / the camera; the
 * Watched pill reads "Watched it" / "Watched"; approved wording only;
 * wine and prompts untouched. Source checks, no network.
 * Run: node scripts/validate-s24b.cjs */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));
const strip = (s) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

let passed = 0;
let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)}, expected ${JSON.stringify(want)})`}`);
}

const layout = read("app/layout.tsx");
const page = read("app/page.tsx");
const sp = read("src/components/SavedPage.tsx");
const menu = read("src/components/MoreMenu.tsx");
const auth = read("src/components/AuthControl.tsx");
const pair = read("src/components/SayOrSnap.tsx");
const bar = read("src/components/SearchBar.tsx");
const watched = read("src/components/WatchedControl.tsx");

console.log("1. Top bar: four labeled buttons, then the ⋯ menu");
// S26a — two rows: wordmark + ⋯, then the four tiles.
check("layout order: wordmark + ⋯ menu, then the Saved tiles", layout.indexOf("<HomeWordmark />") > 0 && layout.indexOf("<MoreMenu attribution={<Attribution />} />") < layout.indexOf("<SavedPage />"), true);
check("Share / Saved pills gone from the bar", /ShareButton/.test(layout) || exists("src/components/ShareButton.tsx"), false);
check("tabs Favorites · Watched · Recent · Saved", /const TABS: Tab\[\] = \["Favorites", "Watched", "Recent", "Saved"\];/.test(sp), true);
check("icons ★ ✓ ↺ 🔖", /const TAB_ICON: Record<Tab, LucideIcon> = \{ Favorites: Star, Watched: CircleCheck, Recent: RotateCcw, Saved: Bookmark \};/.test(sp), true);
check("each button opens the page on its tab", /onClick=\{\(\) => \{\s*setTab\(t\);\s*setOpen\(true\);\s*void reload\(\);\s*\}\}/.test(sp) && /data-testid=\{`topbar-\$\{t\}`\}/.test(sp), true);
check("each shows its count where it has one", /\{tabCount\[t\] > 0 && <span className="text-\[12px\] text-white\/70">\{tabCount\[t\]\}<\/span>\}/.test(sp), true);
check("the label is the tab's own word", /<span className="truncate">\{t\}<\/span>\s*<\/button>/.test(sp), true);
check("the Saved page's posters footer is gone", /role="switch"|Show posters|setPostersHidden/.test(sp), false);

console.log("\n2. The ⋯ menu");
check("a menu button (haspopup, expanded)", /aria-haspopup="menu"/.test(menu) && /aria-expanded=\{open\}/.test(menu) && /<MoreHorizontal /.test(menu), true);
check("Share keeps S2's cascade and toasts", /shareOrCopy\(\{ title: "Rekomendr", text: SHARE_TEXT, url: SHARE_URL \}\)/.test(menu) && /showToast\("Link copied!"\)/.test(menu), true);
check("posters: Hide posters when on, Show posters when off", /\{postersOn \? "Hide posters" : "Show posters"\}/.test(menu) && /setPostersHidden\(postersOn\)/.test(menu), true);
check("Sign in / Sign out inside", /<AuthControl userEmail=\{userEmail\} onDone=/.test(menu) && />\s*Sign in\s*</.test(auth) && />\s*Sign out\s*</.test(auth), true);
check("the TMDb notice inside (source stays in layout)", /<div className="border-t border-gray-100 px-4 py-3">\{attribution\}<\/div>/.test(menu) && layout.includes("This product uses the TMDB API but is not endorsed or certified by TMDB.") && layout.includes('<img src="/tmdb-logo.svg" alt="TMDB"'), true);
check("no footer notice under the page", /\{children\}\s*<Attribution \/>/.test(layout), false);
check("outside tap + Escape close it", /document\.addEventListener\("touchstart", onDown\)/.test(menu) && /e\.key === "Escape"/.test(menu), true);

console.log("\n3. Auth listener stays mounted (merge on every load)");
check("useAuthEmail runs at the menu's top level, not inside the panel", menu.indexOf("const userEmail = useAuthEmail();") > 0 && menu.indexOf("const userEmail = useAuthEmail();") < menu.indexOf("{open && ("), true);
check("merge on SIGNED_IN and INITIAL_SESSION", /if \(session && \(event === "SIGNED_IN" \|\| event === "INITIAL_SESSION"\)\) \{\s*requestMerge\(session\);/.test(auth), true);
check("the listener unsubscribes", /return \(\) => data\.subscription\.unsubscribe\(\);/.test(auth), true);
check("page no longer mounts AuthControl", /AuthControl/.test(strip(page)), false);

console.log("\n4. Home: Say it / Snap it");
check("the pair replaces the RekSnap button", /<SayOrSnap onSay=\{\(\) => micRef\.current\?\.\(\)\} onSnap=\{openSnapPicker\} category=\{barCategory\} \/>/.test(page) && !exists("src/components/RekSnapButton.tsx"), true);
check("same visibility as before (no snap yet, phone only)", /\{!hasSnapped && \(\s*<div className="sm:hidden">\s*<SayOrSnap/.test(page), true);
check("Say it = the search box's own mic start", /registerMic=\{\(fn\) => \{\s*micRef\.current = fn;\s*\}\}/.test(page) && /registerMic\?\.\(\(\) => tapMicRef\.current\(\)\);/.test(bar) && /tapMicRef\.current = tapMic;/.test(bar), true);
check("the search box keeps its mic and camera", /<Mic size=\{20\}/.test(bar) && /<Camera size=\{20\}/.test(bar), true);
check("two equal buttons side by side", /grid-cols-2/.test(pair) && (pair.match(/className=\{BIG\}/g) || []).length === 2, true);
check("Say it: mic + hint", /<Mic [^>]*\/>\s*<span[^>]*>Say it<\/span>/.test(pair) && pair.includes(">Something fun and funny<"), true);
check("Snap it: camera + hint", /<Camera [^>]*\/>\s*<span[^>]*>Snap it<\/span>/.test(pair) && pair.includes(">A poster, a shelf, the TV<"), true);
// S26a — Brad's S25 brief (item 8): the rotating snap tips leave home.
check("the snap tips are gone from under the pair (S26a)", /SnapTips/.test(strip(pair)), false);

console.log("\n5. Watched it pill");
check("outlined pill, check circle 16", /rounded-full border px-3 py-1/.test(watched) && /<CircleCheck size=\{16\}/.test(watched), true);
check("reads Watched it, marked reads Watched", /\{on \? "Watched" : "Watched it"\}/.test(watched), true);
check("marked fills navy", /border-\[#1E3A8A\] bg-\[#1E3A8A\] text-white/.test(watched), true);
check("S16 behavior unchanged (toggle, pressed, stopPropagation)", (watched.match(/e\.stopPropagation\(\);\s*(\/\/[^\n]*\s*)?onToggle\(\);/g) || []).length >= 1 && /aria-pressed=\{on\}/.test(watched), true);
check("Saved page rows keep the bare check", /<WatchedButton compact on onToggle=/.test(sp), true);

console.log("\n6. Approved wording only");
const jsxText = (src) =>
  [...(strip(src).match(/>\s*([A-Za-z][^<>{}]*?)\s*</g) || []).map((m) => m.replace(/^>\s*|\s*<$/g, "")), ...(strip(src).match(/aria-label="([^"]+)"/g) || []).map((m) => m.slice(12, -1))].filter(
    (w) => w && !/[=;()\n]/.test(w)
  );
const menuWords = [...new Set([...jsxText(menu), ...(menu.match(/"(Hide posters|Show posters)"/g) || []).map((m) => m.slice(1, -1))])];
check("menu strings", menuWords.filter((w) => !["Share", "Hide posters", "Show posters", "More options"].includes(w)), []);
check("pair strings", [...new Set(jsxText(pair))].filter((w) => !["Say it", "Snap it", "Something fun and funny", "A poster, a shelf, the TV", "powered by Reks Ray™"].includes(w)), []);
check("pill strings", [...new Set([...jsxText(watched), ...(watched.match(/"(Watched it|Watched)"/g) || []).map((m) => m.slice(1, -1))])].filter((w) => !["Watched", "Watched it", "Watched ·", "Undo"].includes(w)), []);
check("auth strings unchanged from S2b", ["Sign in", "Sign out", "Check your email — the sign-in link is on its way.", "you@email.com", "Sending...", "Send sign-in link", "Couldn’t send the link — give it another go."].every((t) => auth.includes(t)), true);
// S25 — Brad's word for it.
check("the ⋯ button reads More options to a screen reader", /aria-label="More options"/.test(menu), true);

console.log("\n7. Untouched");
const diff = (files) => {
  try {
    return execSync(`git diff main -- ${files}`, { cwd: root }).toString();
  } catch {
    return "git diff failed";
  }
};
check("wine: routes, libs and components byte-identical", diff("src/lib/wineReks.ts src/lib/wineShelf.ts src/lib/wineVisit.ts app/api/wine app/api/reksnap src/components/WineBought.tsx src/components/WineFacts.tsx src/components/WineFollowup.tsx"), "");
// S25 — Books lines widened the writer's types and added a route action;
// the prompt strings themselves stay byte-identical.
const promptDiff = diff("src/lib/mediaReks.ts src/lib/voiceMood.ts src/engine/rekomendrEngine.ts");
check("no prompt text changed (no string-literal prompt line touched)", /^[-+]s*("|'|`).*\n/m.test(promptDiff) || /^[-+].*CHOOSER_PROMPT =/m.test(promptDiff), false);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
