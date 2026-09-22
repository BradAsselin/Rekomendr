/* eslint-disable no-console */
//
// scripts/validate-s15.cjs — S1.5's counted validation.
//
// This container has no TMDB_API_KEY (and no OpenAI or Supabase keys), so
// the harness compiles the guard FROM SOURCE and drives it with TMDb's
// HTTP stubbed. Everything under test is Rekomendr's own code: the match
// rule, the drop rule, the failure posture, the cache, the engine's
// order of operations, and the recipe gate's truth table.
//
// What it cannot do, and does not pretend to: prove that the real TMDb
// answers the way the stub does. That is the one thing Brad's acceptance
// test covers — re-snap the release that produced the fiction.
//
//   node scripts/validate-s15.cjs
//
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), "s15-validate-"));

console.log("Compiling from source (fresh, never a cached bundle)…");
execFileSync(
  "npx",
  [
    "tsc",
    "src/engine/rekomendrEngine.ts",
    "src/lib/tmdbVerify.ts",
    "src/lib/snapTitleGuard.ts",
    "src/lib/categoryGates.ts",
    "--outDir", OUT,
    "--module", "commonjs",
    "--target", "es2020",
    "--moduleResolution", "node",
    "--esModuleInterop",
    "--skipLibCheck",
  ],
  { stdio: "inherit" }
);

const P = (f) => path.join(OUT, f);
const fresh = (f) => {
  for (const k of Object.keys(require.cache)) {
    if (k.startsWith(OUT)) delete require.cache[k];
  }
  return require(P(f));
};

/* ------------------------------------------------------------------
   A stub TMDb. `db` is the set of titles that "exist".
------------------------------------------------------------------- */
let db = [];          // [{ kind, title, year, original }]
let httpCalls = [];   // every outgoing URL
let forceStatus = null; // e.g. 500 -> every lookup fails
let forceThrow = false;

const installStubTmdb = () => {
  httpCalls = [];
  globalThis.fetch = async (url) => {
    httpCalls.push(String(url));
    if (forceThrow) throw new Error("ECONNRESET");
    if (forceStatus) return { ok: false, status: forceStatus };
    const u = new URL(String(url));
    const kind = u.pathname.endsWith("/movie") ? "movie" : "tv";
    // TMDb's own search is accent- and case-insensitive, so the stub must
    // be too — otherwise this harness tests the stub, not the guard.
    const fold = (t) =>
      t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const q = fold(u.searchParams.get("query") || "");
    const rows = db
      .filter((r) => r.kind === kind && fold(r.title).includes(q.slice(0, 4)))
      .map((r) =>
        kind === "movie"
          ? {
              title: r.title,
              original_title: r.original ?? r.title,
              release_date: r.year ? `${r.year}-06-01` : undefined,
            }
          : {
              name: r.title,
              original_name: r.original ?? r.title,
              first_air_date: r.year ? `${r.year}-06-01` : undefined,
            }
      );
    return { ok: true, status: 200, json: async () => ({ results: rows }) };
  };
};

