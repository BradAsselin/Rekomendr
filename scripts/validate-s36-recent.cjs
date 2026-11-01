/* eslint-disable no-console */
//
// scripts/validate-s36-recent.cjs — S36 (docs/S35_RECENT_SEARCHES.md, Brad,
// 2026-11-01): Recent remembers your searches, and a typed or spoken title
// follows the S31 rule (charter §2.14).
//
// Part 1 runs the REAL store (src/lib/recentSearches.ts, transpiled) on a
// fake localStorage with fetch booby-trapped: entries, the 50 cap, in-place
// fill-in, facts and posters, Clear, full storage, the "when" line, and
// that nothing is ever sent. Part 2 reads the wiring from source: which
// acts make an entry (and which never do), the reopen path, the title rule.
//
//   node scripts/validate-s36-recent.cjs
//
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

let passed = 0;
let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)}, expected ${JSON.stringify(want)})`}`);
}

// ---- a browser just big enough for the store -------------------------
let quota = Infinity;
const store = new Map();
let fetches = 0;
let events = 0;
global.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      if (String(v).length > quota) throw new Error("QuotaExceededError");
      store.set(k, String(v));
    },
    removeItem: (k) => store.delete(k),
  },
  dispatchEvent: () => {
    events++;
    return true;
  },
  addEventListener: () => {},
  removeEventListener: () => {},
};
global.CustomEvent = class {
  constructor(type) {
    this.type = type;
  }
};
global.fetch = () => {
  fetches++;
  throw new Error("recentSearches must never send anything");
};

const src = read("src/lib/recentSearches.ts");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function("module", "exports", "require", js)(mod, mod.exports, require);
const RS = mod.exports;

const KEY = "rekomendr.recent_searches";
const reset = () => {
  store.clear();
  quota = Infinity;
  // the module keeps a memo; clearing through it resets both
  RS.clearSearchEntries();
};
const rek = (t, i) => ({ id: i, title: t, year: 2013, short: `${t} short.`, long: "", tmdbId: 100 + i, posterPath: null });
const five = (p) => ["Coherence", "Ex Machina", "The Big Short", "Primer", "The Man from Earth"].map((t, i) => rek(`${p}${t}`, i));
const entry = (id, label, at, list = five("")) => ({
  id,
  kind: "voice",
  label,
  category: "Movies",
  at,
  picks: RS.picksFromReks(list, "Movies"),
  restore: { lane: "search", reks: list, header: label, mltSeed: null, screen: null, last: null, slot: null },
  facts: {},
});

console.log("\nThe store (on this device only)");
reset();
RS.upsertSearchEntry(entry("a", "“For a thought-provoking engaging hour and a half movie”", "2026-10-31T22:21:44.000-04:00"));
let list = RS.getSearchEntries();
check("a voice search makes one entry with its words and five picks", [list.length, list[0].label, list[0].picks.map((p) => p.title)], [
  1,
  "“For a thought-provoking engaging hour and a half movie”",
  ["Coherence", "Ex Machina", "The Big Short", "Primer", "The Man from Earth"],
]);
check("…stored under its own key, nowhere else", [...store.keys()], [KEY]);

RS.upsertSearchEntry({ ...entry("a", "“changed”", "2026-11-01T09:00:00Z"), picks: RS.picksFromReks(five("x"), "Movies") });
list = RS.getSearchEntries();
check("the same id fills in place (its lines, a late five): one entry, original time", [list.length, list[0].label, list[0].at, list[0].picks[0].title], [
  1,
  "“changed”",
  "2026-10-31T22:21:44.000-04:00",
  "xCoherence",
]);

RS.upsertSearchEntry({ ...entry("empty", "“nothing”", "2026-11-01T10:00:00Z"), picks: [] });
check("a set with no picks makes no entry", RS.getSearchEntries().length, 1);

console.log("\nNewest first, 50 at most");
reset();
for (let i = 1; i <= 51; i++) RS.upsertSearchEntry(entry(`e${i}`, `“search ${i}”`, new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString()));
list = RS.getSearchEntries();
check("the 51st drops the oldest", [list.length, list[0].id, list.at(-1).id, list.some((e) => e.id === "e1")], [50, "e51", "e2", false]);
check("…and what's stored matches", JSON.parse(store.get(KEY)).length, 50);
const fresh = JSON.parse(store.get(KEY));
check("a reload reads the same list back", fresh.map((e) => e.id).slice(0, 3), ["e51", "e50", "e49"]);

