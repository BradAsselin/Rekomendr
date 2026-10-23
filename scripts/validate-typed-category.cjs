/* eslint-disable no-console */
//
// scripts/validate-typed-category.cjs — the selected category wins on a
// typed name (field bug 2026-10-18: "Bonanza" on the Wine bar landed the
// TV western). The TMDb typed-title lookup crosses only Movies ↔ TV, never
// from Wine or Books; on the Wine bar typed text always takes the wine
// path, and a read that lands outside wine never ships.
//
// Compiles the REAL routes (/api/anchor, /api/reksnap) from source. Stubs
// TMDb (globalThis.fetch), OpenAI and the Supabase service-role client.
// No keys, no network.
//
//   node scripts/validate-typed-category.cjs
//
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CACHE = path.join(ROOT, "node_modules", ".cache");
fs.mkdirSync(CACHE, { recursive: true });
const OUT = fs.mkdtempSync(path.join(CACHE, "typed-category-validate-"));

console.log("Compiling /api/anchor, /api/reksnap from source…");
execFileSync(
  "npx",
  [
    "tsc",
    "app/api/anchor/route.ts",
    "app/api/reksnap/route.ts",
    "--outDir", OUT,
    "--rootDir", ".",
    "--module", "commonjs",
    "--target", "es2020",
    "--moduleResolution", "node",
    "--esModuleInterop",
    "--skipLibCheck",
    "--lib", "es2020,dom",
  ],
  { stdio: "inherit", cwd: ROOT }
);

