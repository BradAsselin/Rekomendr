/* eslint-disable no-console */
//
// scripts/validate-s4a.cjs — S4a: the card is the product.
//   permanent links · recognizable link preview (poster + "from <name>")
//   · sender name · live where-to-watch (12h refresh, stored fallback)
//   · one-tap action above the fold · test instrumentation + readout.
//
// Compiles the REAL routes and libs from source. Stubs TMDb (fetch),
// OpenAI moderation, next/og, and the Supabase service-role client (a small
// in-memory table engine). No keys, no network.
//
//   node scripts/validate-s4a.cjs
//
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const CACHE = path.join(ROOT, "node_modules", ".cache");
fs.mkdirSync(CACHE, { recursive: true });
const OUT = fs.mkdtempSync(path.join(CACHE, "s4a-validate-"));

console.log("Compiling /a/[id], /api/og/[id], /api/share, /api/profile, /api/card/event, /api/stats from source…");
execFileSync(
  "npx",
  [
    "tsc",
    "app/a/[id]/route.ts",
    "app/api/og/[id]/route.tsx",
    "app/api/share/route.ts",
    "app/api/profile/route.ts",
    "app/api/card/event/route.ts",
    "app/api/stats/route.ts",
    "src/lib/cardShare.ts",
    "--outDir", OUT,
    "--rootDir", ".",
    "--module", "commonjs",
    "--target", "es2020",
    "--moduleResolution", "node",
    "--esModuleInterop",
    "--skipLibCheck",
    "--jsx", "react-jsx",
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
    if (process.env.S4A_VERBOSE) orig(...args);
  };
}
const logged = (needle) => logs.some((l) => l.includes(needle));

/* ---------------- TMDb stub ---------------- */
const tmdb = { calls: [], down: false, delayMs: 0, providers: "paramount" };
const LIONESS_SEARCH = [{ id: 113962, name: "Lioness", original_name: "Lioness", first_air_date: "2023-07-23", vote_count: 1688, overview: "o" }];
const lionessDetail = () => ({
  id: 113962,
  name: "Lioness",
  first_air_date: "2023-07-23",
  overview: "Cruz Manuelos, a young Marine, is recruited to the CIA's Lioness Engagement Team.",
  poster_path: "/lioness.jpg",
  videos: { results: [{ site: "YouTube", type: "Trailer", official: true, key: "uEjcXhW7CXo", iso_639_1: "en" }] },
  "watch/providers": {
    results: {
      US: {
        link: "https://www.themoviedb.org/tv/113962-lioness/watch?locale=US",
        flatrate:
          tmdb.providers === "paramount"
            ? [{ provider_id: 531, provider_name: "Paramount Plus", display_priority: 3 }]
            : [{ provider_id: 8, provider_name: "Netflix", display_priority: 1 }],
      },
    },
  },
});
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url));
  if (u.hostname === "image.tmdb.org") {
    tmdb.calls.push(`img:${u.pathname}`);
    if (tmdb.down) throw new Error("ECONNRESET");
    return new Response(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { status: 200, headers: { "content-type": "image/jpeg" } });
  }
  tmdb.calls.push(u.pathname);
  if (tmdb.delayMs) await new Promise((r) => setTimeout(r, tmdb.delayMs));
  if (tmdb.down) throw new Error("ECONNRESET");
  if (u.pathname === "/3/search/tv") return new Response(JSON.stringify({ results: (u.searchParams.get("query") || "").toLowerCase() === "lioness" ? LIONESS_SEARCH : [] }), { status: 200 });
  if (u.pathname === "/3/search/movie") return new Response(JSON.stringify({ results: [] }), { status: 200 });
  if (u.pathname === "/3/tv/113962") return new Response(JSON.stringify(lionessDetail()), { status: 200 });
  return new Response("{}", { status: 404 });
};

