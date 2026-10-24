#!/usr/bin/env node
/* S17a — the real-title guard says what actually happened, and /api/stats
 * counts Watched (docs/s17-mood-first-plan.md, S17a).
 *   1. A failed CHECK is not fiction: the engine's AI search, with the
 *      verify call failing (503, a throw, every TMDb lookup failing),
 *      ships empty with NO fiction notice (the page shows the one failure
 *      voice); a single failed call is retried; a set TMDb answered "not
 *      there" for keeps the fiction notice.
 *   2. Two TMDb name matches, year ±1 still required.
 *   3. /api/stats has a "Watched" row (agents excluded).
 * No network: the model, the verify route and the database are stubs.
 * Run: node scripts/validate-s17a.cjs */

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
  process.stdout.write(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)}, expected ${JSON.stringify(want)})`}
`);
}

// Transpile a TS module (and its relative TS imports) to CommonJS; `stubs`
// replace bare or relative ids by their literal import string.
function makeLoader(stubs = {}) {
  const cache = {};
  const load = (file) => {
    if (cache[file]) return cache[file].exports;
    const out = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true },
    }).outputText;
    const m = { exports: {} };
    cache[file] = m;
    new Function("module", "exports", "require", out)(m, m.exports, (id) => {
      if (stubs[id] !== undefined) return stubs[id];
      if (id.startsWith(".")) {
        for (const ext of [".ts", ".tsx", ".js"]) {
          const p = path.resolve(path.dirname(file), id + ext);
          if (fs.existsSync(p)) return load(p);
        }
      }
      return require(id);
    });
    return m.exports;
  };
  return (rel) => load(path.join(root, rel));
}

const logs = [];
for (const level of ["warn", "info", "error", "log"]) console[level] = (...a) => logs.push([level, ...a]);
const out = (s) => process.stdout.write(s + "\n");

const store = {};
global.window = { localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v) } };
global.localStorage = global.window.localStorage;
global.sessionStorage = { getItem: () => null, setItem() {} };
store["rekomendr.client_id"] = "anon_agent_s17a_test";

const FIVE = ["Hot Fuzz", "In Bruges", "Snatch", "Chef", "Booksmart", "Clue", "Brick", "Election", "Sightseers", "Ghost World"];
let verifyMode = "ok";
let runTag = 0; // fresh titles per run: the engine's session-seen set remembers shown ones
let verifyCalls = 0;
global.fetch = async (url, init = {}) => {
  const body = init.body ? JSON.parse(init.body) : {};
  if (url === "/api/openai") {
    return new Response(JSON.stringify(FIVE.map((t, i) => ({ title: `${t} ${runTag}`, year: 2000 + i, short: "s", long: "l" }))), { status: 200 });
  }
  if (url === "/api/verify/titles") {
    verifyCalls++;
    const mode = typeof verifyMode === "function" ? verifyMode(verifyCalls) : verifyMode;
    if (mode === "503") return new Response("{}", { status: 503 });
    if (mode === "throw") throw new TypeError("Load failed");
    const verdicts = body.items.map((it) =>
      mode === "ok"
        ? { title: it.title, resolved: true }
        : mode === "lookup_failed"
          ? { title: it.title, resolved: false, reason: "lookup_failed" }
          : { title: it.title, resolved: false, reason: "no_match" }
    );
    return new Response(JSON.stringify({ enabled: true, verdicts }), { status: 200 });
  }
  throw new Error("unexpected fetch " + url);
};

