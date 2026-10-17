/* eslint-disable no-console */
//
// scripts/validate-s8c.cjs — S8c: the haul (docs/s8-wine-shelf-plan.md).
//
//   1. A cart/basket photo comes back as a haul: the bottles read, no wine
//      picks generated (a purchase, not a search).
//   2. /api/wine bought: one row per bottle, one haul id, the rek that led
//      to it, and a signed "Our haul today" card.
//   3. The follow-up: due only a day after, one per open (oldest first),
//      never asked twice (shown = asked), an answer lands once, only on the
//      person's own row.
//   4. The client links a bought bottle back to the rek that led to it.
//   5. /api/stats counts hauls, bottles and snap-to-cart, agents excluded.
//
// Compiles the REAL routes and libs; stubs OpenAI, Supabase and storage.
//
//   node scripts/validate-s8c.cjs
//
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const CACHE = path.join(ROOT, "node_modules", ".cache");
fs.mkdirSync(CACHE, { recursive: true });
const OUT = fs.mkdtempSync(path.join(CACHE, "s8c-validate-"));

console.log("Compiling /api/reksnap, /api/wine, /api/stats, wineVisit from source…");
execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "tsc", "app/api/reksnap/route.ts", "app/api/wine/route.ts", "app/api/stats/route.ts", "src/lib/wineVisit.ts",
    "--outDir", OUT, "--rootDir", ".", "--module", "commonjs", "--target", "es2020",
    "--moduleResolution", "node", "--esModuleInterop", "--skipLibCheck", "--lib", "es2020,dom",
  ],
  { stdio: "inherit", cwd: ROOT, shell: process.platform === "win32" }
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

/* ---------------- OpenAI stub ---------------- */
const calls = { shelf: 0, wine: 0, vision: 0 };
let shelfReply = null;
class FakeOpenAI {
  constructor() {
    this.moderations = { create: async () => ({ results: [{ flagged: false }] }) };
    this.chat = {
      completions: {
        create: async (req) => {
          const sys = String(req.messages?.[0]?.content || "");
          let text;
          if (sys.startsWith("You are reading a photo taken in a wine shop")) { calls.shelf++; text = JSON.stringify(shelfReply); }
          else if (sys.startsWith("You are a taste-aware wine recommendation engine")) { calls.wine++; text = JSON.stringify({ anchor: {}, reks: [] }); }
          else {
            calls.vision++;
            text = JSON.stringify({
              detected_item: { name: "Cannonball Cabernet Sauvignon", description: "Dry and plush. Built for a steak dinner, not a salad.", category: "wine" },
              mode: "similar",
              results: {
                similar: ["Alpha", "Bravo", "Charlie", "Delta", "Echo"].map((w) => ({ name: `Vision ${w}`, description: "x", category: "wine" })),
                uses: ["Alpha", "Bravo"].map((w) => ({ name: `Dish ${w}`, description: "x", category: "food" })),
                alternatives: [],
              },
            });
          }
          if (req.stream) {
            return { async *[Symbol.asyncIterator]() { yield { choices: [{ delta: { content: text } }] }; yield { choices: [{ delta: {}, finish_reason: "stop" }] }; } };
          }
          return { choices: [{ message: { content: text }, finish_reason: "stop" }], usage: {} };
        },
      },
    };
  }
}
require.cache[require.resolve("openai")] = { id: "openai", filename: "openai", loaded: true, exports: { __esModule: true, default: FakeOpenAI } };