/* ------------------------------------------------------------------
   Assertions
------------------------------------------------------------------- */
let pass = 0, fail = 0;
const check = (label, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}  (got ${a}, expected ${e})`);
};

(async () => {
  /* ============================================================== */
  console.log("\n=== 1. The match rule: title + year ±1 ===\n");
  process.env.TMDB_API_KEY = "test-key";
  db = [
    { kind: "movie", title: "Prisoners", year: 2013 },
    { kind: "movie", title: "Amélie", year: 2001 },
    { kind: "movie", title: "WALL·E", year: 2008 },
    { kind: "movie", title: "Arrival", year: 2016 },
    { kind: "movie", title: "Heat", year: 1995 },
    { kind: "tv", title: "The Night Of", year: 2016 },
  ];
  {
    installStubTmdb();
    const { verifyTitles } = fresh("lib/tmdbVerify.js");
    const r = await verifyTitles([
      { title: "Prisoners", year: 2013, kind: "movie" },
      { title: "Prisoners", year: 2014, kind: "movie" }, // +1
      { title: "Prisoners", year: 2012, kind: "movie" }, // -1
      { title: "Prisoners", year: 2016, kind: "movie" }, // +3
      { title: "The Backrooms Ascension", year: 2026, kind: "movie" },
      { title: "amelie", year: 2001, kind: "movie" },      // accents + case
      { title: "Wall E", year: 2008, kind: "movie" },       // punctuation
      { title: "The Night Of", year: null, kind: "tv" },    // no year (snap lane)
    ]);
    const v = r.verdicts;
    check("  exact year resolves", v[0].resolved, true);
    check("  year +1 resolves", v[1].resolved, true);
    check("  year -1 resolves", v[2].resolved, true);
    check("  year +3 is dropped", v[3].resolved, false);
    check("  ...and named year_mismatch", v[3].reason, "year_mismatch");
    check("  FABRICATED title is dropped", v[4].resolved, false);
    check("  ...and named no_match", v[4].reason, "no_match");
    check("  accents/case normalize", v[5].resolved, true);
    check("  punctuation normalizes", v[6].resolved, true);
    check("  no year (snap lane) matches on title alone", v[7].resolved, true);
  }

  /* ============================================================== */
  console.log("\n=== 2. Failure posture ===\n");
  {
    installStubTmdb();
    forceStatus = 500;
    const { verifyTitles } = fresh("lib/tmdbVerify.js");
    const r = await verifyTitles([{ title: "Prisoners", year: 2013, kind: "movie" }]);
    check("  TMDb 500 -> dropped (fail-closed)", r.verdicts[0].resolved, false);
    check("  ...named lookup_failed", r.verdicts[0].reason, "lookup_failed");
    check("  ...after exactly one retry (2 calls)", httpCalls.length, 2);
    forceStatus = null;
  }
  {
    installStubTmdb();
    forceThrow = true;
    const { verifyTitles } = fresh("lib/tmdbVerify.js");
    const r = await verifyTitles([{ title: "Prisoners", year: 2013, kind: "movie" }]);
    check("  transport throw -> dropped", r.verdicts[0].resolved, false);
    forceThrow = false;
  }
  {
    installStubTmdb();
    delete process.env.TMDB_API_KEY;
    const { verifyTitles } = fresh("lib/tmdbVerify.js");
    const r = await verifyTitles([{ title: "Totally Invented", year: 2026, kind: "movie" }]);
    check("  NO KEY -> guard disabled", r.enabled, false);
    check("  NO KEY -> everything passes", r.verdicts[0].resolved, true);
    check("  NO KEY -> zero TMDb calls", httpCalls.length, 0);
    process.env.TMDB_API_KEY = "test-key";
  }

  /* ============================================================== */
  console.log("\n=== 3. Cache: verdicts cached, outages never ===\n");
  {
    installStubTmdb();
    const { verifyTitles } = fresh("lib/tmdbVerify.js");
    await verifyTitles([{ title: "Prisoners", year: 2013, kind: "movie" }]);
    const after1 = httpCalls.length;
    await verifyTitles([{ title: "Prisoners", year: 2013, kind: "movie" }]);
    check("  repeat lookup makes no new call", httpCalls.length, after1);

    forceStatus = 500;
    await verifyTitles([{ title: "Brand New Thing", year: 2026, kind: "movie" }]);
    const after2 = httpCalls.length;
    forceStatus = null;
    await verifyTitles([{ title: "Brand New Thing", year: 2026, kind: "movie" }]);
    check("  a lookup FAILURE is not cached", httpCalls.length > after2, true);
  }

  /* ============================================================== */
  console.log("\n=== 4. Snap side: anchors exempt, non-media untouched ===\n");
  {
    installStubTmdb();
    const { dropUnresolvedMediaReks, mediaKindFor } = fresh("lib/snapTitleGuard.js");
    check("  'movies' is checked as a movie", mediaKindFor("movies"), "movie");
    check("  'tv shows' is checked as tv", mediaKindFor("tv shows"), "tv");
    check("  'cocktails' is NOT checked", mediaKindFor("cocktails"), null);
    check("  'wine' is NOT checked", mediaKindFor("wine"), null);

    const survivors = await dropUnresolvedMediaReks(
      [
        { name: "Prisoners", category: "movies" },
        { name: "The Backrooms Ascension", category: "movies" },
        { name: "Invented Sequel", category: "movies" },
        { name: "Negroni", category: "cocktails" },
      ],
      { path: "snap", anchor: "Backrooms", anchorCategory: "movies" }
    );
    check("  two fabricated movies dropped", survivors.map((s) => s.name),
      ["Prisoners", "Negroni"]);
  }

  /* ============================================================== */
  console.log("\n=== 5. The engine: over-ask covers the drops ===\n");
  const runSearch = async ({ produced, category = "Movies" }) => {
    installStubTmdb();
    const engine = fresh("engine/rekomendrEngine.js");
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const u = String(url);
      if (u.startsWith("/api/openai")) {
        return {
          ok: true,
          text: async () =>
            JSON.stringify(
              produced.map((t) => ({
                title: t.title,
                year: t.year,
                short: "A. B. C.",
                long: "One. Two. Three.",
                genre: "Drama",
              }))
            ),
        };
      }
      if (u.startsWith("/api/verify/titles")) {
        // The real route's logic, inlined: this is the browser->server hop.
        const { verifyTitles } = fresh("lib/tmdbVerify.js");
        globalThis.fetch = realFetch; // the verifier needs the TMDb stub
        const body = JSON.parse(init.body);
        const out = await verifyTitles(body.items);
        globalThis.fetch = arguments.callee; // restore below
        return { ok: true, json: async () => out };
      }
      return { ok: false, status: 404 };
    };
    // The self-referencing restore above is fragile; use a stable wrapper.
    const openaiOrVerify = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const u = String(url);
      if (u.startsWith("/api/verify/titles")) {
        const { verifyTitles } = fresh("lib/tmdbVerify.js");
        const saved = globalThis.fetch;
        globalThis.fetch = realFetch;
        const out = await verifyTitles(JSON.parse(init.body).items);
        globalThis.fetch = saved;
        return { ok: true, json: async () => out };
      }
      return openaiOrVerify(url, init);
    };
    return engine.getTop5FromEngine({ rawQuery: `${category}||Romance||clever` });
  };

  {
    // 8 produced (the field's over-ask receipt), 3 of them fiction.
    const r = await runSearch({
      produced: [
        { title: "Prisoners", year: 2013 },
        { title: "Invented One", year: 2026 },
        { title: "Amélie", year: 2001 },
        { title: "Invented Two", year: 2026 },
        { title: "WALL·E", year: 2008 },
        { title: "Invented Three", year: 2026 },
        { title: "Arrival", year: 2016 },
        { title: "Heat", year: 1995 },
      ],
    });
    check("  ships a full five from an 8-item over-ask", r.reks.length, 5);
    check("  no fabricated title survives",
      r.reks.some((x) => x.title.startsWith("Invented")), false);
  }
  {
    const r = await runSearch({
      produced: [
        { title: "Invented One", year: 2026 },
        { title: "Invented Two", year: 2026 },
        { title: "Invented Three", year: 2026 },
      ],
    });
    check("  all-fiction -> empty set", r.reks.length, 0);
    check("  ...with the plain-voice notice", typeof r.notice, "string");
    check("  ...which is NOT the Reks Ray failure voice",
      /couldn.t confirm is real/.test(r.notice || ""), true);
  }
  {
    // Books must not be touched: TMDb does not know them.
    const r = await runSearch({
      category: "Books",
      produced: [
        { title: "Invented One", year: 2026 },
        { title: "Invented Two", year: 2026 },
        { title: "Invented Three", year: 2026 },
        { title: "Invented Four", year: 2026 },
        { title: "Invented Five", year: 2026 },
      ],
    });
    check("  Books are not verified (all ship)", r.reks.length, 5);
  }

  {
    // A real TV series offered under a MOVIES search is not a movie, and
    // the lane's kind is what gets asked. Documented deliberately: this
    // is the guard being strict about the right thing, not a bug.
    const r = await runSearch({
      produced: [
        { title: "Prisoners", year: 2013 },
        { title: "The Night Of", year: 2016 }, // real, but a TV series
        { title: "Amélie", year: 2001 },
        { title: "WALL·E", year: 2008 },
        { title: "Arrival", year: 2016 },
      ],
    });
    check("  a TV title under a Movies search is dropped",
      r.reks.some((x) => x.title === "The Night Of"), false);
    check("  ...and the real movies still ship", r.reks.length, 4);
  }

  /* ============================================================== */
  console.log("\n=== 6. The recipe gate: unknown now suppresses ===\n");
  {
    const { categoryGetsRecipe } = fresh("lib/categoryGates.js");
    const cases = [
      ["food", true], ["eggs", true], ["chocolate", true], ["pasta", true],
      ["wine", true], ["vodka", true], ["cocktails", true], ["coffee", true],
      // The two field leaks, both previously TRUE under the deny-list:
      ["logo", false], ["advertisement", false], ["ad", false],
      ["app", false], ["social media", false], ["poster", false],
      // Health wall stays structural:
      ["cream", false], ["vitamins", false], ["skincare", false],
      // Media and non-consumables unchanged:
      ["movies", false], ["books", false], ["electronics", false],
      // Unknown and empty:
      ["", false], ["nextdoor logo", false],
    ];
    for (const [cat, expected] of cases) {
      check(`  "${cat}"`, categoryGetsRecipe(cat), expected);
    }
  }

  console.log(`\n${pass} passed, ${fail} failed.`);
  fs.rmSync(OUT, { recursive: true, force: true });
  process.exit(fail === 0 ? 0 : 1);
})();