(async () => {
  const load = makeLoader();
  const eng = load("src/engine/rekomendrEngine.ts");
  const run = async (mode) => {
    verifyMode = mode;
    verifyCalls = 0;
    runTag++;
    logs.length = 0;
    // a liked list puts the over-ask and the freshness slot in play, the
    // shape of the field case (shortlist on screen)
    return eng.getTop5FromEngine({
      rawQuery: "Movies||Comedy||||mode:ai",
      likedTitles: ["Knives Out", "Game Night"],
      shortlist: [{ title: "Knives Out", likedAt: "2026-10-01T00:00:00Z" }],
    });
  };

  out("1. A failed check is not fiction");
  let r = await run("ok");
  check("all verified → five", r.reks.length, 5);
  check("all verified → no notice", r.notice ?? null, null);

  r = await run("503");
  check("verify 503 every time → empty set", r.reks.length, 0);
  check("verify 503 → NO fiction notice (the page shows the failure voice)", r.notice ?? null, null);
  check(
    "verify 503 → named in the log",
    logs.some((l) => String(l[1]).includes("verification unavailable")),
    true
  );

  r = await run("throw");
  check("verify call throws (dropped request) → empty, no fiction notice", [r.reks.length, r.notice ?? null], [0, null]);

  r = await run("lookup_failed");
  check("every TMDb lookup failed → empty, no fiction notice", [r.reks.length, r.notice ?? null], [0, null]);

  r = await run((n) => (n % 2 === 1 ? "503" : "ok"));
  check("one failed call is retried → five", r.reks.length, 5);

  r = await run("no_match");
  check("TMDb answered 'not there' for all → empty", r.reks.length, 0);
  check("…with the fiction notice", r.notice, eng.UNVERIFIED_SEARCH_NOTICE);

  out("2. TMDb name matches (title, then year ±1 as before)");
  const v = makeLoader()("src/lib/tmdbVerify.ts");
  const m = (row, wanted) => v.titleMatches(row, v.normalizeTitle(wanted));
  check("'Glass Onion' ↔ 'Glass Onion: A Knives Out Mystery'", m("Glass Onion: A Knives Out Mystery", "Glass Onion"), true);
  check("'Ocean's 8' ↔ 'Ocean's Eight'", m("Ocean's Eight", "Ocean's 8"), true);
  check("'Ocean's Eight' ↔ 'Ocean's 8' (either way)", m("Ocean's 8", "Ocean's Eight"), true);
  check("exact title still matches", m("Knives Out", "Knives Out"), true);
  check("'Charade in the Fog' ≠ 'Charade'", m("Charade", "Charade in the Fog"), false);
  check("'Alien' ≠ 'Aliens'", m("Aliens", "Alien"), false);
  check("a subtitle on OUR side doesn't match a shorter TMDb title", m("Glass Onion", "Glass Onion: The Sequel"), false);

  out("3. /api/stats — Watched");
  process.env.STATS_KEY = "k";
  const tables = {
    user_likes: [
      { client_id: "anon_a", action: "watched" },
      { client_id: "anon_b", action: "watched" },
      { client_id: "anon_agent_x", action: "watched" },
    ],
  };
  const q = (table) => {
    const filters = [];
    const b = {
      select: () => b,
      eq: (c, val) => (filters.push([c, val]), b),
      is: () => b,
      gte: () => b,
      order: () => b,
      limit: async () => ({
        data: (tables[table] ?? []).filter((row) => filters.every(([c, val]) => row[c] === undefined || row[c] === val)),
        error: null,
      }),
    };
    return b;
  };
  const route = makeLoader({
    "../../../src/lib/envCheck": { runEnvCheck() {} },
    "../../../src/lib/anchorSnapshots": { getSnapshotStore: async () => ({ from: q }) },
    "../../../src/lib/testReadout": { loadEvents: async () => [], computeReadout: () => ({}) },
  })("app/api/stats/route.ts");
  const json = await (await route.GET(new Request("https://x/api/stats?key=k&format=json"))).json();
  check("JSON carries watched (agents excluded)", json.watched, 2);
  const agents = await (await route.GET(new Request("https://x/api/stats?key=k&format=json&agents=1"))).json();
  check("agents=1 counts agents only", agents.watched, 1);
  const html = await (await route.GET(new Request("https://x/api/stats?key=k"))).text();
  check("HTML has the approved label row", /<tr><td>Watched<\/td><td>2<\/td><\/tr>/.test(html), true);
  check("the readout reads only watched rows", /\.eq\("action", "watched"\)/.test(read("app/api/stats/route.ts")), true);

  out(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  out("CRASH " + (e && e.stack ? e.stack : e));
  process.exit(1);
});