console.log("\nFacts and posters the cards learned");
reset();
RS.upsertSearchEntry(entry("f", "“f”", "2026-11-01T10:00:00Z"));
RS.noteEntryFacts("f", { coherence: { facts: ["1h 29m", "on Prime Video"], posterPath: "/coh.jpg" } });
list = RS.getSearchEntries();
check("the entry's pick gets its poster", list[0].picks[0].posterPath, "/coh.jpg");
check("…and the stored card its facts (nothing to ask on reopen)", [list[0].restore.reks[0].facts, list[0].restore.reks[0].posterPath], [["1h 29m", "on Prime Video"], "/coh.jpg"]);
RS.noteEntryFacts("nope", { primer: { facts: [], posterPath: "/p.jpg" } });
check("facts for an unknown entry change nothing", RS.getSearchEntries()[0].picks[3].posterPath, null);

console.log("\nClear, broken storage");
RS.clearSearchEntries();
check("Clear empties the list and the storage", [RS.getSearchEntries().length, store.has(KEY)], [0, false]);
reset();
for (let i = 1; i <= 10; i++) RS.upsertSearchEntry(entry(`q${i}`, `“q${i}”`, new Date(Date.UTC(2026, 9, 2, 0, i)).toISOString()));
const one = JSON.stringify(RS.getSearchEntries().slice(0, 1)).length;
quota = one * 4;
RS.upsertSearchEntry(entry("q11", "“q11”", "2026-10-03T00:00:00Z"));
const kept = JSON.parse(store.get(KEY));
check("full storage drops the oldest, keeps the newest", [kept[0].id, kept.length < 11, kept.length >= 1], ["q11", true, true]);
check("…while this tab still shows them all", RS.getSearchEntries().length, 11);
store.set(KEY, "{not json");
// a fresh module instance reads a corrupt store as empty
const mod2 = { exports: {} };
new Function("module", "exports", "require", js)(mod2, mod2.exports, require);
check("a corrupt store reads as empty, never throws", mod2.exports.getSearchEntries(), []);
store.set(KEY, JSON.stringify([{ id: 1 }, null, entry("ok", "“ok”", "2026-11-01T00:00:00Z")]));
const mod3 = { exports: {} };
new Function("module", "exports", "require", js)(mod3, mod3.exports, require);
check("…and junk rows are dropped", mod3.exports.getSearchEntries().map((e) => e.id), ["ok"]);

console.log("\nWhen it happened");
const now = new Date(2026, 10, 1, 9, 30); // Nov 1, 9:30 AM local
const at = (y, m, d, h, mi) => new Date(y, m, d, h, mi).toISOString();
check("last night", RS.entryWhen(at(2026, 9, 31, 22, 22), now), "Last night 10:22 PM");
check("earlier today", RS.entryWhen(at(2026, 10, 1, 8, 5), now), "8:05 AM");
check("yesterday morning reads as the date", RS.entryWhen(at(2026, 9, 31, 9, 0), now), "Oct 31");
check("an older day", RS.entryWhen(at(2026, 9, 28, 20, 0), now), "Oct 28");
check("another year carries it", RS.entryWhen(at(2025, 9, 28, 20, 0), now), "Oct 28, 2025");

