/* eslint-disable no-console */
//
// scripts/validate-s23.cjs — /api/health validates the TMDb key for real.
//
// Compiles the REAL health route and tmdbVerify from source, stubs TMDb's
// HTTP (globalThis.fetch) and the Supabase service-role client. No keys, no
// network. Proves the probe: auth shape per key kind, ok / rejected /
// unreachable / disabled, the cache window (10 min; 1 min when
// unreachable), one request for concurrent probes, a re-probe on key
// change, and that the DB half of health is unchanged.
//
//   node scripts/validate-s23.cjs
//
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CACHE = path.join(ROOT, "node_modules", ".cache");
fs.mkdirSync(CACHE, { recursive: true });
const OUT = fs.mkdtempSync(path.join(CACHE, "s23-validate-"));

console.log("Compiling /api/health + tmdbVerify from source…");
execFileSync(
  "npx",
  [
    "tsc",
    "app/api/health/route.ts",
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
  out(`  ${ok ? "PASS" : "FAIL"}  ${label}  (got ${a}, expected ${e})`);
};

let logs = [];
for (const level of ["warn", "info", "log", "error"]) {
  const orig = console[level].bind(console);
  console[level] = (...args) => {
    logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    if (process.env.S23_VERBOSE) orig(...args);
  };
}
const logged = (needle) => logs.some((l) => l.includes(needle));

/* TMDb stub: records every call, answers per `tmdb.mode`. */
const tmdb = { calls: [], mode: 200, delayMs: 0 };
globalThis.fetch = async (url, init = {}) => {
  tmdb.calls.push({ url: String(url), headers: init.headers || {}, cache: init.cache });
  if (tmdb.delayMs) await new Promise((r) => setTimeout(r, tmdb.delayMs));
  if (tmdb.mode === "throw") throw Object.assign(new Error("connect ECONNREFUSED"), { name: "TypeError" });
  return new Response(JSON.stringify({ success: tmdb.mode === 200 }), { status: tmdb.mode });
};

/* Supabase stub: one read, optionally erroring. */
const db = { error: null };
const fakeSupabase = {
  from: () => ({ select: () => ({ limit: async () => ({ data: [], error: db.error }) }) }),
};

/* Controllable clock (the cache windows). */
const realNow = Date.now;
let offsetMs = 0;
Date.now = () => realNow() + offsetMs;

const seed = (file, exports) => {
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
const SUPA = path.join(OUT, "src/lib/supabaseServer.js");
const fresh = () => {
  for (const k of Object.keys(require.cache)) if (k.startsWith(OUT)) delete require.cache[k];
  seed(SUPA, { supabaseServer: fakeSupabase });
  return require(path.join(OUT, "app/api/health/route.js"));
};
process.env.SUPABASE_URL = "https://abcdefghijklmnopqrst.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "stub";
process.env.MINT_SIGNING_SECRET = "stub";

const V4 = "eyJhbGciOiJIUzI1NiJ9.stub.sig";
const V3 = "0123456789abcdef0123456789abcdef";
const health = async (mod) => {
  const res = await mod.GET();
  return { status: res.status, json: await res.json() };
};
const reset = (mode = 200) => { tmdb.calls = []; tmdb.mode = mode; tmdb.delayMs = 0; logs = []; offsetMs = 0; db.error = null; };

(async () => {
  out("\n1. No key: disabled, TMDb never called");
  reset();
  delete process.env.TMDB_API_KEY;
  let mod = fresh();
  let r = await health(mod);
  check("tmdb disabled", r.json.tmdb, "disabled");
  check("no TMDb call", tmdb.calls.length, 0);
  check("health still 200 on the DB", r.status, 200);

  out("\n2. v4 key accepted: ok, Bearer auth, the validation endpoint, uncached fetch");
  reset(200);
  process.env.TMDB_API_KEY = V4;
  mod = fresh();
  r = await health(mod);
  check("tmdb ok", r.json.tmdb, "ok");
  check("one call", tmdb.calls.length, 1);
  check("endpoint /3/authentication, no api_key in URL", tmdb.calls[0].url, "https://api.themoviedb.org/3/authentication");
  check("Bearer header", tmdb.calls[0].headers.Authorization, `Bearer ${V4}`);
  check("fetch is no-store (Next data cache bypassed)", tmdb.calls[0].cache, "no-store");
  check("no key text in any log", logs.some((l) => l.includes(V4)), false);

  out("\n3. Cached for 10 minutes, re-probed after");
  offsetMs = 9 * 60 * 1000;
  await health(mod);
  check("9 min later: still one call", tmdb.calls.length, 1);
  offsetMs = 11 * 60 * 1000;
  await health(mod);
  check("11 min later: re-probed", tmdb.calls.length, 2);

  out("\n4. v3 key: api_key query, no auth header");
  reset(200);
  process.env.TMDB_API_KEY = V3;
  mod = fresh();
  r = await health(mod);
  check("tmdb ok", r.json.tmdb, "ok");
  check("api_key in query", tmdb.calls[0].url, `https://api.themoviedb.org/3/authentication?api_key=${V3}`);
  check("no Authorization header", tmdb.calls[0].headers.Authorization, undefined);

  out("\n5. Rejected key (the field case: 401 while health said ok)");
  reset(401);
  process.env.TMDB_API_KEY = V4;
  mod = fresh();
  r = await health(mod);
  check("tmdb rejected", r.json.tmdb, "rejected");
  check("tripwire names it", logged('[health] tmdb key probe {"state":"rejected","status":401}'), true);
  check("DB contract unchanged: 200", r.status, 200);
  check("DB contract unchanged: ok true", r.json.ok, true);
  offsetMs = 5 * 60 * 1000;
  await health(mod);
  check("rejected is cached 10 min too", tmdb.calls.length, 1);
  reset(403);
  mod = fresh();
  r = await health(mod);
  check("403 also rejected", r.json.tmdb, "rejected");

  out("\n6. TMDb unreachable: its own state, re-asked after 1 minute");
  reset("throw");
  mod = fresh();
  r = await health(mod);
  check("network error → unreachable", r.json.tmdb, "unreachable");
  check("tripwire names it", logged('"state":"unreachable"'), true);
  offsetMs = 30 * 1000;
  await health(mod);
  check("30 s later: cached", tmdb.calls.length, 1);
  tmdb.mode = 200;
  offsetMs = 61 * 1000;
  r = await health(mod);
  check("61 s later: re-probed and recovered", [tmdb.calls.length, r.json.tmdb], [2, "ok"]);
  reset(500);
  mod = fresh();
  r = await health(mod);
  check("TMDb 500 → unreachable, not rejected", r.json.tmdb, "unreachable");

  out("\n7. Concurrent probes share one request");
  reset(200);
  tmdb.delayMs = 50;
  mod = fresh();
  const many = await Promise.all([1, 2, 3, 4, 5].map(() => health(mod)));
  check("five concurrent → one TMDb call", tmdb.calls.length, 1);
  check("all five ok", many.map((m) => m.json.tmdb), ["ok", "ok", "ok", "ok", "ok"]);

  out("\n8. Key changes: re-probed at once, not after the window");
  reset(200);
  process.env.TMDB_API_KEY = V4;
  mod = fresh();
  await health(mod);
  tmdb.mode = 401;
  process.env.TMDB_API_KEY = V4 + "x";
  r = await health(mod);
  check("new key probed immediately", [tmdb.calls.length, r.json.tmdb], [2, "rejected"]);

  out("\n9. DB error still reports TMDb's state");
  reset(200);
  process.env.TMDB_API_KEY = V4;
  db.error = { code: "XX000", message: "boom" };
  mod = fresh();
  r = await health(mod);
  check("503 on the DB error", r.status, 503);
  check("tmdb still reported", r.json.tmdb, "ok");

  out("\n10. Attribution notice in the root layout (source)");
  const layout = fs.readFileSync(path.join(ROOT, "app/layout.tsx"), "utf8");
  check("exact TMDb notice", layout.includes("This product uses the TMDB API but is not endorsed or certified by TMDB."), true);
  // S24b — in the top bar's ⋯ menu, which RootLayout renders on every page.
  check("rendered on every page (the ⋯ menu in RootLayout's top bar)", /<MoreMenu attribution=\{<Attribution \/>\} \/>/.test(layout) && /<TopBar \/>\s*\{children\}/.test(layout), true);
  check("TMDb logo beside it (S2.4)", layout.includes('<img src="/tmdb-logo.svg" alt="TMDB"'), true);
  const svg = fs.readFileSync(path.join(ROOT, "public/tmdb-logo.svg"), "utf8");
  check("logo asset is TMDb's official mark (viewBox)", svg.includes('viewBox="0 0 273.42 35.52"'), true);
  check("logo asset carries no script or external reference", /<script|on\w+=|javascript:|href=/i.test(svg), false);

  out(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  process.stderr.write(`HARNESS CRASH: ${err && err.stack}\n`);
  process.exit(1);
});
