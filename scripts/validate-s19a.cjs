#!/usr/bin/env node
/* S19a — TMDb keyword tags + a named reference for typed and spoken
 * Movies/TV moods (docs/s19-fast-moods-plan.md, Part A).
 * The resolver (exact names, cached, failures unresolved), the parse's
 * keyword output, the widened gate (echoing tags, the named title,
 * negators, context, fillers), the mood pools (keyword discover params,
 * thirds, whole-pool fallback, neighbors fenced in), the route's weak-pool
 * gate, and the page's routing (voice runs the typed branch). No network:
 * TMDb is a stub.
 * Run: node scripts/validate-s19a.cjs */

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
for (const level of ["warn", "info", "error"]) console[level] = () => {};

(async () => {
  console.log("\n1. Keyword tags resolve by exact name, cached; a failure is unresolved");
  const calls = [];
  let tmdbDown = false;
  const KW = {
    heist: [{ id: 10051, name: "heist" }, { id: 191845, name: "bank heist" }],
    "feel good": [{ id: 383896, name: "feel good" }, { id: 275276, name: "feelgood" }],
    "cozy mystery": [{ id: 326774, name: "cozy" }],
    gore: [{ id: 10292, name: "gore" }, { id: 384156, name: "blood and gore" }, { id: 367142, name: "gore fest" }, { id: 1, name: "gory" }],
  };
  const K = load("src/lib/tmdbKeywords.ts", {
    "./tmdbMedia": {
      tmdbGet: async (p, params, onFail) => {
        calls.push(params.query);
        if (tmdbDown) {
          onFail && onFail("timeout");
          return null;
        }
        return { results: KW[params.query] ?? [] };
      },
    },
  });
  check("normalization ignores case, spaces and hyphens", [K.keywordKey("Feel-Good"), K.keywordKey("feel good"), K.keywordKey("feelgood")], ["feelgood", "feelgood", "feelgood"]);
  let r = await K.resolveConcepts([{ tags: ["heist", "caper"], exclude: false }, { tags: ["feel good"], exclude: false }, { tags: ["cozy mystery"], exclude: false }]);
  check("exact hits only (bank heist is not heist)", r.resolved[0].tags, [{ tag: "heist", ids: [10051] }]);
  check("every exact duplicate kept (feel good = feelgood)", r.resolved[1].tags[0].ids, [383896, 275276]);
  check("no exact hit = unresolved, never a near miss", r.unresolved, ["caper", "cozy mystery"]);
  check("a concept with no hit drops", r.resolved.length, 2);
  r = await K.resolveConcepts([{ tags: ["gore"], exclude: true }, { tags: ["gore"], exclude: false }]);
  check("an exclusion widens to every keyword containing its words (Saw: blood and gore)", r.resolved[0].tags[0].ids, [10292, 384156, 367142]);
  check("an inclusion stays exact", r.resolved[1].tags[0].ids, [10292]);
  const before = calls.length;
  await K.resolveConcepts([{ tags: ["heist"], exclude: false }]);
  check("cached (misses too)", calls.length, before);
  tmdbDown = true;
  r = await K.resolveConcepts([{ tags: ["time travel"], exclude: false }]);
  check("TMDb down → unresolved (the AI search runs)", [r.resolved.length, r.unresolved], [0, ["time travel"]]);
  check("the failure is named", read("src/lib/tmdbKeywords.ts").includes('"[mood-keywords] lookup failed — tag unresolved"'), true);
  const c = K.conceptOf([{ tag: "courtroom", ids: [33519] }, { tag: "courtroom drama", ids: [214780, 33519] }], false, "words");
  check("a concept ORs its tags' ids", c, { tags: ["courtroom", "courtroom drama"], ids: [33519, 214780], exclude: false, role: "words" });

  console.log("\n2. The parse names keyword tags (tags only, never text a person reads)");
  const stubVocab = {
    "./moodChips": {
      CHIPS_BY_CATEGORY: { Movies: [{ label: "Comedy", lane: "Comedy" }], "TV Shows": [{ label: "Comedy", lane: "Comedy" }], Wine: [{ label: "Bold Red", lane: "Bold Red" }] },
      REFINERS_BY_CATEGORY: { Movies: [{ label: "Feel-good" }], "TV Shows": [{ label: "Feel-good" }], Wine: [] },
      SURPRISE_ME: "Surprise me",
    },
    "./slotRecipe": { SLOT_LANES: { movie: ["comedy", "horror"], tv: ["comedy"] } },
    "./wineShelf": { PRICE_CHIPS: [] },
  };
  global.window = undefined;
  const V = load("src/lib/voiceMood.ts", stubVocab);
  const prompt = V.buildMoodPrompt();
  check("the prompt asks for keywords", /- keywords: concrete ideas/.test(prompt) && /"keywords": \{ "tags": string\[\], "exclude": boolean \}\[\]/.test(prompt), true);
  check("the prompt asks for a title's full official name", prompt.includes("full official name"), true);
  check(
    "only clean short tags, ≤4 per concept, ≤3 concepts",
    V.keywordsOf([{ tags: ["Heist", "heist", "x", "<script>", "a very very very very very very long keyword name"], exclude: false }, { tags: ["gore"], exclude: true }, { tags: [] }, { tags: ["sports"] }, { tags: ["road trip"] }]),
    [{ tags: ["heist"], exclude: false }, { tags: ["gore"], exclude: true }, { tags: ["sports"], exclude: false }]
  );
  check("keywords alone map a mood", V.validateMood({ category: "Movies", lane: null, keywords: [{ tags: ["time travel"] }] }, "Movies").mapped, true);
  check("wine never carries keywords", V.validateMood({ category: "Wine", lane: "Bold Red", keywords: [{ tags: ["heist"] }] }, "Wine").keywords, []);

  console.log("\n3. The gate: the person's own words, held whole");
  const G = load("src/lib/typedMoodGate.ts", {});
  check("tags echo the words", [G.tagEchoes("heist", "a funny heist movie"), G.tagEchoes("courtroom drama", "a courtroom drama"), G.tagEchoes("gore", "isn't too gory"), G.tagEchoes("coming of age", "a coming-of-age movie")], [true, true, true, true]);
  check("synonyms don't echo", [G.tagEchoes("caper", "a funny heist movie"), G.tagEchoes("found footage", "a mockumentary sitcom"), G.tagEchoes("road movie", "a road trip comedy")], [false, false, false]);
  const L = (lane) => ({ label: lane, lane });
  const kw = (tags, exclude = false, role = "words") => ({ tags, ids: [1], exclude, role });
  // The parses the local run produced (2026-10-24), resolved and filtered by the mood route.
  const runs = [
    ["a cozy mystery", { lane: L("Mystery"), refiner: "Feel-good", keywords: [] }, false],
    ["something like Ted Lasso but darker", { lane: L("Comedy"), refiner: "Dark", keywords: [kw(["sports", "coach"], false, "title")], goTo: { name: "Ted Lasso", starred: false, tmdbId: 97546 } }, true],
    ["a funny heist movie", { lane: L("Comedy"), refiner: null, keywords: [kw(["heist"])] }, true],
    ["a slow-burn psychological thriller", { lane: L("Thriller"), refiner: null, keywords: [kw(["slow burn"]), kw(["psychological thriller", "psychological"])] }, true],
    ["something light and romantic for date night", { lane: L("Romance"), refiner: "Feel-good", keywords: [] }, false],
    ["a mind-bending sci-fi movie", { lane: L("Sci-Fi"), refiner: null, keywords: [kw(["mind bending"])] }, true],
    ["a scary movie that isn't too gory", { lane: L("Horror"), refiner: null, keywords: [kw(["gore"], true)] }, true],
    ["a show like The Office", { lane: L("Comedy"), refiner: null, keywords: [kw(["mockumentary", "workplace comedy"], false, "title")], goTo: { name: "The Office", starred: false, tmdbId: 2316 } }, true],
    ["a funny show like Parks and Rec", { lane: L("Comedy"), refiner: null, keywords: [], goTo: { name: "Parks and Recreation", starred: false, tmdbId: 8592 } }, true],
    ["a time travel movie", { lane: L("Sci-Fi"), refiner: null, keywords: [kw(["time travel"])] }, true],
  ];
  for (const [text, mood, fast] of runs) check(`"${text}" → ${fast ? "words held (pool decides)" : "AI search"}`, G.typedMoodGate(text, mood).fast, fast);
  check("a keyword or a title makes it strict", [G.typedMoodGate("a funny heist movie", runs[2][1]).strict, G.typedMoodGate("a dark crime show", { lane: L("Crime"), refiner: "Dark" }).strict], [true, false]);
  check("a title TMDb didn't find stays AI", G.typedMoodGate("a show like Blorp", { lane: L("Comedy"), goTo: { name: "Blorp", starred: false, tmdbId: null } }).reason, "named_title");
  check("a starred go-to counts as found", G.typedMoodGate("something like Lioness", { lane: L("Drama"), goTo: { name: "Lioness", starred: true, tmdbId: null } }).fast, true);
  check("negators only cover with an exclusion", G.typedMoodGate("a scary movie that isn't too gory", { lane: L("Horror"), keywords: [] }).fast, false);
  check("a title's signature tags never cover the words", G.typedMoodGate("a mockumentary", { lane: L("Comedy"), keywords: [kw(["mockumentary"], false, "title")] }).fast, false);
  check("a word nothing covers stays residual", G.typedMoodGate("a funny heist movie with dinosaurs", runs[2][1]).residual, ["dinosaurs"]);
  check("spoken fillers are covered", G.typedMoodGate("um maybe something funny", { lane: L("Comedy") }).fast, true);
  check("date night is not context (measured: the Romance pool alone served tear-jerkers)", G.typedMoodGate("a romance for date night", { lane: L("Romance") }).residual, ["date", "night"]);

  console.log("\n4. The mood route: which tags may filter");
  const mood = read("app/api/mood/route.ts");
  check("tags must echo the words", /const echo = usable\.filter\(\(t\) => tagEchoes\(t\.tag, transcript\)\);/.test(mood), true);
  check("no echo → a title's signature, only when TMDb found the title", /else if \(titleKnown && !c\.exclude && usable\.length\) concepts\.push\(conceptOf\(usable, false, "title"\)\);/.test(mood) && /const titleKnown = !!goTo && \(goTo\.starred \|\| !!goTo\.tmdbId\);/.test(mood), true);
  check("an echoing exclusion keeps all its tags (synonyms only narrow)", /concepts\.push\(conceptOf\(c\.exclude \? usable : echo, c\.exclude, "words"\)\)/.test(mood), true);
  check("resolution runs beside the go-to lookup", mood.indexOf("const keywordsP") < mood.indexOf("if (mood.goTo && screen)") && mood.indexOf("await keywordsP") > mood.indexOf("if (mood.goTo && screen)"), true);
  check("the answer carries keywords + unresolved", /keywords: keywords\.resolved,\s*unresolved: keywords\.unresolved,/.test(mood), true);

  console.log("\n5. Mood pools: keywords → discover, thirds, whole-pool fallback, fenced neighbors");
  const sent = [];
  const rows = (n, base = 5000) =>
    Array.from({ length: n }, (_, i) => ({ id: base + i, title: `Heist ${i}`, release_date: `${2000 + (i % 25)}-01-01`, overview: `Heist ${i}. More.`, genre_ids: [35], vote_count: 9000 - i * 50, vote_average: 7 }));
  let pageRows = rows(20);
  const media = {
    tmdbGet: async (p, params) => {
      sent.push({ p, ...params });
      return { results: params.page === "1" ? pageRows : [] };
    },
    rowTitle: (r) => r.title ?? r.name ?? "",
    rowYear: (r) => Number((r.release_date ?? r.first_air_date ?? "").slice(0, 4)) || null,
    safePosterPath: () => null,
    loadMediaBundle: async () => null,
    resolveSnappedTitle: async () => null,
  };
  const R = load("src/lib/slotRecipe.ts", { "./tmdbVerify": { normalizeTitle: norm }, "./tmdbMedia": media, "./synopsis": { shortSynopsis: (s) => s } });
  const pools = await R.loadMoodPools("movie", "comedy", null, [{ ids: [10051, 191845], exclude: false }, { ids: [6075], exclude: false }, { ids: [10292], exclude: true }]);
  const q = sent[0];
  check("AND across concepts, OR inside one", q.with_keywords, "10051|191845,6075");
  check("exclusions → without_keywords", q.without_keywords, "10292");
  check("lane genre + lane floor as the chips", [q.with_genres, q["vote_average.gte"]], ["35", "5"]);
  check("200-vote minimum, 3 pages", [q["vote_count.gte"], sent.length], ["200", 3]);
  check("Horror stays out of a non-horror movie mood pool", q.without_genres.split(",").includes("27"), true);
  sent.length = 0;
  await R.loadMoodPools("movie", "horror", null, [{ ids: [10292], exclude: true }]);
  check("…unless the lane is Horror", sent[0].without_genres.split(",").includes("27"), false);
  sent.length = 0;
  await R.loadMoodPools("movie", "drama", { kind: "tone", vibe: "Feel-Good Crowd Pleaser" }, [{ ids: [6075], exclude: false }]);
  check("a feel-good mood pool keeps out what TMDb tags as sad (tragedy, euthanasia…)", sent[0].without_keywords.split(",").slice(0, 7).join(","), "10614,368391,6564,206662,10163,323809,241364");
  // S20 — the chips keep the same keep-outs now (validate-s20.cjs).
  check("the whole pool, sorted by votes", [pools.all.length, pools.all[0].votes >= pools.all[1].votes], [20, true]);
  check("thirds for the tiers", [pools.tier1.length, pools.tier2.length, pools.tier3.length], [7, 7, 6]);
  check("the strength line is 12", R.MIN_STRONG_POOL, 12);
  // A pool of exactly 12 fills five, whatever the recipe.
  pageRows = rows(12, 7000);
  sent.length = 0;
  const small = await R.loadMoodPools("movie", "comedy", null, [{ ids: [1], exclude: false }]);
  for (const recipe of ["none", "one", "many"]) {
    const picks = R.assemble({ recipe, pools: small, neighbors: R.neighborPool(null, [35], 5, small), excluded: new Set(), rand: () => 0.5 });
    check(`a 12-title pool fills five (${recipe})`, picks.length, 5);
  }
  const goTo = { name: "Knives Out", bundle: { genreIds: [35], candidates: [{ id: 7003, title: "Heist 3", genreIds: [35], votes: 100, rating: 7 }, { id: 1, title: "Not A Heist", genreIds: [35], votes: 100, rating: 9 }] } };
  const n = R.neighborPool(goTo, [35], 5, small);
  check("neighbors stay inside the mood pool", [n.some((c) => c.title === "Not A Heist"), n[0].title], [false, "Heist 3"]);
  const web = R.webPools("tv", "comedy", null, { candidates: [
    { id: 1, title: "Parks", genreIds: [35], votes: 900, rating: 7.8, year: 2009 },
    { id: 2, title: "Tiny", genreIds: [35], votes: 30, rating: 7.8, year: 2009 },
    { id: 3, title: "Low", genreIds: [35], votes: 900, rating: 4, year: 2009 },
    { id: 4, title: "Drama only", genreIds: [18], votes: 900, rating: 8, year: 2009 },
  ] });
  check("a reference's web pool: lane, floor, vote minimum", web.all.map((c) => c.title), ["Parks"]);

  console.log("\n6. The slots route: the weak-pool gate");
  const route = read("app/api/slots/route.ts");
  check("keywords or a reference → a mood pool", /const mood = concepts\.length > 0 \|\| !!reference;/.test(route), true);
  check("too thin a five-card pool → weak_pool (backfills never gate)", /if \(mood && count === 5 && \(poolLeft \?\? 0\) < MIN_STRONG_POOL\) \{[\s\S]*?"\[slots\] weak pool — the AI search runs"[\s\S]*?reason: "weak_pool"/.test(route), true);
  check("counted after this visit's exclusions", /pools\.all\.filter\(\(c\) => !excluded\.has\(normalizeTitle\(c\.title\)\)\)\.length/.test(route), true);
  check("no reference bundle → named weak pool", /why: concepts\.length \? "tmdb_failed" : "reference_unavailable"/.test(route), true);
  check("concepts sanitized (≤3, positive ints)", /\.slice\(0, 3\)[\s\S]*?Number\.isInteger\(n\) && \(n as number\) > 0/.test(route), true);

  console.log("\n7. The page: typed and spoken moods share the path");
  const page = read("app/page.tsx");
  check("a parsed mood carries keywords + the reference into the request", /\.\.\.\(keywords\.length \? \{ keywords \} : \{\}\),\s*\.\.\.\(goTo \? \{ reference: goTo\.name \} : \{\}\),/.test(page), true);
  check("voice runs the typed branch, parse in hand", /await handleSearch\(`\$\{cat\}\|\|\|\|\$\{transcript\}\|\|mode:ai`, cat, undefined, undefined, voice, data\);/.test(page), true);
  check("…with no second parse and no title check", /typedText && !parsedMood \? resolveTypedAnchor/.test(page) && /parsedMood\s*\? Promise\.resolve\(parsedMood\)/.test(page), true);
  check("the slots request sends them", /\.\.\.\(req\.keywords\?\.length \? \{ keywords: req\.keywords \} : \{\}\),\s*\.\.\.\(req\.reference \? \{ reference: req\.reference \} : \{\}\),/.test(read("src/lib/slotsClient.ts")), true);
  check("backfills keep the same request (keywords ride slotReqRef)", /slotReqRef\.current = \{ req, steer, extraGoTo \};/.test(page), true);
  check("the log names the source and the mood fields", /source: voice \? "voice" : "typed",[\s\S]{0,200}keywords: plan\.req\.keywords\?\.length \?\? 0,\s*reference: !!plan\.req\.reference,/.test(page), true);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
