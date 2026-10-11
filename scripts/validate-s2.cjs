/* eslint-disable no-console */
//
// scripts/validate-s2.cjs — Session 2's counted validation.
//
// Compiles the REAL server code from source (the token lib, the snapshot
// libs, /api/save, /api/share, and /api/reksnap) and drives the route
// handlers directly with:
//   - an in-memory stand-in for the Supabase service-role client that
//     honours the query shapes these routes use (and can fail on demand
//     with the table-missing error the pre-migration world returns), and
//   - a stub OpenAI whose chat + moderation answers are scripted.
//
// It needs no keys and makes no network call. What it CANNOT do, and does
// not pretend to: prove Postgres grants/RLS (that is BLOCK 4 of the SQL,
// run by Brad), or prove iMessage unfurls the card (Brad's phone).
//
//   node scripts/validate-s2.cjs
//
const { execFileSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
// Compiled INSIDE the repo (node_modules/.cache, git-ignored with the rest
// of node_modules) so the output resolves the repo's own node_modules.
const CACHE = path.join(ROOT, "node_modules", ".cache");
fs.mkdirSync(CACHE, { recursive: true });
const OUT = fs.mkdtempSync(path.join(CACHE, "s2-validate-"));

console.log("Compiling the S2 server code from source…");
execFileSync(
  "npx",
  [
    "tsc",
    "app/api/save/route.ts",
    "app/api/share/route.ts",
    "app/api/reksnap/route.ts",
    "app/a/[id]/route.ts",
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

/* ------------------------------------------------------------------
   Assertions
------------------------------------------------------------------- */
// The harness's own output goes straight to stdout: console.* is captured
// below so the routes' tripwire lines can be asserted.
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

// Captured console.warn/info lines, so tripwires are ASSERTED, not assumed.
let logs = [];
for (const level of ["warn", "info", "log"]) {
  const orig = console[level].bind(console);
  console[level] = (...args) => {
    const line = args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ");
    logs.push(line);
    if (process.env.S2_VERBOSE) orig(...args);
  };
}
const logged = (needle) => logs.some((l) => l.includes(needle));

/* ------------------------------------------------------------------
   In-memory Supabase stand-in (only what these routes use).
------------------------------------------------------------------- */
const db = { anchor_snapshots: [] };
let failNext = null; // { code, message } → the next terminal call errors
const TABLE_MISSING = {
  code: "PGRST205",
  message: "Could not find the table 'public.anchor_snapshots' in the schema cache",
};

function query(table) {
  const st = { table, op: "select", filters: [], head: false, count: null, payload: null, limit: null, order: null, returning: false };
  const rows = () => (db[table] ||= []);
  const matches = (r) =>
    st.filters.every(([kind, col, val]) => {
      const v = r[col];
      if (kind === "eq") return v === val;
      if (kind === "gte") return v != null && v >= val;
      if (kind === "is") return val === null ? v == null : v === val;
      if (kind === "notnull") return v != null;
      return true;
    });
  const exec = (mode) => {
    if (failNext) {
      const error = failNext;
      failNext = null;
      return { data: null, error, count: null };
    }
    if (st.op === "insert") {
      const row = {
        id: crypto.randomUUID(),
        shared_at: null,
        revoked_at: null,
        long_description: null,
        created_at: new Date().toISOString(),
        ...st.payload,
      };
      rows().push(row);
      return { data: mode === "single" ? { id: row.id } : [row], error: null };
    }
    if (st.op === "update") {
      const hit = rows().filter(matches);
      hit.forEach((r) => Object.assign(r, st.payload));
      return { data: null, error: null, count: hit.length };
    }
    let found = rows().filter(matches);
    if (st.order) {
      const [col, asc] = st.order;
      found = [...found].sort((a, b) => (a[col] < b[col] ? -1 : 1) * (asc ? 1 : -1));
    }
    if (st.limit != null) found = found.slice(0, st.limit);
    if (st.head) return { data: null, error: null, count: found.length };
    if (mode === "maybeSingle") return { data: found[0] ? { ...found[0] } : null, error: null };
    if (mode === "single")
      return found[0]
        ? { data: { ...found[0] }, error: null }
        : { data: null, error: { code: "PGRST116", message: "no rows" } };
    return { data: found.map((r) => ({ ...r })), error: null, count: found.length };
  };
  const b = {
    select(_cols, opts) {
      if (st.op === "insert") st.returning = true;
      else {
        st.op = "select";
        if (opts?.head) st.head = true;
      }
      return b;
    },
    insert(obj) { st.op = "insert"; st.payload = obj; return b; },
    update(obj) { st.op = "update"; st.payload = obj; return b; },
    eq(c, v) { st.filters.push(["eq", c, v]); return b; },
    gte(c, v) { st.filters.push(["gte", c, v]); return b; },
    is(c, v) { st.filters.push(["is", c, v]); return b; },
    not(c, op, v) { if (op === "is" && v === null) st.filters.push(["notnull", c]); return b; },
    order(c, o) { st.order = [c, o?.ascending !== false]; return b; },
    limit(n) { st.limit = n; return b; },
    in() { return b; },
    maybeSingle() { return Promise.resolve(exec("maybeSingle")); },
    single() { return Promise.resolve(exec("single")); },
    then(res, rej) { return Promise.resolve(exec("many")).then(res, rej); },
  };
  return b;
}
const fakeSupabase = { from: (t) => query(t) };

/* ------------------------------------------------------------------
   Stub OpenAI — scripted per test.
------------------------------------------------------------------- */
const ai = {
  moderation: "clean", // "clean" | "flagged" | "throw"
  chatCalls: [],
  visionReply: null,
};
class FakeOpenAI {
  constructor() {
    this.chat = {
      completions: {
        create: async (req) => {
          ai.chatCalls.push(req);
          const system = req.messages?.[0]?.content ?? "";
          if (typeof system === "string" && system.includes("'Show details'")) {
            return { choices: [{ message: { content: JSON.stringify({ long: "A longer, deeper profile. Next to the neighbour it drinks rounder. It wins with green curry." }) } }] };
          }
          return { choices: [{ message: { content: JSON.stringify(ai.visionReply) } }] };
        },
      },
    };
    this.moderations = {
      create: async () => {
        if (ai.moderation === "throw") throw new Error("moderation unreachable");
        return { results: [{ flagged: ai.moderation === "flagged" }] };
      },
    };
  }
}

// Wire the stubs in BEFORE anything compiled is required.
const seed = (file, exports) => {
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
seed(require.resolve("openai"), { __esModule: true, default: FakeOpenAI });
seed(path.join(OUT, "src/lib/supabaseServer.js"), { supabaseServer: fakeSupabase });
process.env.SUPABASE_URL = "https://stub.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "stub";
delete process.env.TMDB_API_KEY; // the real-title guard stays out of this harness

const fresh = (rel) => {
  for (const k of Object.keys(require.cache)) if (k.startsWith(OUT)) delete require.cache[k];
  seed(path.join(OUT, "src/lib/supabaseServer.js"), { supabaseServer: fakeSupabase });
  return require(path.join(OUT, rel));
};

const post = async (routeRel, body) => {
  const { POST } = fresh(routeRel);
  const res = await POST(
    new Request("http://local/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
};

const SECRET = "s2-harness-secret-0123456789abcdef";
const CLIENT = "anon_harness_client_1";
const OTHER = "anon_harness_client_2";

(async () => {
  /* ============================================================== */
  out("\n=== 1. The prompt moved, it did not change ===\n");
  {
    const { ANCHOR_DETAIL_PROMPT } = require(path.join(OUT, "src/lib/anchorDetailPrompt.js"));
    const sha = crypto.createHash("sha256").update(ANCHOR_DETAIL_PROMPT, "utf8").digest("hex");
    // Recorded from app/api/reksnap/route.ts BEFORE the move (2026-09-23).
    check("sha256 equals the pre-move route constant", sha,
      "d500c0cf5cf51c047470b00d9d4446b18756d81091529f290898d0ad501de492");
    check("length equals the pre-move route constant", ANCHOR_DETAIL_PROMPT.length, 2873);
    const routeSrc = fs.readFileSync(path.join(ROOT, "app/api/reksnap/route.ts"), "utf8");
    check("the route no longer defines its own copy",
      /const ANCHOR_DETAIL_PROMPT\s*=/.test(routeSrc), false);
  }

  /* ============================================================== */
  out("\n=== 2. The token: HMAC over exactly what shipped ===\n");
  process.env.MINT_SIGNING_SECRET = SECRET;
  const tok = fresh("src/lib/mintToken.js");
  const A = { name: "Bonanza Cabernet", category: "wine", short: "Plush and dark-fruited.", long: null, clientId: CLIENT };
  {
    const t = tok.signAnchor(A);
    check("signs when a secret is set", !!t && typeof t.sig === "string", true);
    check("verifies the exact attestation", tok.verifyAnchor(A, t), true);
    check("category casing cannot break a pair", tok.verifyAnchor({ ...A, category: " Wine " }, t), true);
    check("a changed name fails", tok.verifyAnchor({ ...A, name: "Bonanza Cabernet!" }, t), false);
    check("a changed category fails (the health-wall bypass)", tok.verifyAnchor({ ...A, category: "vitamins" }, t), false);
    check("a changed short fails", tok.verifyAnchor({ ...A, short: "Arbitrary text." }, t), false);
    check("a long the token never covered fails", tok.verifyAnchor({ ...A, long: "Smuggled long." }, t), false);
    check("another client's token fails", tok.verifyAnchor({ ...A, clientId: OTHER }, t), false);
    const old = { ...t, issued_at: Date.now() - 49 * 60 * 60 * 1000 };
    check("a token past 48h fails", tok.verifyAnchor(A, old), false);
    check("garbage fails", tok.verifyAnchor(A, { sig: "AAAA", issued_at: Date.now() }), false);
    check("no token fails", tok.verifyAnchor(A, undefined), false);
  }
  {
    delete process.env.MINT_SIGNING_SECRET;
    const off = fresh("src/lib/mintToken.js");
    check("no secret: nothing is signed", off.signAnchor(A), null);
    check("no secret: tokens are off", off.tokensEnabled(), false);
    process.env.MINT_SIGNING_SECRET = SECRET;
  }

  /* ============================================================== */
  out("\n=== 3. /api/reksnap: signed at vision, verified on every text path ===\n");
  ai.visionReply = {
    detected_item: { name: "Bonanza Cabernet", description: "Plush and dark-fruited.", category: "Wine" },
    mode: "similar",
    results: {
      similar: [{ name: "Josh Cabernet", description: "Softer.", rank: 1 }],
      uses: [{ name: "Braised short ribs", description: "Pairs.", rank: 1 }],
      alternatives: [{ name: "Zinfandel", description: "Jammier.", rank: 1 }],
    },
  };
  const image = "data:image/png;base64,AAAA";
  let snap;
  {
    const r = await post("app/api/reksnap/route.js", { image, clientId: CLIENT });
    snap = r.json;
    check("vision answers 200", r.status, 200);
    check("vision response carries detected_item_token", !!snap?.detected_item_token?.sig, true);
    const t = fresh("src/lib/mintToken.js");
    check("…and it verifies over what the client received",
      t.verifyAnchor({ name: snap.detected_item.name, category: snap.detected_item.category,
        short: snap.detected_item.description, long: null, clientId: CLIENT }, snap.detected_item_token), true);
    const noClient = await post("app/api/reksnap/route.js", { image });
    check("no client id → no token", noClient.json?.detected_item_token, undefined);
  }
  const item = snap.detected_item;
  const token = snap.detected_item_token;
  let extended;
  {
    logs = [];
    const bare = await post("app/api/reksnap/route.js", {
      anchorDetail: { name: item.name, category: item.category, shortDescription: item.description },
    });
    check("anchorDetail with no token → 400", bare.status, 400);
    check("…named [mintToken] anchorDetail", logged("[mintToken] anchorDetail"), true);

    const good = await post("app/api/reksnap/route.js", {
      anchorDetail: { name: item.name, category: item.category, shortDescription: item.description, clientId: CLIENT, token },
    });
    check("anchorDetail with a valid token → 200", good.status, 200);
    extended = good.json?.token;
    const t = fresh("src/lib/mintToken.js");
    check("…returns an EXTENDED token that covers the long",
      t.verifyAnchor({ name: item.name, category: item.category, short: item.description, long: good.json?.long, clientId: CLIENT }, extended), true);

    const spoof = await post("app/api/reksnap/route.js", {
      anchorDetail: { name: item.name, category: "wine", shortDescription: "Rewritten short.", clientId: CLIENT, token },
    });
    check("anchorDetail with a doctored short → 400", spoof.status, 400);

    const chain = await post("app/api/reksnap/route.js", {
      chain: { kind: "reroll", mode: "similar", detectedItem: item, clientId: CLIENT },
    });
    check("chain with no anchorToken → 400 (Catch 1)", chain.status, 400);
    check("…named [mintToken] chain", logged("[mintToken] chain"), true);

    const backfill = await post("app/api/reksnap/route.js", {
      backfill: { mode: "similar", detectedItem: item, clientId: CLIENT },
    });
    check("backfill with no token → 400 (no side doors)", backfill.status, 400);

    delete process.env.MINT_SIGNING_SECRET;
    const legacy = await post("app/api/reksnap/route.js", {
      anchorDetail: { name: item.name, category: item.category, shortDescription: item.description },
    });
    check("no secret: a tokenless anchorDetail still answers 200 (pre-S2 behaviour)", legacy.status, 200);
    check("no secret: …and returns no token", legacy.json?.token, undefined);
    process.env.MINT_SIGNING_SECRET = SECRET;
  }

  /* ============================================================== */
  out("\n=== 4. /api/save: only attested text is ever minted ===\n");
  const payload = { name: item.name, category: item.category, short: item.description, long: null, mode: "similar" };
  let id;
  {
    delete process.env.MINT_SIGNING_SECRET;
    const off = await post("app/api/save/route.js", { clientId: CLIENT, payload, token });
    check("no secret → { ok:false, reason:'disabled' }", [off.json?.ok, off.json?.reason], [false, "disabled"]);
    process.env.MINT_SIGNING_SECRET = SECRET;

    failNext = TABLE_MISSING;
    logs = [];
    const pending = await post("app/api/save/route.js", { clientId: CLIENT, payload, token });
    check("before the migration → migration_pending, not a 500", [pending.status, pending.json?.reason], [200, "migration_pending"]);
    check("…named in the log", logged("migration_pending"), true);

    const noTok = await post("app/api/save/route.js", { clientId: CLIENT, payload });
    check("no token → 400", noTok.status, 400);
    const forged = await post("app/api/save/route.js", {
      clientId: CLIENT, payload: { ...payload, short: "Buy cheap pills at example.com" }, token,
    });
    check("arbitrary text with a real token → 400", forged.status, 400);
    const smuggled = await post("app/api/save/route.js", {
      clientId: CLIENT, payload: { ...payload, long: "A long the token never covered." }, token,
    });
    check("a long under the short-only token → 400", smuggled.status, 400);
    const stolen = await post("app/api/save/route.js", { clientId: OTHER, payload, token });
    check("another client replaying the token → 400", stolen.status, 400);

    const ok = await post("app/api/save/route.js", { clientId: CLIENT, payload, token });
    id = ok.json?.id;
    check("a valid save mints", ok.json?.ok, true);
    const row = db.anchor_snapshots.find((r) => r.id === id);
    check("…PRIVATE (shared_at null)", row?.shared_at, null);
    check("…holding the on-screen short", row?.short_description, item.description);
    check("…category stored lowercased", row?.item_category, "wine");

    const again = await post("app/api/save/route.js", { clientId: CLIENT, payload, token });
    check("save → unsave → save returns the SAME row", again.json?.id, id);
    check("…no second row", db.anchor_snapshots.length, 1);

    const rich = await post("app/api/save/route.js", {
      clientId: CLIENT,
      payload: { ...payload, long: "A longer, deeper profile. Next to the neighbour it drinks rounder. It wins with green curry." },
      token: extended,
    });
    check("saved-then-opened: same row", rich.json?.id, id);
    check("…now carries the long the user read", !!db.anchor_snapshots.find((r) => r.id === id)?.long_description, true);
  }
  {
    // Health wall twin #2, on an attested category.
    const t = fresh("src/lib/mintToken.js");
    const h = { name: "Vitamin D3", category: "vitamins", short: "A daily supplement.", long: null, clientId: CLIENT };
    const r = await post("app/api/save/route.js", {
      clientId: CLIENT, payload: { name: h.name, category: h.category, short: h.short, long: null, mode: "similar" },
      token: t.signAnchor(h),
    });
    check("a health anchor never mints (403)", r.status, 403);
  }
  {
    // 30/day cap (seed 29 more rows for this client → 30 total).
    const now = new Date().toISOString();
    for (let i = 0; i < 29; i++) {
      db.anchor_snapshots.push({ id: crypto.randomUUID(), client_id: CLIENT, item_name: `Filler ${i}`, item_category: "wine",
        short_description: "x", long_description: null, mode: "similar", shared_at: null, revoked_at: null, created_at: now });
    }
    const t = fresh("src/lib/mintToken.js");
    const n = { name: "Thirty-first Bottle", category: "wine", short: "One too many.", long: null, clientId: CLIENT };
    logs = [];
    const r = await post("app/api/save/route.js", {
      clientId: CLIENT, payload: { name: n.name, category: n.category, short: n.short, long: null, mode: "similar" },
      token: t.signAnchor(n),
    });
    check("the 31st mint in a day → cap", r.json?.reason, "cap");
    check("…named in the log", logged('"reason":"cap"'), true);
    const again = await post("app/api/save/route.js", { clientId: CLIENT, payload, token });
    check("…but re-saving an existing anchor still answers (dedupe before cap)", again.json?.id, id);
    db.anchor_snapshots = db.anchor_snapshots.filter((r) => !r.item_name.startsWith("Filler"));
  }

  /* ============================================================== */
  out("\n=== 5. /api/share: the flip, moderation, ownership ===\n");
  {
    const other = await post("app/api/share/route.js", { action: "share", clientId: OTHER, id });
    check("another client's id → not_found", other.json?.reason, "not_found");
    const missing = await post("app/api/share/route.js", { action: "share", clientId: CLIENT, id: crypto.randomUUID() });
    check("a nonexistent id → the SAME not_found (no oracle)", missing.json?.reason, "not_found");
    const junk = await post("app/api/share/route.js", { action: "share", clientId: CLIENT, id: "../../etc" });
    check("a malformed id → the SAME not_found", junk.json?.reason, "not_found");

    ai.moderation = "flagged";
    logs = [];
    const flagged = await post("app/api/share/route.js", { action: "share", clientId: CLIENT, id });
    check("moderation flag → refused", flagged.json?.reason, "moderation");
    check("…never silently: [share] moderation blocked", logged("[share] moderation blocked"), true);
    check("…and the row stays private", db.anchor_snapshots.find((r) => r.id === id).shared_at, null);

    ai.moderation = "throw";
    const down = await post("app/api/share/route.js", { action: "share", clientId: CLIENT, id });
    check("moderation outage → refused (fails closed)", down.json?.reason, "unavailable");
    check("…and the row stays private", db.anchor_snapshots.find((r) => r.id === id).shared_at, null);

    ai.moderation = "clean";
    const ok = await post("app/api/share/route.js", { action: "share", clientId: CLIENT, id });
    check("a clean share flips", ok.json?.ok, true);
    check("…shared_at is set", !!db.anchor_snapshots.find((r) => r.id === id).shared_at, true);
    const again = await post("app/api/share/route.js", { action: "share", clientId: CLIENT, id });
    check("a second Share tap is idempotent", again.json?.ok, true);
  }
  {
    // Health twin #3: a health row (as if one existed) can't be shared.
    const hid = crypto.randomUUID();
    db.anchor_snapshots.push({ id: hid, client_id: CLIENT, item_name: "Retinol Serum", item_category: "serum",
      short_description: "x", long_description: null, mode: "similar", shared_at: null, revoked_at: null, created_at: new Date().toISOString() });
    const r = await post("app/api/share/route.js", { action: "share", clientId: CLIENT, id: hid });
    check("a health row is refused at share", r.json?.reason, "health");
    check("…and stays private", db.anchor_snapshots.find((x) => x.id === hid).shared_at, null);
  }
  {
    // 20/day flip cap.
    const now = new Date().toISOString();
    const ids = [];
    for (let i = 0; i < 20; i++) {
      const fid = crypto.randomUUID();
      ids.push(fid);
      db.anchor_snapshots.push({ id: fid, client_id: OTHER, item_name: `Flip ${i}`, item_category: "wine",
        short_description: "x", long_description: "y", mode: "similar", shared_at: i < 19 ? now : null, revoked_at: null, created_at: now });
    }
    const twentieth = await post("app/api/share/route.js", { action: "share", clientId: OTHER, id: ids[19] });
    check("the 20th flip in a day is allowed", twentieth.json?.ok, true);
    const extra = crypto.randomUUID();
    db.anchor_snapshots.push({ id: extra, client_id: OTHER, item_name: "Flip 21", item_category: "wine",
      short_description: "x", long_description: "y", mode: "similar", shared_at: null, revoked_at: null, created_at: now });
    const over = await post("app/api/share/route.js", { action: "share", clientId: OTHER, id: extra });
    check("the 21st → cap", over.json?.reason, "cap");
    db.anchor_snapshots = db.anchor_snapshots.filter((r) => r.client_id !== OTHER);
  }

  /* ============================================================== */
  out("\n=== 6. The lazy long completion (Q5(i), Catch 2) ===\n");
  {
    const sid = crypto.randomUUID();
    db.anchor_snapshots.push({ id: sid, client_id: CLIENT, item_name: "Short Only Rosé", item_category: "wine",
      short_description: "Dry, strawberry-led.", long_description: null, mode: "similar", shared_at: null, revoked_at: null, created_at: new Date().toISOString() });
    const early = await post("app/api/share/route.js", { action: "complete", clientId: CLIENT, id: sid });
    check("completion refuses a row that isn't shared", early.json?.reason, "not_shared");

    const shared = await post("app/api/share/route.js", { action: "share", clientId: CLIENT, id: sid });
    check("sharing a short-only row asks for completion", shared.json?.needsCompletion, true);

    ai.chatCalls = [];
    logs = [];
    const done = await post("app/api/share/route.js", { action: "complete", clientId: CLIENT, id: sid });
    check("completion writes the long", done.json?.outcome, "completed");
    check("…into the row", !!db.anchor_snapshots.find((r) => r.id === sid).long_description, true);
    const { ANCHOR_DETAIL_PROMPT } = require(path.join(OUT, "src/lib/anchorDetailPrompt.js"));
    check("…with the unchanged Show-details prompt", ai.chatCalls[0]?.messages?.[0]?.content === ANCHOR_DETAIL_PROMPT, true);
    check("…from the row's own attested fields", ai.chatCalls[0]?.messages?.[1]?.content.includes("Dry, strawberry-led."), true);
    check("…with the dev-only [prompt-diag] fingerprint", logged("[prompt-diag] snapshot-completion"), true);

    ai.chatCalls = [];
    const twice = await post("app/api/share/route.js", { action: "complete", clientId: CLIENT, id: sid });
    check("a second completion generates nothing", [twice.json?.outcome, ai.chatCalls.length], ["already_rich", 0]);

    const lib = fresh("src/lib/anchorCompletion.js");
    ai.chatCalls = [];
    const skip = await lib.completeLongIfMissing(fakeSupabase, {
      id: crypto.randomUUID(), item_name: "Ibuprofen", item_category: "medication", short_description: "x", long_description: null,
    });
    check("THE FIFTH TWIN: a health row never generates", [skip, ai.chatCalls.length], ["health_skipped", 0]);
  }

  /* ============================================================== */
  out("\n=== 7. The public read: columns only, one 404 for everything ===\n");
  {
    const snaps = fresh("src/lib/anchorSnapshots.js");
    const now = new Date().toISOString();
    const priv = crypto.randomUUID(), pub = crypto.randomUUID(), rev = crypto.randomUUID(), hp = crypto.randomUUID();
    const base = { client_id: CLIENT, item_category: "wine", short_description: "One. Two.", long_description: null, mode: "similar", created_at: now };
    db.anchor_snapshots.push(
      { ...base, id: priv, item_name: "Private", shared_at: null, revoked_at: null },
      { ...base, id: pub, item_name: "Public", shared_at: now, revoked_at: null },
      { ...base, id: rev, item_name: "Revoked", shared_at: now, revoked_at: now },
      { ...base, id: hp, item_name: "Melatonin", item_category: "supplement", shared_at: now, revoked_at: null },
    );
    check("a shared row resolves", (await snaps.loadPublicSnapshot(pub))?.item_name, "Public");
    check("an UPPERCASE id resolves the same row", (await snaps.loadPublicSnapshot(pub.toUpperCase()))?.item_name, "Public");
    check("a private row is invisible", await snaps.loadPublicSnapshot(priv), null);
    check("a revoked row is invisible", await snaps.loadPublicSnapshot(rev), null);
    check("a health row is invisible even if shared (twin #4)", await snaps.loadPublicSnapshot(hp), null);
    check("a malformed id is invisible", await snaps.loadPublicSnapshot("not-a-uuid"), null);
    check("a nonexistent id is invisible", await snaps.loadPublicSnapshot(crypto.randomUUID()), null);
    failNext = TABLE_MISSING;
    check("pre-migration: a clean null, not a throw", await snaps.loadPublicSnapshot(pub), null);
    check("preview line = the first sentence", snaps.firstSentence("Plush and dark. Second sentence."), "Plush and dark.");
    check("bidi overrides are stripped", snaps.stripControl("abc\u202Eevil\u202C"), "abcevil");

    // The page itself — status codes, tags, escaping, CSP.
    const { GET } = fresh("app/a/[id]/route.js");
    const get = async (id) => {
      const res = await GET(
        new Request(`http://local/a/${id}`, { headers: { host: "preview.example", "x-forwarded-proto": "https" } }),
        { params: { id } }
      );
      return { status: res.status, html: await res.text(), headers: res.headers };
    };
    const ok = await get(pub);
    check("shared → 200", ok.status, 200);
    check("…og:image is absolute on THIS host", ok.html.includes(`content="https://preview.example/api/og/${pub}?v=1"`), true);
    check("…twitter card is the large image", ok.html.includes('content="summary_large_image"'), true);
    check("…noindex in the page", ok.html.includes('name="robots" content="noindex, nofollow"'), true);
    check("…CSP forbids scripts", /default-src 'none'/.test(ok.headers.get("content-security-policy") || ""), true);
    check("…no <script> at all", /<script/i.test(ok.html), false);
    for (const [label, id] of [["private", priv], ["revoked", rev], ["health", hp], ["malformed", "garbage"], ["nonexistent", crypto.randomUUID()]]) {
      const r = await get(id);
      check(`${label} → a REAL 404 with the one voice`, [r.status, r.html.includes("This rek isn&#39;t here anymore.")], [404, true]);
    }
    const xid = crypto.randomUUID();
    db.anchor_snapshots.push({ ...base, id: xid, item_name: '<img src=x onerror=alert(1)>"', short_description: "</p><script>alert(2)</script>", shared_at: now, revoked_at: null });
    const x = await get(xid);
    check("model text is escaped, never markup", [/<img src=x/.test(x.html), /<script>alert/.test(x.html)], [false, false]);
  }

  /* ============================================================== */
  out("\n=== 8. The DoS posture, statically: no public file reaches OpenAI ===\n");
  {
    // Walk the import graph from the two public entry points.
    const seen = new Set();
    const bad = [];
    const walk = (file) => {
      if (seen.has(file)) return;
      seen.add(file);
      const src = fs.readFileSync(file, "utf8");
      const specs = [...src.matchAll(/(?:from|import\()\s*["']([^"']+)["']/g)].map((m) => m[1]);
      for (const s of specs) {
        if (s === "openai" || s.includes("anchorCompletion") || s.includes("openaiClient")) bad.push(`${path.relative(ROOT, file)} → ${s}`);
        if (!s.startsWith(".")) continue;
        const base = path.resolve(path.dirname(file), s);
        const hit = [".ts", ".tsx", "/index.ts", ""].map((e) => base + e).find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
        if (hit) walk(hit);
      }
    };
    walk(path.join(ROOT, "app/a/[id]/route.ts"));
    walk(path.join(ROOT, "app/api/og/[id]/route.tsx"));
    check("files reachable from /a/[id] and /api/og/[id]", seen.size > 3, true);
    check("…none of them imports OpenAI or the completion", bad, []);
  }

  out(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