const out = (line) => process.stdout.write(`${line}\n`);
let pass = 0;
let fail = 0;
const check = (label, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  ok ? pass++ : fail++;
  out(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `  (got ${a}, expected ${e})`}`);
};

let logs = [];
for (const level of ["warn", "info", "log", "error"]) {
  const orig = console[level].bind(console);
  console[level] = (...args) => {
    logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    if (process.env.TC_VERBOSE) orig(...args);
  };
}
const logged = (needle) => logs.some((l) => l.includes(needle));

/* ---------------- TMDb stub ---------------- */
const row = (id, title, year, votes) => ({
  id, title, name: title, original_title: title, original_name: title,
  release_date: `${year}-05-01`, first_air_date: `${year}-05-01`,
  vote_count: votes, popularity: votes / 10,
  overview: `${title} overview: a concrete premise with a person at stake.`,
});
const SEARCH = {
  movie: {
    bonanza: [row(801, "Bonanza", 2001, 30)],
    lioness: [row(901, "Lioness", 2008, 4)],
    dune: [row(438631, "Dune", 2021, 14000)],
  },
  tv: {
    bonanza: [row(3357, "Bonanza", 1959, 400)],
    lioness: [row(113962, "Lioness", 2023, 1688)],
    dune: [row(7000, "Dune", 2000, 200)],
  },
};
const detail = (r, kind) => ({
  id: r.id, [kind === "tv" ? "name" : "title"]: r.title,
  [kind === "tv" ? "first_air_date" : "release_date"]: r.release_date,
  overview: r.overview, videos: { results: [] }, "watch/providers": { results: {} },
  release_dates: { results: [] },
  recommendations: { results: Array.from({ length: 8 }, (_, i) => row(5000 + i, `Candidate ${i + 1}`, 2010, 200)) },
  similar: { results: [] },
});
const tmdb = { calls: [] };
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  tmdb.calls.push(u.pathname);
  const m = u.pathname.match(/^\/3\/search\/(movie|tv)$/);
  if (m) {
    const q = (u.searchParams.get("query") || "").toLowerCase().trim();
    return new Response(JSON.stringify({ results: SEARCH[m[1]][q] ?? [] }), { status: 200 });
  }
  const d = u.pathname.match(/^\/3\/(movie|tv)\/(\d+)$/);
  if (d) {
    const r = Object.values(SEARCH[d[1]]).flat().find((x) => String(x.id) === d[2]);
    if (r) return new Response(JSON.stringify(detail(r, d[1])), { status: 200 });
  }
  return new Response("{}", { status: 404 });
};

/* ---------------- OpenAI stub ---------------- */
// The vision reads come off a queue, so a retry can be told apart.
const ai = { calls: [], classify: null, reads: [] };
class FakeOpenAI {
  constructor() {
    this.chat = {
      completions: {
        create: async (req) => {
          ai.calls.push(req);
          const system = String(req.messages?.[0]?.content ?? "");
          if (system.startsWith("Decide whether the user's text names ONE specific wine")) {
            return { choices: [{ message: { content: JSON.stringify(ai.classify) } }] };
          }
          if (system.startsWith("You pick and explain")) {
            return { choices: [{ message: { content: JSON.stringify({ picks: [], wildcard: null }) } }] };
          }
          const next = ai.reads.length > 1 ? ai.reads.shift() : ai.reads[0];
          // S14: the typed read's first attempt streams (the photo path's reader).
          if (req.stream) {
            const text = JSON.stringify(next);
            return (async function* () {
              yield { choices: [{ delta: { content: text } }] };
              yield { choices: [{ delta: {}, finish_reason: "stop" }] };
              yield { choices: [], usage: { prompt_tokens: 1, completion_tokens: 2 } };
            })();
          }
          return { choices: [{ message: { content: JSON.stringify(next) } }], usage: { prompt_tokens: 1, completion_tokens: 2 } };
        },
      },
    };
  }
}
const seed = (file, exports) => {
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
seed(require.resolve("openai"), { __esModule: true, default: FakeOpenAI });

function query(table) {
  const b = {
    select() { return b; }, insert() { return b; }, update() { return b; }, upsert() { return b; },
    eq() { return b; }, gt() { return b; }, gte() { return b; }, in() { return b; },
    order() { return b; }, limit() { return b; }, not() { return b; }, is() { return b; }, ilike() { return b; },
    maybeSingle() { return Promise.resolve({ data: null, error: null }); },
    single() { return Promise.resolve({ data: null, error: null }); },
    then(res, rej) { return Promise.resolve({ data: [], error: null, count: 0 }).then(res, rej); },
  };
  return b;
}
seed(path.join(OUT, "src/lib/supabaseServer.js"), { supabaseServer: { from: (t) => query(t) } });

process.env.TMDB_API_KEY = "v3key";
process.env.OPENAI_API_KEY = "stub";
process.env.SUPABASE_URL = "http://stub.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "stub";
process.env.MINT_SIGNING_SECRET = "typed-category-secret";

const anchorRoute = require(path.join(OUT, "app/api/anchor/route.js"));
const snapRoute = require(path.join(OUT, "app/api/reksnap/route.js"));

const CLIENT = "anon_typed_category_harness";
const call = async (route, body) => {
  const res = await route.POST(
    new Request("http://local/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
};
const resolve = async (category, text) => {
  tmdb.calls = [];
  const r = await call(anchorRoute, { action: "resolve", text, category, clientId: CLIENT });
  const a = r.json?.anchor;
  return a ? `${a.media?.kind}:${a.detected_item?.name}` : null;
};
const wineRead = (name) => ({
  detected_item: { name, description: "Dry and plush.", category: "wine" },
  mode: "similar",
  results: { similar: Array.from({ length: 5 }, (_, i) => ({ name: `Wine ${i}`, description: "d", category: "wine", rank: i + 1 })), uses: [], alternatives: [] },
});
const tvRead = {
  detected_item: { name: "Bonanza", description: "The Cartwrights run the Ponderosa.", category: "tv" },
  mode: "similar",
  results: { similar: ["Gunsmoke", "Little House on the Prairie", "Rawhide", "The Big Valley", "The Virginian"].map((n, i) => ({ name: n, description: "d", category: "tv", rank: i + 1 })), uses: [], alternatives: [] },
};
const typedWine = (text) => call(snapRoute, { typed: { text, clientId: CLIENT }, wineVisit: { seen: [], rejected: [], favorite: null, chip: null } });
const isRead = (c) => String(c.messages?.[0]?.content ?? "").startsWith("You are a taste-aware recommendation engine reading a single photo.");
const visionCalls = () => ai.calls.filter(isRead).length;

(async () => {
  out("\n1. /api/anchor resolve: the TMDb lookup crosses only Movies ↔ TV");
  check("TV + 'Bonanza' → the show", await resolve("TV Shows", "Bonanza"), "tv:Bonanza");
  check("Movies + 'Lioness' → still the show", await resolve("Movies", "Lioness"), "tv:Lioness");
  check("Movies + 'Dune' → the film", await resolve("Movies", "Dune"), "movie:Dune");
  check("Wine + 'Bonanza' → no TMDb anchor", await resolve("Wine", "Bonanza"), null);
  check("…and TMDb is never asked", tmdb.calls.length, 0);
  check("Books + 'Dune' → no TMDb anchor", await resolve("Books", "Dune"), null);
  check("…and TMDb is never asked", tmdb.calls.length, 0);
  for (const c of ["wine", "Red Wine", "books", "Book", "Food", "", null]) {
    check(`category ${JSON.stringify(c)} + 'Bonanza' → no TMDb anchor`, await resolve(c, "Bonanza"), null);
  }

  out("\n2. /api/reksnap typed (the Wine bar): Bonanza is the wine");
  ai.classify = { specific: true, name: "Bonanza" };
  ai.reads = [wineRead("Bonanza Cabernet Sauvignon")];
  ai.calls = [];
  logs = [];
  const w1 = await typedWine("Bonanza");
  check("Wine + 'Bonanza' → the Bonanza wine", [w1.json?.detected_item?.name, w1.json?.detected_item?.category], ["Bonanza Cabernet Sauvignon", "wine"]);
  check("…its reks are wines", (w1.json?.results?.similar ?? []).every((r) => /wine/.test(r.category)), true);
  check("…no media block", w1.json?.media ?? null, null);
  check("…one read", visionCalls(), 1);
  const gen = ai.calls.find(isRead);
  check("the read is told it's a wine on the Wine bar", /a wine's name on the Wine bar/.test(String(gen?.messages?.[1]?.content)), true);
  check("…and that every rek is a wine", /every rek is a wine/.test(String(gen?.messages?.[1]?.content)), true);
  check("TMDb is never asked on the Wine bar", tmdb.calls.length, 0);

  out("\n3. A read that lands on the TV show never ships");
  ai.reads = [tvRead, wineRead("Bonanza Cabernet Sauvignon")];
  ai.calls = [];
  logs = [];
  const w2 = await typedWine("Bonanza");
  check("TV read, then wine → retried, the wine ships", [w2.json?.detected_item?.name, w2.json?.detected_item?.category], ["Bonanza Cabernet Sauvignon", "wine"]);
  check("…two reads", visionCalls(), 2);
  check("…the miss is logged at error level", logged("[typed-anchor] wine bar read landed outside wine"), true);
  ai.reads = [tvRead];
  ai.calls = [];
  logs = [];
  const w3 = await typedWine("Bonanza");
  check("TV read twice → anchor null (the wine search runs instead)", w3.json, { anchor: null, fallback: "not_wine" });
  check("…never the show, never Gunsmoke", JSON.stringify(w3.json).includes("Gunsmoke"), false);
  check("…stops after two reads", visionCalls(), 2);

  out("\n4. The client: the selected category wins");
  const page = fs.readFileSync(path.join(ROOT, "app/page.tsx"), "utf8");
  const fn = page.slice(page.indexOf("async function resolveTypedAnchor"), page.indexOf("async function fetchTypedReks"));
  const anchorAt = fn.indexOf('fetch("/api/anchor"');
  const mediaGate = fn.indexOf('if (category === "Movies" || category === "TV Shows")');
  const wineGate = fn.indexOf('if (category === "Wine")');
  check("the TMDb resolve call sits only inside the Movies/TV branch", mediaGate >= 0 && anchorAt > mediaGate && anchorAt < wineGate && fn.split('fetch("/api/anchor"').length === 2, true);
  check("the Wine bar calls only the wine path", fn.slice(wineGate).includes('fetch("/api/reksnap"') && !fn.slice(wineGate).includes("/api/anchor"), true);
  check("the Wine bar refuses a non-wine anchor", /data\.media \|\| !isWineCategory\(data\.detected_item\.category\)/.test(fn), true);
  check("Books never resolves a typed anchor (falls to the books search)", [...fn.matchAll(/if \(category === "([^"]+)"/g)].map((m) => m[1]), ["Movies", "Wine"]);

  out(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
