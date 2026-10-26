#!/usr/bin/env node
/* S24a — Compare to (docs/s22-compare-to-plan.md).
 * Steering off by default; refs chosen in "Compare to…" pull the five
 * toward their TMDb webs; each card's line compares to its closest ref;
 * the lines-only action for an AI set; the per-device stores (refs,
 * Recent); the wiring; approved wording only; wine and prompts untouched.
 * No network: TMDb, the writer and the database are stubs.
 * Run: node scripts/validate-s24a.cjs */

const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

let passed = 0;
let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)}, expected ${JSON.stringify(want)})`}`);
}
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function load(rel, stubs) {
  const out = ts.transpileModule(read(rel), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true },
  }).outputText;
  const m = { exports: {} };
  new Function("module", "exports", "require", out)(m, m.exports, (id) => (stubs[id] !== undefined ? stubs[id] : require(id)));
  return m.exports;
}
const quiet = {};
for (const level of ["warn", "info", "error", "log"]) {
  quiet[level] = console[level];
  if (level !== "log") console[level] = () => {};
}

// ---- the route, with TMDb / writer / taste stubbed ----------------------
const media = load("src/lib/tmdbMedia.ts", { "./tmdbVerify": { authFor: () => ({}), normalizeTitle: norm } });
const mk = (prefix, n, votes0, genre) =>
  Array.from({ length: n }, (_, i) => ({ id: prefix.charCodeAt(0) * 1000 + i, kind: "movie", title: `${prefix} ${i}`, year: 2010, overview: `${prefix} ${i} is a story. Second sentence.`, genreIds: [genre], votes: votes0 - i * 10, rating: 7.5 }));
const tier1 = mk("T", 50, 30000, 9648);
const pools = { tier1, tier2: mk("U", 50, 9000, 9648), tier3: mk("V", 50, 4000, 9648), touchstones: tier1.slice(0, 20), popular: tier1.slice(20), fresh: mk("F", 50, 2000, 9648), classic: mk("C", 50, 8000, 9648) };
// Two refs with their own webs: Knives Out (mystery, web A), Clue (comedy, web B).
const REF_BUNDLES = {
  "Knives Out": { id: 546554, kind: "movie", title: "Knives Out", year: 2019, overview: "A detective.", genreIds: [9648, 80], candidates: mk("A", 30, 20000, 9648), commitment: "2h 10m", rating: 7.9, votes: 9000, posterPath: "/k.jpg" },
  Clue: { id: 15196, kind: "movie", title: "Clue", year: 1985, overview: "A dinner party.", genreIds: [35], candidates: mk("B", 30, 20000, 35), commitment: "1h 34m", rating: 7.2, votes: 5000, posterPath: "/c.jpg" },
};
const bundleFor = (kind, id) => {
  const all = [...tier1, ...pools.tier2, ...pools.tier3, ...pools.fresh, ...pools.classic, ...REF_BUNDLES["Knives Out"].candidates, ...REF_BUNDLES.Clue.candidates];
  const c = all.find((x) => x.id === id);
  return { id, kind, title: c ? c.title : `t${id}`, year: 2010, overview: "o", genreIds: c ? c.genreIds : [9648], completion: { trailerUrl: null, watch: { link: "l", stream: [], rentBuy: [] }, availability: null }, candidates: [], commitment: "2h 10m", rating: 7.5, votes: 3000, posterPath: null };
};
const R0 = load("src/lib/slotRecipe.ts", { "./tmdbVerify": { normalizeTitle: norm }, "./tmdbMedia": media, "./synopsis": load("src/lib/synopsis.ts", {}) });
const R = { ...R0, loadPools: async () => pools, loadGoTos: async (_kind, goTos) => goTos.map((g) => ({ ...g, bundle: REF_BUNDLES[g.name] ?? null })) };
const writes = [];
const route = load("app/api/slots/route.ts", {
  "../../../src/lib/envCheck": { runEnvCheck() {} },
  "../../../src/lib/llm": { withLlmContext: (_req, fn) => fn() },
  "../../../src/lib/anchorSnapshots": { cleanClientId: (x) => (typeof x === "string" ? x : null) },
  "../../../src/lib/apiUsage": { capGate: async () => null },
  "../../../src/lib/tmdbMedia": { ...media, mediaConfigured: () => true, loadMediaBundle: async (kind, id) => bundleFor(kind, id) },
  "../../../src/lib/tmdbVerify": {
    normalizeTitle: norm,
    // The title check's matcher: "A 3" → its id; "Nope" → unresolved.
    verifyTitles: async (items) => ({
      enabled: true,
      verdicts: items.map((i) => {
        const all = [...tier1, ...REF_BUNDLES["Knives Out"].candidates, ...REF_BUNDLES.Clue.candidates];
        const c = all.find((x) => x.title === i.title);
        return c ? { title: i.title, resolved: true, tmdbId: c.id } : { title: i.title, resolved: false, reason: "not_found" };
      }),
    }),
  },
  "../../../src/lib/mediaReks": {
    raceTaste: async () => ({ liked: [], disliked: [], watched: [] }),
    linesVsGoTo: async ({ goTo, candidates }) => {
      writes.push({ goTo: goTo.title, n: candidates.length, titles: candidates.map((c) => c.title) });
      return new Map(candidates.map((c) => [c.id, `Lighter than it, same house (${c.title}).`]));
    },
  },
  "../../../src/lib/slotRecipe": R,
  "../../../src/lib/openaiFailure": { maybeSimulateOpenAIFailure() {}, openAIFailureResponse: () => null },
});
const post = (body) => route.POST(new Request("http://x/api/slots", { method: "POST", body: JSON.stringify(body) }));
const ref = (name) => ({ name, tmdbKind: "movie", tmdbId: REF_BUNDLES[name].id, at: "2026-10-25" });