/* ---------------- Supabase stub (in-memory) ---------------- */
const db = { wine_marks: [], reksnap_signals: [], api_usage: [], card_events: [], anchor_snapshots: [] };
function query(table) {
  const st = { op: "select", filters: [], order: null, limit: null, payload: null };
  const rowsOf = () => (db[table] ??= []);
  const match = (r) => st.filters.every((f) => f(r));
  const run = () => {
    if (st.op === "insert") {
      const items = (Array.isArray(st.payload) ? st.payload : [st.payload]).map((p) => ({
        id: crypto.randomUUID(), created_at: new Date().toISOString(), followup: null, followup_at: null, cleared_at: null, ...p,
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
    if (st.limit != null) rows = rows.slice(0, st.limit);
    return { data: rows.map((r) => ({ ...r })), error: null, count: rows.length };
  };
  const b = {
    select() { return b; },
    insert(p) { st.op = "insert"; st.payload = p; return b; },
    update(p) { st.op = "update"; st.payload = p; return b; },
    eq(c, v) { st.filters.push((r) => r[c] === v); return b; },
    gte(c, v) { st.filters.push((r) => r[c] != null && Date.parse(r[c]) >= Date.parse(v)); return b; },
    is(c, v) { st.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return b; },
    ilike(c, v) { st.filters.push((r) => String(r[c] ?? "").toLowerCase() === String(v).toLowerCase()); return b; },
    order(c, o) { st.order = { col: c, asc: o?.ascending !== false }; return b; },
    limit(n) { st.limit = n; return b; },
    range(a, z) { st.limit = z - a + 1; return b; },
    then(res, rej) { return Promise.resolve(run()).then(res, rej); },
  };
  return b;
}
require.cache[path.join(OUT, "src/lib/supabaseServer.js")] = {
  id: "sb", filename: "sb", loaded: true, exports: { supabaseServer: { from: (t) => query(t) } },
};

process.env.OPENAI_API_KEY = "stub";
process.env.MINT_SIGNING_SECRET = "s8c-secret";
process.env.SUPABASE_URL = "http://stub.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "stub";
process.env.STATS_KEY = "s8c-stats-key";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://stub.local";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "stub";
delete process.env.TMDB_API_KEY;

const reksnap = require(path.join(OUT, "app/api/reksnap/route.js"));
const wineRoute = require(path.join(OUT, "app/api/wine/route.js"));
const statsRoute = require(path.join(OUT, "app/api/stats/route.js"));
const { verifyAnchor } = require(path.join(OUT, "src/lib/mintToken.js"));
const postTo = async (mod, body) => {
  const res = await mod.POST(new Request("http://local/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  return { status: res.status, json: await res.json().catch(() => null) };
};
const quiet = () => { const s = [console.info, console.warn]; console.info = () => {}; console.warn = () => {}; return () => { [console.info, console.warn] = s; }; };

const ME = "anon_s8c_client_0001";
const OTHER = "anon_s8c_other_00001";
const HAUL = ["Caymus Bonanza Cabernet Sauvignon", "La Marca Prosecco", "Cannonball Cabernet Sauvignon", "Wairau River Sauvignon Blanc", "Dashwood Sauvignon Blanc"];

(async () => {
  const restore = process.env.S8C_VERBOSE ? () => {} : quiet();
  out("\n1. A haul photo is a purchase, not a search");
  shelfReply = { scene: "haul", anchor_price: null, bottles: HAUL.map((name) => ({ name, price: null })) };
  const snap = await postTo(reksnap, { image: "data:image/jpeg;base64,AAAA", clientId: ME, category: "Wine", wineVisit: { seen: [], rejected: [] } });
  check("200 with wine.scene haul and the five bottles", [snap.status, snap.json.wine?.scene, snap.json.wine?.shelf.map((b) => b.name)], [200, "haul", HAUL]);
  check("no wine picks generated for a haul", calls.wine, 0);

  out("\n2. Bought");
  const saved = await postTo(wineRoute, { clientId: ME, action: "bought", items: HAUL.map((name) => ({ name, fromRek: name.startsWith("Cannonball") ? "Cannonball Cabernet Sauvignon" : null, fromAnchor: name.startsWith("Cannonball") ? "Josh Cellars Cabernet Sauvignon" : null })) });
  const rows = db.wine_marks.filter((r) => r.client_id === ME && r.kind === "bought");
  check("ok, five rows, one haul id", [saved.json.ok, rows.length, new Set(rows.map((r) => r.haul_id)).size], [true, 5, 1]);
  check("Cannonball linked to the rek and its anchor; others not", rows.map((r) => [r.from_rek, r.from_anchor]).filter((x) => x[0]), [["Cannonball Cabernet Sauvignon", "Josh Cellars Cabernet Sauvignon"]]);
  check("one snap-to-cart conversion reported", saved.json.conversions, 1);
  const card = saved.json.card;
  check("a signed 'Our haul today' card", [card?.name, card?.short, verifyAnchor({ name: card.name, category: "wine", short: card.short, long: null, clientId: ME }, card.token)], ["Our haul today", HAUL.join(" · "), true]);
  check("empty haul → 400", (await postTo(wineRoute, { clientId: ME, action: "bought", items: [] })).status, 400);

  out("\n3. The follow-up");
  let st = await postTo(wineRoute, { clientId: ME, action: "state" });
  check("same day: the Bought list, no question yet", [st.json.bought.length, st.json.followup], [5, null]);
  const day = 24 * 60 * 60 * 1000;
  rows.forEach((r, i) => { r.created_at = new Date(Date.now() - 2 * day - i * 60000).toISOString(); });
  st = await postTo(wineRoute, { clientId: ME, action: "state" });
  const oldest = rows[rows.length - 1];
  check("a day later: ONE question, the oldest bottle", st.json.followup?.name, oldest.name);
  await postTo(wineRoute, { clientId: ME, action: "followup_shown", id: oldest.id });
  st = await postTo(wineRoute, { clientId: ME, action: "state" });
  check("shown = asked: the next open asks about the NEXT bottle", st.json.followup?.name, rows[rows.length - 2].name);
  const other = await postTo(wineRoute, { clientId: OTHER, action: "followup", id: oldest.id, answer: "dislike" });
  check("another client can't answer my bottle", [other.json.ok, oldest.followup ?? null], [true, null]);
  await postTo(wineRoute, { clientId: ME, action: "followup", id: oldest.id, answer: "like" });
  await postTo(wineRoute, { clientId: ME, action: "followup", id: oldest.id, answer: "dislike" });
  check("an answer lands once (a second one is ignored)", db.wine_marks.find((r) => r.id === oldest.id).followup, "like");
  check("a bad answer → 400", (await postTo(wineRoute, { clientId: ME, action: "followup", id: oldest.id, answer: "meh" })).status, 400);
  for (const r of rows) await postTo(wineRoute, { clientId: ME, action: "followup", id: r.id, answer: "skipped" });
  st = await postTo(wineRoute, { clientId: ME, action: "state" });
  check("all answered or skipped → no question, ever again", st.json.followup, null);
  check("the Bought list shows the answers", st.json.bought.find((b) => b.id === oldest.id).followup, "like");

  out("\n4. The client links a purchase to its rek");
  const store = {};
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  globalThis.sessionStorage = { ...globalThis.localStorage };
  globalThis.window = { dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
  globalThis.CustomEvent = class { constructor(t) { this.type = t; } };
  const sent = [];
  globalThis.fetch = async (_u, init) => { sent.push(JSON.parse(init.body)); return new Response(JSON.stringify({ ok: true, conversions: 1, card: null })); };
  const userPrefs = require(path.join(OUT, "src/lib/userPrefs.js"));
  userPrefs.getAnonymousClientId = () => ME;
  const wv = require(path.join(OUT, "src/lib/wineVisit.js"));
  wv.noteWineShown(["Josh Cellars Cabernet Sauvignon", "Cannonball Cabernet Sauvignon 2021", "Bogle Merlot"], "Josh Cellars Cabernet Sauvignon");
  check("a shelf-shot rek is remembered with its anchor", wv.rekOriginFor("Cannonball Cabernet"), { rek: "Cannonball Cabernet Sauvignon 2021", anchor: "Josh Cellars Cabernet Sauvignon" });
  check("the anchor itself is not a rek", wv.rekOriginFor("Josh Cellars Cabernet Sauvignon"), null);
  await wv.saveHaul(["Cannonball Cabernet", "La Marca Prosecco"]);
  check("saveHaul sends the link for Cannonball only", sent[0].items.map((i) => i.fromRek), ["Cannonball Cabernet Sauvignon 2021", null]);

  out("\n5. /api/stats");
  db.wine_marks.push({ id: "x", client_id: "anon_agent_s8c_probe", kind: "bought", name: "Agent wine", haul_id: "h-agent", from_rek: "Agent wine", followup: null, created_at: new Date().toISOString() });
  const res = await statsRoute.GET(new Request(`http://local/api/stats?key=s8c-stats-key&since=2020-01-01&format=json`));
  const js = await res.json();
  check("hauls, bottles, snap-to-cart, buyers, answered (agents excluded)", [js.wine_hauls, js.wine_bottles_bought, js.snap_to_cart, js.wine_buyers, js.followups_answered], [1, 5, 1, 1, 1]);
  const html = await (await statsRoute.GET(new Request(`http://local/api/stats?key=s8c-stats-key&since=2020-01-01`))).text();
  check("the phone readout shows the snap-to-cart row", html.includes("Snap-to-cart (bought from a rek)</td><td>1"), true);
  restore();

  out(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
