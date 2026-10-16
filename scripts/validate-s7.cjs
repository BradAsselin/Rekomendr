/* eslint-disable no-console */
//
// scripts/validate-s7.cjs — S7: Share on search-lane cards (Brad's call B).
//   Movies and TV only; the card carries TMDb's OFFICIAL synopsis, never
//   the rek's browser-parsed line. The server signs only what TMDb
//   returned for an exact title match (year ±1); books and wine get none.
//
// Compiles the REAL /api/anchor, /api/save, /api/share and shareSnapshot
// from source. Stubs TMDb (fetch), OpenAI and the Supabase client. No keys,
// no network.
//
//   node scripts/validate-s7.cjs
//
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const CACHE = path.join(ROOT, "node_modules", ".cache");
fs.mkdirSync(CACHE, { recursive: true });
const OUT = fs.mkdtempSync(path.join(CACHE, "s7-validate-"));

console.log("Compiling /api/anchor, /api/save, /api/share, shareSnapshot from source…");
execFileSync(
  "npx",
  [
    "tsc",
    "app/api/anchor/route.ts",
    "app/api/save/route.ts",
    "app/api/share/route.ts",
    "src/lib/shareSnapshot.ts",
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

/* ---------------- TMDb stub ---------------- */
const SYNOPSIS = "Tom Kirkman, a low-level cabinet member, is suddenly appointed President after a catastrophic attack.";
const SEARCH = {
  tv: {
    "designated survivor": [{ id: 65494, name: "Designated Survivor", original_name: "Designated Survivor", first_air_date: "2016-09-21", vote_count: 2000, overview: SYNOPSIS }],
    "no synopsis show": [{ id: 1, name: "No Synopsis Show", original_name: "No Synopsis Show", first_air_date: "2019-01-01", vote_count: 50, overview: "" }],
  },
  movie: {
    heat: [{ id: 949, title: "Heat", original_title: "Heat", release_date: "1995-12-15", vote_count: 7000, overview: "A group of high-end professional thieves start to feel the heat." }],
  },
};
const tmdb = { down: false };
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  if (tmdb.down) throw new Error("ECONNRESET");
  const m = u.pathname.match(/^\/3\/search\/(movie|tv)$/);
  if (m) {
    const q = (u.searchParams.get("query") || "").toLowerCase().trim();
    return new Response(JSON.stringify({ results: SEARCH[m[1]][q] ?? [] }), { status: 200 });
  }
  return new Response("{}", { status: 404 });
};

/* ---------------- OpenAI moderation stub ---------------- */
class FakeOpenAI {
  constructor() {
    this.moderations = { create: async () => ({ results: [{ flagged: false }] }) };
    this.chat = { completions: { create: async () => { throw new Error("no generation in S7"); } } };
  }
}
const seed = (file, exports) => {
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
seed(require.resolve("openai"), { __esModule: true, default: FakeOpenAI });

/* ---------------- Supabase stub: a tiny in-memory table engine ---------------- */
const db = { anchor_snapshots: [], client_profiles: [], card_events: [], api_usage: [] };
function query(table) {
  const st = { op: "select", filters: [], order: null, limit: null, head: false, payload: null };
  const rowsOf = () => (db[table] ??= []);
  const match = (r) => st.filters.every((f) => f(r));
  const run = () => {
    if (st.op === "insert") {
      const items = (Array.isArray(st.payload) ? st.payload : [st.payload]).map((p) => ({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        shared_at: null,
        revoked_at: null,
        sender_name: null,
        ...p,
      }));
      rowsOf().push(...items);
      return { data: items, error: null };
    }
    if (st.op === "update") {
      const hit = rowsOf().filter(match);
      hit.forEach((r) => Object.assign(r, st.payload));
      return { data: hit, error: null };
    }
    let rows = rowsOf().filter(match);
    if (st.order) {
      const { col, asc } = st.order;
      rows = rows.slice().sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc ? 1 : -1));
    }
    const count = rows.length;
    if (st.limit != null) rows = rows.slice(0, st.limit);
    return { data: st.head ? null : rows.map((r) => ({ ...r })), error: null, count };
  };
  const b = {
    select(_cols, opts) { if (opts?.head) st.head = true; return b; },
    insert(p) { st.op = "insert"; st.payload = p; return b; },
    update(p) { st.op = "update"; st.payload = p; return b; },
    eq(c, v) { st.filters.push((r) => r[c] === v); return b; },
    gte(c, v) { st.filters.push((r) => r[c] != null && Date.parse(r[c]) >= Date.parse(v)); return b; },
    gt(c, v) { st.filters.push((r) => r[c] != null && Date.parse(r[c]) > Date.parse(v)); return b; },
    is(c, v) { st.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return b; },
    order(c, o) { st.order = { col: c, asc: o?.ascending !== false }; return b; },
    limit(n) { st.limit = n; return b; },
    single() { const r = run(); return Promise.resolve({ ...r, data: r.data?.[0] ?? null }); },
    maybeSingle() { const r = run(); return Promise.resolve({ ...r, data: r.data?.[0] ?? null }); },
    then(res, rej) { return Promise.resolve(run()).then(res, rej); },
  };
  return b;
}
seed(path.join(OUT, "src/lib/supabaseServer.js"), { supabaseServer: { from: (t) => query(t) } });

process.env.TMDB_API_KEY = "v3key";
process.env.OPENAI_API_KEY = "stub";
process.env.SUPABASE_URL = "http://stub.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "stub";
process.env.MINT_SIGNING_SECRET = "s7-secret";