/* ---------------- OpenAI moderation stub ---------------- */
const mod = { flagged: false, down: false, calls: 0 };
class FakeOpenAI {
  constructor() {
    this.moderations = {
      create: async () => {
        mod.calls++;
        if (mod.down) throw new Error("moderation unreachable");
        return { results: [{ flagged: mod.flagged }] };
      },
    };
    this.chat = { completions: { create: async () => { throw new Error("no generation in S4a"); } } };
  }
}
const seed = (file, exports) => {
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
seed(require.resolve("openai"), { __esModule: true, default: FakeOpenAI });

/* ---------------- next/og stub: capture the element tree ---------------- */
const og = { last: null };
class FakeImageResponse extends Response {
  constructor(element, opts) {
    super("PNG", { status: 200, headers: { "content-type": "image/png" } });
    og.last = { element, opts };
  }
}
seed(require.resolve("next/og"), { ImageResponse: FakeImageResponse });
const textOf = (node) => {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  return textOf(node.props?.children);
};
const findImg = (node) => {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) { for (const n of node) { const f = findImg(n); if (f) return f; } return null; }
  if (node.type === "img") return node;
  return findImg(node.props?.children);
};

/* ---------------- Supabase stub: a tiny in-memory table engine ---------------- */
const db = { anchor_snapshots: [], client_profiles: [], card_events: [] };
let nextEventId = 1;
const fail_ = { table: null };
function query(table) {
  const st = { op: "select", filters: [], order: null, limit: null, range: null, count: false, head: false, payload: null, upsert: false };
  const rowsOf = () => db[table];
  const match = (r) => st.filters.every((f) => f(r));
  const run = () => {
    if (fail_.table === table) return { data: null, error: { code: "XX000" }, count: null };
    if (st.op === "insert") {
      const items = (Array.isArray(st.payload) ? st.payload : [st.payload]).map((p) => {
        const r = { ...p };
        if (table === "card_events") { r.id = nextEventId++; r.created_at = r.created_at ?? new Date(clock.now).toISOString(); }
        if (table === "anchor_snapshots") r.id = r.id ?? crypto.randomUUID();
        return r;
      });
      rowsOf().push(...items);
      return { data: items, error: null };
    }
    if (st.op === "upsert") {
      const p = st.payload;
      const existing = rowsOf().find((r) => r.client_id === p.client_id);
      if (existing) Object.assign(existing, p); else rowsOf().push({ ...p });
      return { data: [p], error: null };
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
    if (st.range) rows = rows.slice(st.range[0], st.range[1] + 1);
    if (st.limit != null) rows = rows.slice(0, st.limit);
    return { data: st.head ? null : rows.map((r) => ({ ...r })), error: null, count };
  };
  const b = {
    select(_cols, opts) { if (opts?.count) st.count = true; if (opts?.head) st.head = true; return b; },
    insert(p) { st.op = "insert"; st.payload = p; return b; },
    update(p) { st.op = "update"; st.payload = p; return b; },
    upsert(p) { st.op = "upsert"; st.payload = p; return b; },
    eq(c, v) { st.filters.push((r) => r[c] === v); return b; },
    gte(c, v) { st.filters.push((r) => r[c] != null && Date.parse(r[c]) >= Date.parse(v)); return b; },
    not(c, op, v) { if (op === "is" && v === null) st.filters.push((r) => r[c] != null); return b; },
    is(c, v) { st.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return b; },
    order(c, o) { st.order = { col: c, asc: o?.ascending !== false }; return b; },
    limit(n) { st.limit = n; return b; },
    range(a, z) { st.range = [a, z]; return b; },
    single() { const r = run(); return Promise.resolve({ ...r, data: r.data?.[0] ?? null }); },
    maybeSingle() { const r = run(); return Promise.resolve({ ...r, data: r.data?.[0] ?? null }); },
    then(res, rej) { return Promise.resolve(run()).then(res, rej); },
  };
  return b;
}
seed(path.join(OUT, "src/lib/supabaseServer.js"), { supabaseServer: { from: (t) => query(t) } });
const clock = { now: Date.now() };

process.env.TMDB_API_KEY = "v3key";
process.env.OPENAI_API_KEY = "stub";
process.env.SUPABASE_URL = "http://stub.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "stub";
process.env.MINT_SIGNING_SECRET = "s4a-secret";

const page = require(path.join(OUT, "app/a/[id]/route.js"));
const ogRoute = require(path.join(OUT, "app/api/og/[id]/route.js"));
const shareRoute = require(path.join(OUT, "app/api/share/route.js"));
const profileRoute = require(path.join(OUT, "app/api/profile/route.js"));
const eventRoute = require(path.join(OUT, "app/api/card/event/route.js"));
const statsRoute = require(path.join(OUT, "app/api/stats/route.js"));
const { ogImagePath, pickLabel } = require(path.join(OUT, "src/lib/cardShare.js"));
const { cardMedia, PROVIDERS_TTL_MS } = require(path.join(OUT, "src/lib/cardMedia.js"));
const { computeReadout } = require(path.join(OUT, "src/lib/testReadout.js"));
const { recordCardEvent } = require(path.join(OUT, "src/lib/cardEvents.js"));

const SENDER = "anon_s4a_sender_0001";
const RECEIVER = "anon_s4a_receiver_01";
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
const DAY = 86400e3;
const card = (over = {}) => {
  const r = {
    id: crypto.randomUUID(), client_id: SENDER, item_name: "Lioness", item_category: "tv",
    short_description: "Cruz Manuelos, a young Marine, is recruited to the CIA. A second sentence.",
    long_description: null, mode: "similar", shared_at: iso(DAY), revoked_at: null, created_at: iso(DAY),
    sender_name: null, media_kind: null, media_id: null, poster_path: null, trailer_url: null, providers: null, providers_at: null,
    ...over,
  };
  db.anchor_snapshots.push(r);
  return r;
};
const getPage = async (id) => {
  const res = await page.GET(new Request(`https://www.rekomendr.ai/a/${id}`, { headers: { host: "www.rekomendr.ai" } }), { params: { id } });
  return { status: res.status, html: await res.text(), headers: res.headers };
};
const post = async (route, body) => {
  const res = await route.POST(new Request("http://local/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
};
const event = (kind, cardId, clientId) => recordCardEvent({ kind, card: cardId, clientId }, { now: clock.now });

(async () => {
  out("\n1. Permanent links");
  const ancient = card({ shared_at: iso(400 * DAY), created_at: iso(400 * DAY), item_name: "Old Wine", item_category: "wine" });
  check("a card shared 400 days ago still opens", (await getPage(ancient.id)).status, 200);
  const priv = card({ shared_at: null });
  const rev = card({ revoked_at: iso(1000) });
  check("private → 404 (unchanged)", (await getPage(priv.id)).status, 404);
  check("revoked → 404 (owner's explicit act, unchanged)", (await getPage(rev.id)).status, 404);
  const grepDeletes = (dir) => {
    const hits = [];
    const walk = (d) => {
      for (const f of fs.readdirSync(d)) {
        const p = path.join(d, f);
        if (fs.statSync(p).isDirectory()) { if (!/node_modules|\.cache|pages_backup/.test(p)) walk(p); continue; }
        if (!/\.(ts|tsx|js|cjs)$/.test(f)) continue;
        const s = fs.readFileSync(p, "utf8");
        if (/anchor_snapshots"\)\s*\.delete\(|from\("anchor_snapshots"\)[\s\S]{0,80}\.delete\(/.test(s)) hits.push(path.relative(ROOT, p));
      }
    };
    walk(dir);
    return hits;
  };
  check("no code path deletes a card (app/, src/)", [...grepDeletes(path.join(ROOT, "app")), ...grepDeletes(path.join(ROOT, "src"))], []);
  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
  check("no cleanup cron (health only)", (vercel.crons || []).map((c) => c.path), ["/api/health"]);
  const sql = fs.readFileSync(path.join(ROOT, "docs/sql/s4-card.sql"), "utf8");
  check("events reference cards WITHOUT cascade (a card with history can't be deleted)", /references public\.anchor_snapshots \(id\),/.test(sql) && !/on delete cascade/i.test(sql), true);

  out("\n2. Live where-to-watch — first open of an old card (the Lioness case)");
  const lioness = card({ id: "99a1a2a4-9b13-4e9e-b45c-f43de15f82f0", shared_at: iso(3 * DAY) });
  tmdb.calls = []; logs = [];
  const p1 = await getPage(lioness.id);
  check("200", p1.status, 200);
  check("resolved by name once, then one detail call", tmdb.calls, ["/3/search/tv", "/3/tv/113962"]);
  check("stored: TMDb id, poster, trailer, providers, clock", [lioness.media_kind, lioness.media_id, lioness.poster_path, lioness.trailer_url, !!lioness.providers?.watch, !!lioness.providers_at], ["tv", 113962, "/lioness.jpg", "https://www.youtube.com/watch?v=uEjcXhW7CXo", true, true]);
  check("log names the refresh (firstLookup)", logged("[card-providers] refreshed") && logged('"firstLookup":true'), true);
  check("the old card gains the live providers", p1.html.includes("▶ Watch on Paramount Plus"), true);
  check("synopsis stays the snapshot's own", p1.html.includes("Cruz Manuelos, a young Marine, is recruited to the CIA. A second sentence."), true);

  out("\n3. Reopen inside 12h = cached; after 12h = refreshed; TMDb down = stored");
  tmdb.calls = []; logs = [];
  await getPage(lioness.id);
  check("inside the window: no TMDb call", tmdb.calls, []);
  check("…logged cached", logged("[card-providers] cached"), true);
  lioness.providers_at = iso(PROVIDERS_TTL_MS + 60e3);
  tmdb.providers = "netflix"; tmdb.calls = []; logs = [];
  const p3 = await getPage(lioness.id);
  check("stale: one detail call by id (never re-guessed by name)", tmdb.calls, ["/3/tv/113962"]);
  check("…shows where it streams TODAY", p3.html.includes("▶ Watch on Netflix"), true);
  lioness.providers_at = iso(PROVIDERS_TTL_MS + 60e3);
  tmdb.down = true; logs = [];
  const p4 = await getPage(lioness.id);
  check("TMDb down: still 200 with the STORED providers", [p4.status, p4.html.includes("▶ Watch on Netflix")], [200, true]);
  check("…logged as fallback", logged("[card-providers] fallback stored — tmdb refresh failed"), true);
  const bare = card({ item_name: "Lioness" });
  const p5 = await getPage(bare.id);
  check("TMDb down, nothing stored: trailer search is the action, no Watch", [p5.html.includes("▶ Watch on"), p5.html.includes('data-ev="tap_trailer" class="btn primary"')], [false, true]);
  tmdb.down = false;
  lioness.providers_at = iso(PROVIDERS_TTL_MS + 60e3);
  tmdb.delayMs = 4000; logs = [];
  const t0 = Date.now();
  const p6 = await getPage(lioness.id);
  check("TMDb hangs: the card renders inside the 2.5s budget with stored providers", [Date.now() - t0 < 3200, p6.html.includes("▶ Watch on Netflix")], [true, true]);
  check("…logged over budget", logged("over budget"), true);
  tmdb.delayMs = 0;
  await new Promise((r) => setTimeout(r, 4200)); // let the slow refresh finish

  out("\n4. Recognizable: name, poster, the one action above the fold");
  lioness.sender_name = "Katrina";
  lioness.providers_at = iso(0);
  const p7 = await getPage(lioness.id);
  check("og:title carries 'from <name>'", p7.html.includes('property="og:title" content="Lioness · from Katrina"'), true);
  check("card says “Katrina’s pick”", p7.html.includes(">Katrina’s pick<"), true);
  check("poster from TMDb's image host", p7.html.includes('src="https://image.tmdb.org/t/p/w342/lioness.jpg"'), true);
  check("CSP allows exactly that image host and same-origin script", /img-src 'self' https:\/\/image\.tmdb\.org;/.test(p7.headers.get("content-security-policy")) && /script-src 'self';/.test(p7.headers.get("content-security-policy")), true);
  const iAct = p7.html.indexOf('class="actions"');
  const iSyn = p7.html.indexOf("<p>Cruz");
  check("Watch + Trailer come BEFORE the synopsis (above the fold)", iAct > 0 && iAct < iSyn, true);
  check("the og:image URL is the keyed v2 path", p7.html.includes(`/api/og/${lioness.id}?v=2&amp;k=`), true);
  check("og:image key changes with the name", ogImagePath("x", "Katrina", "/p.jpg") !== ogImagePath("x", "Kat", "/p.jpg"), true);
  check("og:image key changes when a poster arrives", ogImagePath("x", "Katrina", null) !== ogImagePath("x", "Katrina", "/p.jpg"), true);
  check("pickLabel: s-ending names take ’s", pickLabel("James"), "James’s pick");
  const wine = card({ item_name: "Bonanza Cabernet", item_category: "wine", short_description: "Dry and plush." });
  const pw = await getPage(wine.id);
  check("wine: Buy is the one action; no Watch; no TMDb call", [pw.html.includes('data-ev="tap_buy" class="btn primary"'), pw.html.includes("Watch on")], [true, false]);
  check("no name: category label, brand title", [pw.html.includes('<div class="cat">wine</div>'), pw.html.includes("Bonanza Cabernet — Rekomendr")], [true, true]);
  check("one same-origin script carrying the card id", (p7.html.match(/<script/g) || []).length === 1 && p7.html.includes(`<script src="/card.js" defer data-card="${lioness.id}">`), true);

  out("\n5. The link-preview image");
  let res = await ogRoute.GET(new Request("http://local/x"), { params: { id: lioness.id } });
  let txt = textOf(og.last.element);
  check("200 image", [res.status, res.headers.get("content-type")], [200, "image/png"]);
  check("says 'from Katrina' and the title", txt.includes("from Katrina") && txt.includes("Lioness"), true);
  check("poster embedded as data URL (no unbounded fetch inside the renderer)", (findImg(og.last.element)?.props?.src || "").startsWith("data:image/jpeg;base64,"), true);
  check("cached forever (URL is keyed)", res.headers.get("cache-control"), "public, max-age=31536000, immutable");
  tmdb.down = true;
  res = await ogRoute.GET(new Request("http://local/x"), { params: { id: lioness.id } });
  check("poster download fails → renders without art, cached briefly", [findImg(og.last.element), res.headers.get("cache-control")], [null, "public, max-age=300"]);
  tmdb.down = false;
  res = await ogRoute.GET(new Request("http://local/x"), { params: { id: priv.id } });
  check("private card → the generic brand card", [res.status, textOf(og.last.element).includes("Snap or type one thing")], [200, true]);
  res = await ogRoute.GET(new Request("http://local/x"), { params: { id: wine.id } });
  txt = textOf(og.last.element);
  check("no name → category, no 'from'", [txt.includes("WINE"), txt.includes("from ")], [true, false]);

  out("\n6. Sender name — /api/profile (moderated, fail-closed)");
  let r = await post(profileRoute, { clientId: SENDER, name: "  Katrina  " });
  check("set → ok, trimmed", [r.json.ok, r.json.name, db.client_profiles.find((p) => p.client_id === SENDER)?.display_name], [true, "Katrina", "Katrina"]);
  r = await post(profileRoute, { clientId: SENDER, name: "x".repeat(41) });
  check("41 chars → 400", r.status, 400);
  r = await post(profileRoute, { clientId: SENDER, name: "Ka‮trina" });
  check("bidi override stripped", r.json.name, "Katrina");
  mod.flagged = true;
  r = await post(profileRoute, { clientId: "anon_s4a_flagged_01", name: "bad" });
  check("flagged → refused, not stored", [r.json.ok, r.json.reason, !!db.client_profiles.find((p) => p.client_id === "anon_s4a_flagged_01")], [false, "moderation", false]);
  mod.flagged = false; mod.down = true;
  r = await post(profileRoute, { clientId: "anon_s4a_flagged_01", name: "Sam" });
  check("moderation down → refused (fail closed), logged", [r.json.reason, logged("[profile] name refused")], ["moderation_unreachable", true]);
  mod.down = false;

  out("\n7. The name travels: share flip stamps it");
  const fresh = card({ shared_at: null, sender_name: null });
  r = await post(shareRoute, { action: "share", clientId: SENDER, id: fresh.id });
  check("flip ok and stamped 'Katrina'", [r.json.ok, fresh.sender_name, !!fresh.shared_at], [true, "Katrina", true]);
  await post(profileRoute, { clientId: SENDER, name: "Kat" });
  r = await post(shareRoute, { action: "share", clientId: SENDER, id: fresh.id });
  check("re-share after a rename → the card now says 'Kat'", [r.json.ok, fresh.sender_name], [true, "Kat"]);
  const nameless = card({ client_id: "anon_s4a_nameless_1", shared_at: null });
  r = await post(shareRoute, { action: "share", clientId: "anon_s4a_nameless_1", id: nameless.id });
  check("no name set → shares fine, unnamed", [r.json.ok, nameless.sender_name], [true, null]);
  fail_.table = "client_profiles";
  const nameless2 = card({ client_id: "anon_s4a_nameless_2", shared_at: null });
  r = await post(shareRoute, { action: "share", clientId: "anon_s4a_nameless_2", id: nameless2.id });
  check("profiles unreadable → still shares, logged", [r.json.ok, logged("[share] sender name unreadable")], [true, true]);
  fail_.table = null;

  out("\n8. Events — the test's instrument");
  db.card_events = [];
  clock.now = Date.now();
  const sharedCard = card({ shared_at: iso(3 * DAY) });
  let e = await event("open", sharedCard.id, RECEIVER);
  check("receiver open: not sender, first open, since_send ≈ 3 days", [e.ok, e.detail.isSender, e.detail.firstOpen, Math.round(e.detail.sinceSendS / 86400)], [true, false, true, 3]);
  e = await event("open", sharedCard.id, RECEIVER);
  check("second open → reopen", e.detail.firstOpen, false);
  e = await event("open", sharedCard.id, SENDER);
  check("sender opening own card → is_sender", e.detail.isSender, true);
  e = await event("open", priv.id, RECEIVER);
  check("private card → not recorded", [e.ok, e.reason], [false, "card_not_public"]);
  e = await event("sent", sharedCard.id, RECEIVER);
  check("'sent' by someone who doesn't own it → refused", e.reason, "not_owner");
  const receiversOwn = card({ client_id: RECEIVER, shared_at: iso(1000) });
  e = await event("sent", receiversOwn.id, RECEIVER);
  check("receiver's FIRST own send → attributed to the card that brought them in", e.detail.firstOwnShareVia, sharedCard.id);
  e = await event("sent", receiversOwn.id, RECEIVER);
  check("second send → no attribution (only the first counts)", e.detail.firstOwnShareVia, null);
  e = await event("sent", sharedCard.id, SENDER);
  check("organic sender (never opened anyone's card) → no attribution", e.detail.firstOwnShareVia, null);
  for (const k of ["tap_watch", "tap_trailer", "tap_buy"]) {
    e = await event(k, sharedCard.id, RECEIVER);
    check(`${k} recorded`, e.ok, true);
  }
  e = await event("nonsense", sharedCard.id, RECEIVER);
  check("unknown kind → refused, logged", [e.reason, logged("[card-event] not recorded")], ["bad_request", true]);
  const spam = "anon_s4a_spammer_01";
  for (let i = 0; i < 300; i++) db.card_events.push({ id: nextEventId++, card_id: sharedCard.id, client_id: spam, kind: "tap_watch", created_at: iso(1000) });
  e = await event("tap_watch", sharedCard.id, spam);
  check("cap: 300/day per client", e.reason, "cap");
  db.card_events = db.card_events.filter((x) => x.client_id !== spam);
  let ev = await eventRoute.POST(new Request("http://local/x", { method: "POST", body: "not json" }));
  check("route: junk body → 204, logged", [ev.status, logged("bad_json")], [204, true]);
  ev = await eventRoute.POST(new Request("http://local/x", { method: "POST", body: JSON.stringify({ kind: "tap_trailer", card: sharedCard.id, clientId: RECEIVER }) }));
  check("route: beacon-style text body → 204 and recorded", [ev.status, db.card_events.filter((x) => x.kind === "tap_trailer").length], [204, 2]);

  out("\n9. Readout — counts every step");
  const rows = db.card_events.map((x) => ({ ...x }));
  rows.push({ card_id: sharedCard.id, client_id: "anon_agent_s4_probe1", kind: "open", is_sender: false, since_send_s: 999999, via_card: null, created_at: iso(1000) });
  const ro = computeReadout(rows, iso(10 * DAY));
  check("cards sent / sends / senders", [ro.cards_sent, ro.sends, ro.senders], [2, 3, 2]);
  check("unique receivers (agent traffic excluded)", ro.unique_receivers, 1);
  check("receiver opens; both > 2 days after send → reopen rate 100%", [ro.receiver_opens, ro.late_opens, ro.reopen_rate_pct], [2, 2, 100]);
  check("receiver → sender: 1 of 1 = 100%", [ro.receivers_who_sent, ro.receiver_to_sender_pct], [1, 100]);
  check("taps", [ro.watch_taps, ro.trailer_taps, ro.buy_taps], [1, 2, 1]);
  check("agentsOnly: counts ONLY agent traffic (acceptance runs)", computeReadout(rows, iso(10 * DAY), { agentsOnly: true }).unique_receivers, 1);
  check("empty readout → zeros and null rates", (({ cards_sent, reopen_rate_pct, receiver_to_sender_pct }) => [cards_sent, reopen_rate_pct, receiver_to_sender_pct])(computeReadout([], iso(DAY))), [0, null, null]);
  const sqlRead = fs.readFileSync(path.join(ROOT, "docs/sql/test-readout.sql"), "utf8");
  check("SQL readout: same definitions (late = 2 days, agent excluded, via_card)", [/since_send_s > 2 \* 86400/.test(sqlRead), /not like 'anon_agent%'/.test(sqlRead), /via_card is not null/.test(sqlRead)], [true, true, true]);

  out("\n10. /api/stats — admin only");
  const stats = (q) => statsRoute.GET(new Request(`http://local/api/stats${q}`));
  delete process.env.STATS_KEY;
  check("no STATS_KEY set → 404", (await stats("?key=anything")).status, 404);
  process.env.STATS_KEY = "k".repeat(32);
  check("wrong key → 404", (await stats("?key=nope")).status, 404);
  check("no key → 404", (await stats("")).status, 404);
  const sres = await stats(`?key=${"k".repeat(32)}&since=2020-01-01&format=json`);
  const sj = await sres.json();
  check("right key → JSON counts", [sres.status, sj.cards_sent, sj.unique_receivers], [200, 2, 1]);
  const shtml = await (await stats(`?key=${"k".repeat(32)}&since=2020-01-01`)).text();
  check("HTML table, no anon ids in it", [shtml.includes("Receiver → sender (%)"), /anon_/.test(shtml)], [true, false]);

  out("\n11. Client pieces (source)");
  const cardJs = fs.readFileSync(path.join(ROOT, "public/card.js"), "utf8");
  check("card.js: the app's own anon id key, one open, taps by data-ev, beacon to the event route", [cardJs.includes('"rekomendr.client_id"'), cardJs.includes('send("open")'), cardJs.includes('closest("[data-ev]")'), cardJs.includes('"/api/card/event"')], [true, true, true, true]);
  const rsr = fs.readFileSync(path.join(ROOT, "src/components/RekSnapResults.tsx"), "utf8");
  check("name prompt copy is Brad's, verbatim", rsr.includes("Your name, so friends know it’s from you."), true);
  check("asked once: gated on senderNameAsked()", /if \(!senderNameAsked\(\) && share\.status !== "ready"\)/.test(rsr), true);
  check("'sent' only after the link actually left", /outcome === "shared" \|\| outcome === "copied" \|\| outcome === "manual"[\s\S]{0,120}recordCardSent/.test(rsr), true);
  check("the flip waits for the name save", rsr.includes("if (profileReady) await profileReady.catch"), true);

  out(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  process.stdout.write(`HARNESS CRASH: ${err?.stack ?? err}\n`);
  process.exit(1);
});