console.log("\nNothing new is sent");
check("the store made no request at all", fetches, 0);
check("…and has no fetch in it", /\bfetch\s*\(/.test(src), false);

// ---- Part 2: the wiring, from source --------------------------------
console.log("\nWhich acts make an entry");
const page = read("app/page.tsx");
const fn = (name) => {
  const i = page.indexOf(`const ${name} = `);
  if (i < 0) return "";
  // up to the next top-level handler
  const rest = page.slice(i + 10);
  const j = rest.search(/\n  const [a-zA-Z]+ = (async )?\(/);
  return page.slice(i, i + 10 + (j < 0 ? rest.length : j));
};
const search = fn("handleSearch");
check("voice: the words in quotes", search.includes('draftOf("voice", `“${voice.said}”`)'), true);
check("typed: the words in quotes", search.includes('draftOf("typed", `“${typedWords}”`)'), true);
check("chips: \"Comedy · Feel-good\"", [search.includes('join(" · ")'), search.includes("chipsDraft(")], [true, true]);
check("More like this from a list or a go-to: \"More like [Title]\"", search.includes('draftOf("mlt", `More like ${opts.mltName}`)'), true);
check("snap: \"Snapped: [what was read]\"", fn("handleSnapFile").includes('draftOf("snap", `Snapped: ${data.detected_item.name}`)'), true);
check("a snapped screen too", fn("showScreen").includes('draftOf("snap", `Snapped: ${read}`)'), true);
check("a tapped title (its card + More like this)", fn("openMediaGoTo").includes('draftOf("mlt", `More like ${t.name}`)'), true);
check("a card's More like this (search lane and snap lane)", [page.includes("onMoreLikeThisSet={rememberCardMlt}"), page.includes("onChainSet={rememberChain}")], [true, true]);
check("a Compare to re-run never makes one", [search.includes("opts?.rerun || (steerOpts && !voice)"), (fn("applyRefs").match(/rerun: true/g) || []).length], [true, 2]);
check("every landing records the set (slots, AI, lines, typed title)", (search.match(/rememberReks\(|remember\(/g) || []).length >= 7, true);
check("the health wall holds: a health set is never an entry", fn("rememberSet").includes("isHealthMedical("), true);
const v4 = read("src/components/ResultsV4.tsx");
const snap = read("src/components/RekSnapResults.tsx");
check("the search-lane card MLT reports its five", v4.includes("onMoreLikeThisSet?.(rek.title, fresh, seed)"), true);
check("the snap chain reports only pursuit, not a re-roll", (snap.match(/: seed,\r?\n\s+(rek|entry\.rek)\.name\r?\n\s+\);/g) || []).length, 2);

console.log("\nReopening");
const reopen = fn("reopenEntry");
check("reopen makes no request", [/\bfetch\w*\s*\(/.test(reopen), /handleSearch\(|fetchSlots|fetchTypedReks|getTop5|setVoiceSet/.test(reopen)], [false, false]);
check("…bumps both staleness guards first", [reopen.includes("searchIdRef.current++"), reopen.includes("snapIdRef.current++")], [true, true]);
check("…brings the snap lane's facts with it", reopen.includes("facts: e.facts"), true);
check("…and the snap lane counts every card as asked", snap.includes("markKey(result.detected_item.name),"), true);

console.log("\nRecent tab");
const saved = read("src/components/SavedPage.tsx");
check("Clear recent clears both", /clearRecent\(\);\s*\n\s*clearSearchEntries\(\);/.test(saved), true);
check("the hint line stays as approved", saved.includes('const LIST_HINT = "Tap any title for more like it, or to share it.";'), true);
check("a pick opens its card the usual way (its card + More like this)", saved.includes("openItem({ category: c, name: p.title, tmdbKind: kind, tmdbId: p.tmdbId })"), true);
check("an opened pick gets the dot", saved.includes('data-testid="recent-pick-opened"'), true);

console.log("\nA typed or spoken title follows S31 (charter §2.14)");
check("a typed title's five are asked for standalone", search.includes("fetchTypedReks(media, lane, true)"), true);
check("…under its unchecked Compare to row", search.includes("setMltSeed(titleSeed)"), true);
check("a title named in the words: no lines unless the person chose refs", search.includes("const standalone = !!named && runCat !== \"Wine\" && refsPayload(refsFor(runCat)).length === 0;"), true);
check("…its five still steered by it (refs unchanged)", search.includes("const refs = steeringRefs(named, runCat);"), true);
check("…its replacements stand alone too", fn("slotBackfill").includes("s.standalone ? { lines: false as const }"), true);
const route = read("app/api/slots/route.ts");
check("the slots route skips the writer on lines:false", [route.includes("const writeLines = body?.lines !== false;"), route.includes("linesPending: writeLines &&")], [true, true]);
check("a typed wine still compares automatically (untouched)", fn("resolveTypedAnchor") === "" ? !/mlt/.test(page.slice(page.indexOf("async function resolveTypedAnchor"), page.indexOf("async function fetchTypedReks"))) : true, true);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