const anchorRoute = require(path.join(OUT, "app/api/anchor/route.js"));
const saveRoute = require(path.join(OUT, "app/api/save/route.js"));
const shareRoute = require(path.join(OUT, "app/api/share/route.js"));
const { tmdbCardSnapshot, flipShare } = require(path.join(OUT, "src/lib/shareSnapshot.js"));

const ROUTES = { "/api/anchor": anchorRoute, "/api/save": saveRoute, "/api/share": shareRoute };
const post = async (url, body) => {
  const res = await ROUTES[url].POST(
    new Request("http://local/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  );
  return { status: res.status, json: await res.json().catch(() => null) };
};
const postJson = async (url, body) => (await post(url, body)).json;
const ME = "anon_s7_client_00001";
const OTHER = "anon_s7_other_000001";
const cardReq = (over = {}) =>
  post("/api/anchor", { action: "card", title: "Designated Survivor", year: 2016, category: "TV Shows", clientId: ME, ...over });

(async () => {
  out("\n1. The card action signs TMDb's own title + synopsis");
  const r1 = await cardReq();
  check("exact title → ok, TMDb's synopsis, tv category", [r1.json?.ok, r1.json?.item?.short, r1.json?.item?.category, !!r1.json?.token], [true, SYNOPSIS, "tv", true]);
  const r1b = await cardReq({ title: "designated survivor", year: 2017 });
  check("case-insensitive, year ±1 → TMDb's canonical title", [r1b.json?.ok, r1b.json?.item?.name], [true, "Designated Survivor"]);
  check("a lane that named the other kind still resolves (Heat from the TV lane)", (await cardReq({ title: "Heat", year: 1995 })).json?.item?.category, "movies");

  out("\n2. Only real titles, only movies/TV");
  check("not an exact title → not_found", (await cardReq({ title: "Designated Survivors of Mars" })).json?.reason, "not_found");
  check("year more than 1 off → not_found", (await cardReq({ year: 2010 })).json?.reason, "not_found");
  check("TMDb has no synopsis → no card", (await cardReq({ title: "No Synopsis Show", year: 2019 })).json?.reason, "no_synopsis");
  check("Wine lane → 400 (no Share yet)", (await cardReq({ category: "Wine" })).status, 400);
  check("Books lane → 400 (no Share yet)", (await cardReq({ category: "Books" })).status, 400);
  check("no client → 400", (await cardReq({ clientId: "" })).status, 400);
  tmdb.down = true;
  check("TMDb down → no card, no crash", (await cardReq()).json?.ok ?? false, false);
  tmdb.down = false;

  out("\n3. Search-lane Share end to end");
  db.anchor_snapshots.length = 0;
  const s = await tmdbCardSnapshot({ title: "Designated Survivor", year: 2016, category: "TV Shows" }, ME, postJson);
  check("mints a row carrying TMDb's synopsis", [!!s.id, db.anchor_snapshots[0]?.item_name, db.anchor_snapshots[0]?.short_description, db.anchor_snapshots[0]?.item_category], [true, "Designated Survivor", SYNOPSIS, "tv"]);
  check("…and flips public", (await flipShare(s.id, ME, postJson)).ok, true);
  const again = await tmdbCardSnapshot({ title: "Designated Survivor", year: 2016, category: "TV Shows" }, ME, postJson);
  check("sharing it again reuses the row (already saved = success)", [again.id === s.id, db.anchor_snapshots.length], [true, 1]);
  const miss = await tmdbCardSnapshot({ title: "Made Up Title", year: 2020, category: "Movies" }, ME, postJson);
  check("an unresolvable title refuses plainly (no row)", [miss.id, miss.reason, db.anchor_snapshots.length], [null, "not_found", 1]);

  out("\n4. Integrity (Ledger #19)");
  const tok = (await cardReq()).json;
  const forged = await postJson("/api/save", { clientId: ME, payload: { name: tok.item.name, category: "tv", short: "The rek's own line, written in the browser.", long: null, mode: "similar" }, token: tok.token });
  check("browser text under TMDb's token → token_invalid", forged?.reason, "token_invalid");
  const stolen = await postJson("/api/save", { clientId: OTHER, payload: { name: tok.item.name, category: "tv", short: tok.item.short, long: null, mode: "similar" }, token: tok.token });
  check("another client can't use my token", stolen?.reason, "token_invalid");
  check("card requests are counted against the text cap", db.api_usage.length > 0, true);

  out("\n5. Client wiring (source)");
  const r4 = fs.readFileSync(path.join(ROOT, "src/components/ResultsV4.tsx"), "utf8");
  check("frontier AND trail search cards carry Share", (r4.match(/shareSlot=\{shareFor\(rek\)\}/g) || []).length, 2);
  check("Movies and TV Shows lanes only", r4.includes('category === "Movies" || category === "TV Shows" ? category : null'), true);
  check("the card is minted via TMDb, never from rek.short", [r4.includes("tmdbCardSnapshot("), /getSnapshot=[\s\S]{0,200}rek\.short/.test(r4)], [true, false]);
  const route = fs.readFileSync(path.join(ROOT, "app/api/anchor/route.ts"), "utf8");
  check("the server signs TMDb's overview, nothing from the request body", /signAnchor\(\{ name: hit\.title, category, short, long: null, clientId \}\)/.test(route), true);

  out(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  process.stdout.write(`HARNESS CRASH: ${err?.stack ?? err}\n`);
  process.exit(1);
});
