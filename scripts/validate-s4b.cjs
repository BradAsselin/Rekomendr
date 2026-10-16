/* eslint-disable no-console */
//
// scripts/validate-s4b.cjs — S4b: the bridge from the card into the app.
//   Save on the card (a private copy, no sign-in) · open the card in the
//   app as the anchor · the iOS claim hand-off (signed, 7 days) · the
//   per-save manifest · add-to-home-screen after Save only · the whole
//   receiver → saver → sender loop, counted.
//
// Compiles the REAL routes and libs from source. Stubs TMDb (fetch),
// OpenAI moderation, next/og, and the Supabase service-role client (a small
// in-memory table engine). No keys, no network.
//
//   node scripts/validate-s4b.cjs
//
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const CACHE = path.join(ROOT, "node_modules", ".cache");
fs.mkdirSync(CACHE, { recursive: true });
const OUT = fs.mkdtempSync(path.join(CACHE, "s4b-validate-"));

console.log("Compiling /a/[id], /api/share, /api/card/{event,save,open,claim}, /api/manifest from source…");
execFileSync(
  "npx",
  [
    "tsc",
    "app/a/[id]/route.ts",
    "app/api/share/route.ts",
    "app/api/card/event/route.ts",
    "app/api/card/save/route.ts",
    "app/api/card/open/route.ts",
    "app/api/card/claim/route.ts",
    "app/api/manifest/route.ts",
    "src/lib/testReadout.ts",
    "--outDir", OUT,
    "--rootDir", ".",
    "--module", "commonjs",
    "--target", "es2020",
    "--moduleResolution", "node",
    "--esModuleInterop",
    "--skipLibCheck",
    "--jsx", "react-jsx",
    "--resolveJsonModule",
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
    if (process.env.S4B_VERBOSE) orig(...args);
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
const ai = { calls: 0 };
class FakeOpenAI {
  constructor() {
    this.moderations = {
      create: async () => {
        mod.calls++;
        if (mod.down) throw new Error("moderation unreachable");
        return { results: [{ flagged: mod.flagged }] };
      },
    };
    this.chat = { completions: { create: async () => { ai.calls++; throw new Error("no generation here"); } } };
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
process.env.MINT_SIGNING_SECRET = "s4a-secret"; // same name as s4a on purpose: section 1 swaps it

const page = require(path.join(OUT, "app/a/[id]/route.js"));
const shareRoute = require(path.join(OUT, "app/api/share/route.js"));
const eventRoute = require(path.join(OUT, "app/api/card/event/route.js"));
const saveRoute = require(path.join(OUT, "app/api/card/save/route.js"));
const openRoute = require(path.join(OUT, "app/api/card/open/route.js"));
const claimRoute = require(path.join(OUT, "app/api/card/claim/route.js"));
const manifestRoute = require(path.join(OUT, "app/api/manifest/route.js"));
const { signClaim, verifyClaim, CLAIM_WINDOW_MS } = require(path.join(OUT, "src/lib/claimToken.js"));
const { verifyAnchor, signAnchor } = require(path.join(OUT, "src/lib/mintToken.js"));
const { recordCardEvent } = require(path.join(OUT, "src/lib/cardEvents.js"));
const { computeReadout } = require(path.join(OUT, "src/lib/testReadout.js"));

const SENDER = "anon_s4b_sender_0001";
const RECEIVER = "anon_s4b_receiver_01";
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
const DAY = 86400e3;
const card = (over = {}) => {
  const r = {
    id: crypto.randomUUID(), client_id: SENDER, item_name: "Lioness", item_category: "tv",
    short_description: "Cruz Manuelos, a young Marine, is recruited to the CIA.",
    long_description: "A longer read.", mode: "similar", shared_at: iso(3 * DAY), revoked_at: null, created_at: iso(3 * DAY),
    sender_name: "Katrina", media_kind: "tv", media_id: 113962, poster_path: "/lioness.jpg", trailer_url: "https://www.youtube.com/watch?v=uEjcXhW7CXo",
    providers: { watch: { link: "https://tmdb/w", stream: [{ name: "Paramount Plus", url: "https://p" }], rentBuy: [] }, availability: null },
    providers_at: iso(1000),
    ...over,
  };
  db.anchor_snapshots.push(r);
  return r;
};
const post = async (route, body) => {
  const res = await route.POST(new Request("http://local/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
};
const src = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

(async () => {
  out("\n1. The claim (iOS separate-storage hand-off)");
  const c = signClaim(RECEIVER, "11111111-1111-4111-8111-111111111111");
  check("signs and verifies", verifyClaim(c), { clientId: RECEIVER, cardId: "11111111-1111-4111-8111-111111111111" });
  check("tampered body → refused", verifyClaim("x" + c), null);
  const [b, s] = c.split(".");
  check("tampered signature → refused", verifyClaim(`${b}.${s.slice(0, -2)}AA`), null);
  check("8 days old → refused (7-day window)", verifyClaim(signClaim(RECEIVER, "11111111-1111-4111-8111-111111111111", Date.now() - CLAIM_WINDOW_MS - 60e3)), null);
  check("from the future → refused", verifyClaim(signClaim(RECEIVER, "11111111-1111-4111-8111-111111111111", Date.now() + 3600e3)), null);
  const anchorTok = signAnchor({ name: "x", category: "tv", short: "s", long: null, clientId: RECEIVER });
  check("an anchor token can never pass as a claim", verifyClaim(`${anchorTok.sig}.${anchorTok.sig}`), null);
  process.env.MINT_SIGNING_SECRET = "a-different-secret";
  check("another secret → refused", verifyClaim(c), null);
  process.env.MINT_SIGNING_SECRET = "s4a-secret";
  let r = await post(claimRoute, { claim: c });
  check("/api/card/claim: valid → the saving browser's id + the card", [r.json.ok, r.json.clientId, r.json.card], [true, RECEIVER, "11111111-1111-4111-8111-111111111111"]);
  r = await post(claimRoute, { claim: "junk.junk" });
  check("/api/card/claim: junk → ok:false, logged", [r.json.ok, logged("[card-claim] refused")], [false, true]);

  out("\n2. Save on the card: a private copy under the receiver's id");
  db.card_events = [];
  const shared = card();
  r = await post(saveRoute, { card: shared.id, clientId: RECEIVER });
  const copy = db.anchor_snapshots.find((x) => x.client_id === RECEIVER && x.item_name === "Lioness");
  check("ok, new private row (not shared), with a claim", [r.json.ok, !!copy, copy?.shared_at ?? null, typeof r.json.claim], [true, true, null, "string"]);
  check("copy keeps the card's own text and media (no regeneration)", [copy.short_description, copy.long_description, copy.media_id, copy.poster_path], [shared.short_description, "A longer read.", 113962, "/lioness.jpg"]);
  check("'save' event recorded once, on the card that was saved", db.card_events.filter((e) => e.kind === "save").map((e) => [e.card_id, e.client_id]), [[shared.id, RECEIVER]]);
  check("claim names the receiver and the card", verifyClaim(r.json.claim), { clientId: RECEIVER, cardId: shared.id });
  r = await post(saveRoute, { card: shared.id, clientId: RECEIVER });
  check("save again → same row, no second event", [r.json.ok, r.json.already, r.json.id, db.card_events.filter((e) => e.kind === "save").length], [true, true, copy.id, 1]);
  r = await post(saveRoute, { card: shared.id, clientId: SENDER });
  check("the sender saving their own card → nothing copied", [r.json.ok, r.json.own], [true, true]);
  const priv = card({ shared_at: null });
  r = await post(saveRoute, { card: priv.id, clientId: RECEIVER });
  check("a private card can't be saved from outside", [r.json.ok, r.json.reason], [false, "card_not_public"]);
  const capper = "anon_s4b_capper_0001";
  for (let i = 0; i < 30; i++) db.anchor_snapshots.push({ id: crypto.randomUUID(), client_id: capper, item_name: `t${i}`, item_category: "tv", created_at: iso(1000), short_description: "", mode: "similar" });
  r = await post(saveRoute, { card: shared.id, clientId: capper });
  check("mint cap (30/day) applies", r.json.reason, "cap");
  r = await post(saveRoute, { card: "nope", clientId: RECEIVER });
  check("junk card id → 400", r.status, 400);
  const ev = await eventRoute.POST(new Request("http://local/x", { method: "POST", body: JSON.stringify({ kind: "save", card: shared.id, clientId: "anon_s4b_forger_001" }) }));
  check("a browser can't post a 'save' event", [ev.status, db.card_events.some((e) => e.client_id === "anon_s4b_forger_001"), logged("server_only")], [204, false, true]);

  out("\n3. Open the card in the app as the anchor");
  ai.calls = 0;
  r = await post(openRoute, { card: shared.id, clientId: RECEIVER });
  const a = r.json.anchor;
  check("SnapResult shape with the card's own text", [a.detected_item.name, a.detected_item.description, a.detected_item.category, a.mode, a.results.similar.length], ["Lioness", shared.short_description, "tv", "similar", 0]);
  check("token signed for THIS client (Save/Share/details work)", verifyAnchor({ name: "Lioness", category: "tv", short: shared.short_description, long: null, clientId: RECEIVER }, a.detected_item_token), true);
  check("…and not for anyone else", verifyAnchor({ name: "Lioness", category: "tv", short: shared.short_description, long: null, clientId: SENDER }, a.detected_item_token), false);
  check("media identity for the TMDb reks + live providers", [a.media.kind, a.media.id, a.media.watch.stream[0].name], ["tv", 113962, "Paramount Plus"]);
  check("no generation on open", ai.calls, 0);
  r = await post(openRoute, { card: priv.id, clientId: RECEIVER });
  check("private card → 404", r.status, 404);
  const wine = card({ item_name: "Bonanza Cabernet", item_category: "wine", media_kind: null, media_id: null, poster_path: null, providers: null });
  r = await post(openRoute, { card: wine.id, clientId: RECEIVER });
  check("wine → anchor without media (reks come from the chain re-roll)", [r.json.anchor.detected_item.name, !!r.json.anchor.media, !!r.json.anchor.detected_item_token], ["Bonanza Cabernet", false, true]);

  out("\n4. The manifest the home-screen icon is born with");
  const claimForShared = signClaim(RECEIVER, shared.id);
  let m = await (await manifestRoute.GET(new Request(`http://local/api/manifest?card=${shared.id}&claim=${encodeURIComponent(claimForShared)}`))).json();
  check("start_url opens onto the saved card with the claim", m.start_url, `/?card=${shared.id}&claim=${encodeURIComponent(claimForShared)}`);
  check("…everything else is the static manifest", [m.name, m.display, m.scope, m.id], ["Rekomendr", "standalone", "/", "/"]);
  m = await (await manifestRoute.GET(new Request("http://local/api/manifest?card=https://evil.example&claim=x"))).json();
  check("junk params → start_url '/' (no open redirect)", m.start_url, "/");

  out("\n5. The card page: Save + 'Snap your own →'");
  const res = await page.GET(new Request(`https://www.rekomendr.ai/a/${shared.id}`, { headers: { host: "www.rekomendr.ai" } }), { params: { id: shared.id } });
  const html = await res.text();
  check("Save links into the app with the card + save=1", html.includes(`<a class="save" href="/?card=${shared.id}&amp;save=1"`), true);
  check("Save sits in the top block, before the Watch action", html.indexOf('class="save"') > 0 && html.indexOf('class="save"') < html.indexOf('class="actions"'), true);
  check("'Snap your own →' at the bottom of the card", /<div class="own"><a href="\/">Snap your own →<\/a><\/div><\/article>/.test(html), true);
  check("the old brand CTA is gone", html.includes("Get reks for anything"), false);

  out("\n6. The whole loop, counted: receiver opens → saves → shares their own");
  db.card_events = [];
  const LOOPER = "anon_s4b_looper_0001"; // a receiver with nothing saved yet
  const loopCard = card();
  await recordCardEvent({ kind: "open", card: loopCard.id, clientId: LOOPER });
  await post(saveRoute, { card: loopCard.id, clientId: LOOPER });
  const mine = db.anchor_snapshots.filter((x) => x.client_id === LOOPER && x.item_name === "Lioness").pop();
  r = await post(shareRoute, { action: "share", clientId: LOOPER, id: mine.id });
  check("the receiver can share their saved copy", r.json.ok, true);
  const sent = await recordCardEvent({ kind: "sent", card: mine.id, clientId: LOOPER });
  check("their first own send is attributed to the card that brought them in", sent.detail.firstOwnShareVia, loopCard.id);
  await recordCardEvent({ kind: "standalone_launch", clientId: LOOPER });
  const ro = computeReadout(db.card_events.map((x) => ({ ...x })), iso(10 * DAY));
  check("readout: 1 receiver, 1 save, 1 install, receiver→sender 100%", [ro.unique_receivers, ro.saves, ro.installs, ro.receiver_to_sender_pct], [1, 1, 1, 100]);

  out("\n7. Client wiring (source)");
  const pg = src("app/page.tsx");
  check("adopts the claimed id only on a fresh install", /if \(!BOOT_HAD_CLIENT_ID\) \{\s*localStorage\.setItem\(CLIENT_ID_KEY, r\.clientId\)/.test(pg), true);
  check("claim redeemed BEFORE the launch is logged", pg.indexOf('"/api/card/claim"') < pg.indexOf('kind: "standalone_launch"'), true);
  check("standalone launch logged once per app session", pg.includes('sessionStorage.getItem("rekomendr.launch_logged")'), true);
  check("save=1 dropped from the URL after saving (a reload can't re-save)", /const next = `\/\?card=\$\{encodeURIComponent\(cardId\)\}\$\{claim \?/.test(pg), true);
  check("home-screen offer only after a Save, never standalone, respects snooze", pg.includes("if (anchor.saved && opts.save && !isStandalone() && !installOfferSnoozed()) setInstallOffer(true);"), true);
  check("setInstallOffer(true) appears nowhere else", (pg.match(/setInstallOffer\(true\)/g) || []).length, 1);
  const ib = src("src/components/InstallButton.tsx");
  check("header install button removed (capture-only, renders nothing)", [/return null;\s*\}\s*$/.test(ib.trim() + "\n"), ib.includes("<button")], [true, false]);
  check("…but the service worker still registers", ib.includes('navigator.serviceWorker.register("/sw.js")'), true);
  const coach = src("src/components/InstallCoach.tsx");
  check("iOS coach: Share → Add to Home Screen → Add, with the ⋯ note", [coach.includes("Tap Share"), coach.includes("Add to Home Screen</span>"), coach.includes(">Add</span>"), coach.includes("tap ⋯ first")], [true, true, true, true]);
  check("Android: the real install prompt", coach.includes("runInstallPrompt()"), true);
  const ip = src("src/lib/installPrompt.ts");
  const loadIP = () => {
    const m2 = {};
    const code = require("typescript").transpileModule(ip, { compilerOptions: { module: 1, target: 7 } }).outputText;
    new Function("exports", "navigator", "window", "localStorage", "document", code)(m2, globalThis.__nav, globalThis.__win, {}, {});
    return m2;
  };
  const uaCases = [
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", true],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1", false],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0", false],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36", false],
  ];
  const got = uaCases.map(([ua]) => {
    globalThis.__nav = { userAgent: ua, platform: "iPhone", maxTouchPoints: 5 };
    return loadIP().isIOSSafari();
  });
  check("iOS Safari only (not Chrome-iOS, not in-app browsers, not Android)", got, uaCases.map((u) => u[1]));
  globalThis.__nav = { userAgent: "x", platform: "x", standalone: true };
  globalThis.__win = { matchMedia: () => ({ matches: false }) };
  check("standalone detected via navigator.standalone (iOS)", (() => { const m3 = {}; const code = require("typescript").transpileModule(ip, { compilerOptions: { module: 1, target: 7 } }).outputText; new Function("exports", "navigator", "window", code)(m3, globalThis.__nav, globalThis.__win); return m3.isStandalone(); })(), true);

  out(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  process.stdout.write(`HARNESS CRASH: ${err?.stack ?? err}\n`);
  process.exit(1);
});