(async () => {
  const base = { clientId: "anon_test_client_1234", category: "Movies", lane: null, refiner: null, seen: [] };

  console.log("1. Steering off by default");
  writes.length = 0;
  let res = await post({ ...base, goTos: [ref("Knives Out")] });
  let json = await res.json();
  check("starred go-to alone: the no-ref recipe, no writer, no vs.", [json.recipe, writes.length, json.reks.every((r) => r.vsGoTo === null)], ["none", 0, true]);
  check("…and the go-to's own title still never ships", json.reks.some((r) => r.title === "Knives Out"), false);

  console.log("\n2. One ref: the five lean on its web, every card vs. it");
  writes.length = 0;
  res = await post({ ...base, goTos: [], refs: [ref("Knives Out")] });
  json = await res.json();
  check("recipe one, five cards", [json.recipe, json.reks.length], ["one", 5]);
  check("neighbors come from its web", json.reks.filter((r) => r.slot === "neighbor").every((r) => /^A /.test(r.title)), true);
  check("every card vs. Knives Out", json.reks.map((r) => r.vsGoTo), Array(5).fill("Knives Out"));
  check("one writer call, all five", writes.map((w) => [w.goTo, w.n]), [["Knives Out", 5]]);
  check("the ref's own title never ships", json.reks.some((r) => norm(r.title) === "knives out"), false);

  console.log("\n3. Two refs: both webs, each card vs. its closest");
  let fromA = 0, fromB = 0, ok = true, calls = 0;
  for (let run = 0; run < 12; run++) {
    writes.length = 0;
    res = await post({ ...base, refs: [ref("Knives Out"), ref("Clue")] });
    json = await res.json();
    calls = Math.max(calls, writes.length);
    for (const r of json.reks) {
      if (/^A /.test(r.title)) { fromA++; ok = ok && r.vsGoTo === "Knives Out"; }
      else if (/^B /.test(r.title)) { fromB++; ok = ok && r.vsGoTo === "Clue"; }
      // A pool card (mystery genre) is closest to Knives Out (mystery), never Clue (comedy).
      else ok = ok && r.vsGoTo === "Knives Out";
    }
    ok = ok && writes.every((w) => w.titles.every((t) => json.reks.find((r) => r.title === t)?.vsGoTo === w.goTo));
  }
  check("recipe many", json.recipe, "many");
  check("12 sets draw from both webs", [fromA > 0, fromB > 0], [true, true]);
  check("web cards vs. their own ref; pool cards vs. the closest genre", ok, true);
  check("at most one writer call per ref", calls <= 2, true);
  check("every card carries a line", json.reks.every((r) => typeof r.vsGoTo === "string" && /^lighter than it/.test(r.short)), true);

  console.log("\n4. Early paint: cards, then lines naming each card's ref");
  res = await post({ ...base, refs: [ref("Knives Out"), ref("Clue")], stream: "ndjson" });
  const text = await res.text();
  const msgs = text.trim().split("\n").map((l) => JSON.parse(l));
  check("cards (pending) then lines", [msgs[0].type, msgs[0].linesPending, msgs[1].type], ["cards", true, "lines"]);
  check("cards paint with synopses", msgs[0].reks.every((r) => r.vsGoTo === null), true);
  check("lines name a ref each", msgs[1].lines.every((l) => l.vsGoTo === "Knives Out" || l.vsGoTo === "Clue"), true);

  console.log("\n5. A ref TMDb can't place steers nothing");
  writes.length = 0;
  res = await post({ ...base, refs: [{ name: "Nope", tmdbKind: null, tmdbId: null, at: "x" }] });
  json = await res.json();
  check("no-ref recipe, no writer", [json.recipe, writes.length], ["none", 0]);

  console.log("\n6. Lines for a set already on screen (an AI search's five)");
  writes.length = 0;
  res = await post({ ...base, action: "lines", refs: [ref("Knives Out"), ref("Clue")], items: [{ title: "A 3", year: 2010 }, { title: "B 4", year: 2010 }, { title: "T 9", year: 2010 }, { title: "Nope", year: 2001 }] });
  json = await res.json();
  const by = Object.fromEntries(json.lines.map((l) => [l.title, l.vsGoTo]));
  check("matched cards get lines; unmatched keeps its synopsis", Object.keys(by).sort(), ["A 3", "B 4", "T 9"]);
  check("each vs. its closest ref (genre)", [by["A 3"], by["B 4"], by["T 9"]], ["Knives Out", "Clue", "Knives Out"]);
  check("no re-pick: only the lines", json.reks === undefined, true);
  res = await post({ ...base, action: "lines", refs: [], items: [{ title: "A 3" }] });
  check("no refs → refused", res.status, 400);

  console.log("\n7. The stores (per device)");
  const store = new Map();
  let throwing = false;
  const events = [];
  global.CustomEvent = class { constructor(t) { this.type = t; } };
  global.window = {
    localStorage: {
      getItem: (k) => { if (throwing) throw new Error("blocked"); return store.has(k) ? store.get(k) : null; },
      setItem: (k, v) => { if (throwing) throw new Error("blocked"); store.set(k, String(v)); },
      removeItem: (k) => { if (throwing) throw new Error("blocked"); store.delete(k); },
    },
    dispatchEvent: (e) => events.push(e.type),
    addEventListener() {},
    removeEventListener() {},
  };
  const C = load("src/lib/compareTo.ts", {});
  const r = (name, category = "Movies") => ({ category, name, year: 2019, tmdbKind: "movie", tmdbId: 1, posterPath: null, at: "x" });
  C.setRefs("Movies", [r("Knives Out"), r("knives out"), r("Clue"), r("Heat"), r("Up")]);
  check("refs: deduped, at most 3", C.refsFor("Movies").map((x) => x.name), ["Knives Out", "Clue", "Heat"]);
  check("refs: another category sees none", C.refsFor("TV Shows").length, 0);
  check("refs: stored per device", JSON.parse(store.get("rekomendr.compare_to")).refs.length, 3);
  C.removeRef("Movies", "clue");
  check("× removes one", C.refsFor("Movies").map((x) => x.name), ["Knives Out", "Heat"]);
  C.clearIfCategoryChanged("Movies");
  check("same category keeps them", C.refsFor("Movies").length, 2);
  C.clearIfCategoryChanged("TV Shows");
  check("a category change clears them", [C.refsFor("Movies").length, store.has("rekomendr.compare_to")], [0, false]);
  throwing = true;
  C.setRefs("TV Shows", [r("Ted Lasso", "TV Shows")]);
  check("blocked storage: the set holds in memory", C.refsFor("TV Shows").map((x) => x.name), ["Ted Lasso"]);
  throwing = false;
  check("change events fire", events.includes("rekomendr:compare-to"), true);

  const Rc = load("src/lib/recent.ts", {});
  for (let i = 0; i < 35; i++) Rc.noteRecent({ category: i % 2 ? "Movies" : "tv", title: `T${i}`, year: 2000 + i });
  check("recent: newest first, capped at 30", [Rc.getRecent().length, Rc.getRecent()[0].title], [30, "T34"]);
  check("recent: categories normalized", Rc.getRecent()[0].category, "TV Shows");
  Rc.noteRecent({ category: "Movies", title: "T33", posterPath: "/p.jpg", tmdbId: 9, facts: [] });
  Rc.noteRecent({ category: "Movies", title: "t33 " });
  const top = Rc.getRecent()[0];
  check("recent: a repeat moves up once, keeps poster + id", [top.title, top.posterPath, top.tmdbId, Rc.getRecent().filter((x) => x.title.trim().toLowerCase() === "t33").length], ["t33", "/p.jpg", 9, 1]);
  Rc.noteRecent({ category: "TV Shows", title: "Ted Lasso", facts: ["3 seasons · 34 episodes", "on Apple TV+"] });
  check("recent: TV seasons read from the card", Rc.getRecent()[0].seasons, "3 seasons");
  Rc.noteRecent({ category: "Wine", title: "Bonanza" });
  check("recent: every category (wine too)", Rc.getRecent()[0].category, "Wine");
  check("recent: health or unknown ignored", (Rc.noteRecent({ category: "medication", title: "X" }), Rc.getRecent()[0].title), "Bonanza");
  Rc.clearRecent();
  check("Clear recent empties it", [Rc.getRecent().length, store.has("rekomendr.recent")], [0, false]);
  const recentSrc = read("src/lib/recent.ts");
  check("recent: never sent (no network call in the module)", /\bfetch\(|XMLHttpRequest|sendBeacon/.test(recentSrc), false);

  console.log("\n8. Wiring");
  const sc = read("src/lib/slotsClient.ts");
  check("slots: go-tos travel as exclusions, refs steer", /goTos: goTosFor\(req\.category\)\.map/.test(sc) && /refs: \(opts\.refs \?\? \[\]\)\.slice\(0, 3\)/.test(sc) && !/extraGoTos/.test(sc), true);
  check("screen: steered only by chosen refs", /refsPayload\(\[\.\.\.refsFor\("Movies"\), \.\.\.refsFor\("TV Shows"\)\]\)/.test(read("src/lib/screenClient.ts")) && !/goTosFor/.test(read("src/lib/screenClient.ts")), true);
  const page = read("app/page.tsx");
  check("page: a search in another category clears", /clearIfCategoryChanged\(nextCategory\);/.test(page), true);
  check("page: a typed mood that moves category clears", /clearIfCategoryChanged\(plan\.cat\);/.test(page), true);
  check("page: the bar moving clears (not its mount)", /if \(lastBarCatRef\.current !== null && lastBarCatRef\.current !== c\) clearIfCategoryChanged\(c\);/.test(page), true);
  check("page: an AI set gets lines in place (no re-pick)", /await addCompareLines\(next\.reks, nextCategory, searchId\);/.test(page), true);
  check("page: Books seeded by the first ref", /seed: seedRekOf\(bookRefs\[0\]\)/.test(page), true);
  check("page: Compare to never on wine or a screen set", /compareCat && resultsHeader && !screenOn/.test(page) && /=== "Movies" \|\| c === "TV Shows" \|\| c === "Books"/.test(read("src/lib/compareTo.ts")), true);
  const r4 = read("src/components/ResultsV4.tsx");
  check("cards: open/share/save/star/play note Recent", /const noteAct = /.test(r4) && /noteRecent\(/.test(r4), true);
  check("marks: watched, star, save note Recent in both lanes", [
    /noteRecent\(/.test(read("src/lib/useWatchedMarks.ts")),
    /noteRecent\(/.test(read("src/lib/goTos.ts")),
    /noteRecent\(/.test(read("src/lib/userPrefs.ts")),
    /noteRecent\(/.test(read("src/lib/reksnapSignals.ts")),
  ], [true, true, true, true]);
  check("the vs. line is highlighted", /VS_BAND = " rounded-lg bg-\[#EEF3FC\]/.test(read("src/components/RekCard.tsx")), true);

  console.log("\n9. Approved wording only");
  const sheet = read("src/components/CompareSheet.tsx").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const visible = [
    ...(sheet.match(/>\s*([A-Za-z][^<>{}]*?)\s*</g) || []).map((m) => m.replace(/^>\s*|\s*<$/g, "")),
    ...(sheet.match(/aria-label="([^"]+)"/g) || []).map((m) => m.slice(12, -1)),
    ...(sheet.match(/"(Favorites|Watched|Recent|Saved)"/g) || []).map((m) => m.slice(1, -1)),
  ].filter((w) => w && !/[=;()\n]/.test(w)); // JSX text, not TS generics
  const allowed = new Set(["Compare to", "Compare to…", "Done", "Favorites", "Watched", "Recent", "Saved", "Close", "+", "vs."]);
  check("sheet + header strings", [...new Set(visible)].filter((w) => !allowed.has(w)), []);
  check("type labels (Brad's 'type' field)", /const TYPE: Record<CompareCategory, string> = \{ Movies: "Movie", "TV Shows": "TV", Books: "Book" \};/.test(sheet), true);
  check("empty tabs reuse the Saved page's approved lines", ["Nothing saved yet. Tap the bookmark on any card to keep it here.", "Nothing marked watched yet.", "No favorites yet. Tap ☆ on a card you love."].every((t) => sheet.includes(t)), true);

  console.log("\n10. Untouched");
  const diff = (files) => {
    try {
      return execSync(`git diff main -- ${files}`, { cwd: root }).toString();
    } catch {
      return "git diff failed";
    }
  };
  check("wine: routes and libs byte-identical", diff("src/lib/wineReks.ts src/lib/wineShelf.ts src/lib/wineVisit.ts app/api/wine app/api/reksnap src/components/WineBought.tsx src/components/WineFacts.tsx"), "");
  check("no prompt text changed (chooser, mood parser)", diff("src/lib/mediaReks.ts src/lib/voiceMood.ts"), "");
  check("engine: no prompt lines changed", /^[-+].*(buildAIPrompt|You are Rekomendr|Sentence 3)/m.test(diff("src/engine/rekomendrEngine.ts")), false);

  quiet.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
