/* eslint-disable no-console */
//
// scripts/validate-s36.cjs — Session 3.6's counted validation.
//
// Compiles the REAL server code from source (the cap helper, /api/openai,
// /api/recipe, /api/reksnap, and the client's failure reader) and drives
// it with an in-memory stand-in for the Supabase service-role client and a
// stub OpenAI. No keys, no network. What it cannot prove, and does not
// pretend to: Postgres grants/RLS (BLOCK 4 of docs/sql/s3.6-api-usage.sql)
// or real request volume (the preview run in the session log).
//
//   node scripts/validate-s36.cjs
//
const { execFileSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CACHE = path.join(ROOT, "node_modules", ".cache");
fs.mkdirSync(CACHE, { recursive: true });
const OUT = fs.mkdtempSync(path.join(CACHE, "s36-validate-"));

console.log("Compiling the S3.6 server code from source…");
execFileSync(
  "npx",
  [
    "tsc",
    "src/lib/apiUsage.ts",
    "src/lib/clientId.ts",
    "src/lib/aiServiceError.ts",
    "app/api/openai/route.ts",
    "app/api/recipe/route.ts",
    "app/api/reksnap/route.ts",
    "--outDir", OUT,
    "--rootDir", ".",
    "--module", "commonjs",
    "--target", "es2020",
    "--moduleResolution", "node",
    "--esModuleInterop",
    "--skipLibCheck",
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
  out(`  ${ok ? "PASS" : "FAIL"}  ${label}  (got ${a}, expected ${e})`);
};

let logs = [];
for (const level of ["warn", "info", "log", "error"]) {
  const orig = console[level].bind(console);
  console[level] = (...args) => {
    logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    if (process.env.S36_VERBOSE) orig(...args);
  };
}
const logged = (needle) => logs.some((l) => l.includes(needle));

/* ------------------------------------------------------------------
   In-memory Supabase stand-in (the shapes apiUsage + reksnap use).
------------------------------------------------------------------- */
const db = { api_usage: [] };
let failOn = null; // { op: "select"|"insert", error }
const TABLE_MISSING = {
  code: "PGRST205",
  message: "Could not find the table 'public.api_usage' in the schema cache",
};
function query(table) {
  const st = { op: "select", filters: [], head: false, payload: null };
  const rows = () => (db[table] ||= []);
  const matches = (r) =>
    st.filters.every(([kind, col, val]) => {
      const v = r[col];
      if (kind === "eq") return v === val;
      if (kind === "gt") return v != null && v > val;
      if (kind === "gte") return v != null && v >= val;
      return true;
    });
  const exec = () => {
    if (failOn && failOn.op === st.op && table === "api_usage") {
      const error = failOn.error;
      failOn = null;
      return { data: null, error, count: null };
    }
    if (st.op === "insert") {
      rows().push({ id: rows().length + 1, created_at: new Date().toISOString(), ...st.payload });
      return { data: null, error: null };
    }
    const found = rows().filter(matches);
    if (st.head) return { data: null, error: null, count: found.length };
    return { data: found.map((r) => ({ ...r })), error: null, count: found.length };
  };
  const b = {
    select(_c, opts) { if (st.op !== "insert") { st.op = "select"; if (opts?.head) st.head = true; } return b; },
    insert(obj) { st.op = "insert"; st.payload = obj; return b; },
    eq(c, v) { st.filters.push(["eq", c, v]); return b; },
    gt(c, v) { st.filters.push(["gt", c, v]); return b; },
    gte(c, v) { st.filters.push(["gte", c, v]); return b; },
    in() { return b; }, order() { return b; }, limit() { return b; }, not() { return b; }, is() { return b; },
    maybeSingle() { return Promise.resolve({ data: null, error: null }); },
    then(res, rej) { return Promise.resolve(exec()).then(res, rej); },
  };
  return b;
}
const fakeSupabase = { from: (t) => query(t) };

/* Stub OpenAI: counts calls; answers any chat with an empty JSON list. */
const ai = { calls: 0 };

// S3.0: the vision call is streamed. A `stream: true` request gets the same
// reply as chunks (the real SDK's shape), split in three so the early
// detected_item read is exercised, then a usage-only chunk.
const asStream = (reply) => {
  const content = reply?.choices?.[0]?.message?.content ?? "";
  const n = Math.ceil(content.length / 3) || 1;
  const pieces = [content.slice(0, n), content.slice(n, 2 * n), content.slice(2 * n)];
  return (async function* () {
    for (const p of pieces) yield { choices: [{ delta: { content: p } }] };
    yield { choices: [], usage: reply?.usage ?? null };
  })();
};
class FakeOpenAI {
  constructor() {
    this.chat = { completions: { create: async (req) => { ai.calls++; const reply = { choices: [{ message: { content: JSON.stringify({ items: [] }) } }] }; return req?.stream ? asStream(reply) : reply; } } };
    this.moderations = { create: async () => ({ results: [{ flagged: false }] }) };
  }
}

const seed = (file, exports) => {
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
seed(require.resolve("openai"), { __esModule: true, default: FakeOpenAI });
const SUPA = path.join(OUT, "src/lib/supabaseServer.js");
const fresh = (rel) => {
  for (const k of Object.keys(require.cache)) if (k.startsWith(OUT)) delete require.cache[k];
  seed(SUPA, { supabaseServer: fakeSupabase });
  return require(path.join(OUT, rel));
};
delete process.env.TMDB_API_KEY;
delete process.env.MINT_SIGNING_SECRET; // tokens off: the cap is the subject here
process.env.OPENAI_API_KEY = "stub";

const post = async (routeRel, body) => {
  const { POST } = fresh(routeRel);
  const res = await POST(new Request("http://local/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
};
const fill = (clientId, route, n, ageMs = 0) => {
  const at = new Date(Date.now() - ageMs).toISOString();
  for (let i = 0; i < n; i++) db.api_usage.push({ id: db.api_usage.length + 1, client_id: clientId, route, created_at: at });
};
const countRows = (clientId, route) => db.api_usage.filter((r) => r.client_id === clientId && r.route === route).length;
const reset = () => { db.api_usage = []; logs = []; ai.calls = 0; failOn = null; };
const C = "anon_s36_harness_client";
const HOUR = 3600 * 1000;

(async () => {
  out("\n§1 The helper: caps, windows, keys");
  {
    // Unconfigured first (the store promise is memoized per module load).
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    reset();
    const u = fresh("src/lib/apiUsage.js");
    check("no Supabase env → allowed", await u.capGate(C, "openai"), null);
    check("…and named", logged("[api-cap] uncapped — supabase unconfigured"), true);
  }
  process.env.SUPABASE_URL = "https://stub.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "stub";
  const U = () => fresh("src/lib/apiUsage.js");
  check("caps are the decided numbers", U().CAPS_PER_DAY, { "reksnap-vision": 60, "reksnap-text": 300, openai: 300, recipe: 60 });
  for (const bad of [undefined, "", "short", 42, "x".repeat(65)]) {
    reset();
    const r = await U().capGate(bad, "openai");
    check(`client id ${JSON.stringify(bad)} → 400`, r && r.status, 400);
  }
  check("missing id is named", logged("[api-cap] refused — missing client id"), true);
  check("missing id writes no row", db.api_usage.length, 0);

  reset();
  check("first call under cap → allowed", await U().capGate(C, "openai"), null);
  check("…and counted under its route", countRows(C, "openai"), 1);

  reset(); fill(C, "openai", 299);
  check("the 300th call → allowed", await U().capGate(C, "openai"), null);
  const over = await U().capGate(C, "openai");
  check("the 301st call → 429", over && over.status, 429);
  const overBody = await over.json();
  check("429 body has error, NO reason", [typeof overBody.error, "reason" in overBody], ["string", false]);
  check("over-cap is named", logged("[api-cap] refused — over daily cap"), true);
  check("a refused call is not counted", countRows(C, "openai"), 300);

  reset(); fill(C, "openai", 300, 25 * HOUR);
  check("rows older than 24h do not count", await U().capGate(C, "openai"), null);
  reset(); fill(C, "recipe", 60);
  check("another route's rows do not count", await U().capGate(C, "openai"), null);
  check("recipe at 60 → 429", (await U().capGate(C, "recipe")).status, 429);
  reset(); fill("anon_someone_else_entirely", "openai", 300);
  check("another client's rows do not count", await U().capGate(C, "openai"), null);
  reset(); fill(C, "reksnap-vision", 60);
  check("vision cap 60 → 429", (await U().capGate(C, "reksnap-vision")).status, 429);

  out("\n§2 Fails OPEN, never silently (§2.4)");
  reset(); failOn = { op: "select", error: TABLE_MISSING };
  check("table missing → allowed", await U().capGate(C, "openai"), null);
  check("…named migration_pending", logged("migration_pending"), true);
  reset(); failOn = { op: "select", error: { code: "57014", message: "statement timeout" } };
  check("count error → allowed", await U().capGate(C, "openai"), null);
  check("…named db_error", logged("db_error"), true);
  reset(); failOn = { op: "insert", error: { code: "23514", message: "check violation" } };
  check("insert error → allowed", await U().capGate(C, "openai"), null);
  check("…named not-counted", logged("[api-cap] request not counted"), true);
  reset();
  {
    const throwing = { from: () => { throw new Error("socket hang up"); } };
    for (const k of Object.keys(require.cache)) if (k.startsWith(OUT)) delete require.cache[k];
    seed(SUPA, { supabaseServer: throwing });
    const u = require(path.join(OUT, "src/lib/apiUsage.js"));
    check("a THROWN counter failure → allowed", await u.capGate(C, "openai"), null);
    check("…named", logged("[api-cap] uncapped — counter threw"), true);
  }

  out("\n§3 /api/openai");
  reset();
  let r = await post("app/api/openai/route.js", { prompt: "hi" });
  check("no clientId → 400", r.status, 400);
  check("…and OpenAI never called", ai.calls, 0);
  reset();
  r = await post("app/api/openai/route.js", { prompt: "hi", clientId: C });
  check("with clientId → OpenAI called", ai.calls, 1);
  check("…and counted", countRows(C, "openai"), 1);
  reset(); fill(C, "openai", 300);
  r = await post("app/api/openai/route.js", { prompt: "hi", clientId: C });
  check("over cap → 429, OpenAI never called", [r.status, ai.calls], [429, 0]);

  out("\n§4 /api/recipe");
  reset();
  r = await post("app/api/recipe/route.js", { dish: "omelette" });
  check("no clientId → 400, OpenAI never called", [r.status, ai.calls], [400, 0]);
  reset();
  r = await post("app/api/recipe/route.js", { clientId: C });
  check("missing dish still answers its own 400 first, uncounted", [r.status, countRows(C, "recipe")], [400, 0]);
  reset(); fill(C, "recipe", 60);
  r = await post("app/api/recipe/route.js", { dish: "omelette", clientId: C });
  check("over cap → 429, OpenAI never called", [r.status, ai.calls], [429, 0]);
  reset();
  r = await post("app/api/recipe/route.js", { dish: "omelette", clientId: C });
  check("under cap → OpenAI called, counted", [ai.calls, countRows(C, "recipe")], [1, 1]);

  out("\n§5 /api/reksnap — vision and the three text branches");
  const item = { name: "Test Wine", category: "wine", description: "Dry." };
  const branches = {
    backfill: (cid) => ({ backfill: { detectedItem: item, mode: "similar", excludeNames: [], rejectedNames: [], clientId: cid } }),
    anchorDetail: (cid) => ({ anchorDetail: { name: item.name, category: item.category, shortDescription: item.description, clientId: cid } }),
    chain: (cid) => ({ chain: { anchor: item, mode: "similar", clientId: cid } }),
  };
  for (const [name, make] of Object.entries(branches)) {
    reset();
    r = await post("app/api/reksnap/route.js", make(undefined));
    check(`${name}: no clientId → 400, OpenAI never called`, [r.status, ai.calls], [400, 0]);
    reset(); fill(C, "reksnap-text", 300);
    r = await post("app/api/reksnap/route.js", make(C));
    check(`${name}: shared text cap at 300 → 429`, [r.status, ai.calls], [429, 0]);
    reset();
    await post("app/api/reksnap/route.js", make(C));
    check(`${name}: counted under reksnap-text`, countRows(C, "reksnap-text"), 1);
  }
  reset();
  r = await post("app/api/reksnap/route.js", { image: "data:image/jpeg;base64,AAAA" });
  check("vision: no clientId → 400, OpenAI never called", [r.status, ai.calls], [400, 0]);
  reset();
  r = await post("app/api/reksnap/route.js", { clientId: C });
  check("vision: missing image answers its own 400, uncounted", [r.status, countRows(C, "reksnap-vision")], [400, 0]);
  reset(); fill(C, "reksnap-vision", 60);
  r = await post("app/api/reksnap/route.js", { image: "data:image/jpeg;base64,AAAA", clientId: C });
  check("vision: over cap → 429, OpenAI never called", [r.status, ai.calls], [429, 0]);
  reset(); fill(C, "reksnap-text", 300);
  await post("app/api/reksnap/route.js", { image: "data:image/jpeg;base64,AAAA", clientId: C });
  check("vision is NOT capped by text-branch usage", [countRows(C, "reksnap-vision"), ai.calls], [1, 1]);

  out("\n§6 The client keeps its own voice, and sends its id");
  const { readServiceFailure } = fresh("src/lib/aiServiceError.js");
  const capRes = new Response(JSON.stringify({ error: "Daily limit reached" }), { status: 429 });
  check("readServiceFailure ignores the cap's 429 (existing voice stays)", await readServiceFailure(capRes), null);
  globalThis.window = {};
  const store = {};
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
  const { getAnonymousClientId } = fresh("src/lib/clientId.js");
  const id1 = getAnonymousClientId();
  check("clientId.ts mints an anon_ id the routes accept", /^anon_/.test(id1) && id1.length >= 8 && id1.length <= 64, true);
  check("…and it is stable", getAnonymousClientId() === id1, true);
  check("…under the same localStorage key userPrefs always used", Object.keys(store), ["rekomendr.client_id"]);
  delete globalThis.window;
  const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
  check("engine's /api/openai body sends clientId", /fetch\("\/api\/openai"[\s\S]{0,400}clientId: getAnonymousClientId\(\)/.test(src("src/engine/rekomendrEngine.ts")), true);
  check("RecipeModal's /api/recipe body sends clientId", /fetch\("\/api\/recipe"[\s\S]{0,300}clientId: getAnonymousClientId\(\)/.test(src("src/components/RecipeModal.tsx")), true);
  check("engine does not import userPrefs (no Supabase client in the engine)", /from "\.\.\/lib\/userPrefs"/.test(src("src/engine/rekomendrEngine.ts")), false);

  out(`\n${pass} passed, ${fail} failed.`);
  fs.rmSync(OUT, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error = (...a) => process.stderr.write(a.join(" ") + "\n");
  process.stderr.write(`HARNESS ERROR ${e && e.stack}\n`);
  process.exit(1);
});
