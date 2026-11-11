/* eslint-disable no-console */
//
// scripts/validate-s40.cjs — S40 Measure (docs/2026-11-10_measure_launch.md).
//   1. Weeks: Monday start, New York; empty weeks are zeros.
//   2. Block 1 (cards) against a hand count, everyone and outside the house.
//   3. Block 2 (quality) against a hand count, by lane.
//   4. Block 3 (use) against a hand count; the nudge has no outside view.
//   5. /api/signals "measure": allow-lists, nothing else stored; the
//      Compare to event carries only kind and category (+ the device id
//      every signal carries); nudge rows hold no device.
//   6. Server counters: parse retry, retry failure, 5xx and throws.
//   7. /api/stats: wrong or missing key → 404; zeros not errors; labels.
//   8. "Did you watch one of these?": 3 h–7 d window, never twice,
//      Movies/TV only, enough posters, none watched; approved wording only.
// No keys, no network.
//
//   node scripts/validate-s40.cjs
//
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
  process.stdout.write(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)}, expected ${JSON.stringify(want)})`}\n`);
}
const out = (s) => process.stdout.write(s + "\n");

function makeLoader(stubs = {}) {
  const cache = {};
  const load = (file) => {
    if (cache[file]) return cache[file].exports;
    const src = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true, jsx: ts.JsxEmit.React },
    }).outputText;
    const m = { exports: {} };
    cache[file] = m;
    new Function("module", "exports", "require", src)(m, m.exports, (id) => {
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

// A Supabase-shaped stub: select/eq/gte/order/range/limit, thenable, and
// insert into an in-memory table.
function stubStore(tables) {
  return {
    from(t) {
      const filters = [];
      let lo = 0;
      let hi = Infinity;
      const rows = () =>
        (tables[t] ?? []).filter((r) => filters.every((f) => f(r))).slice(lo, hi === Infinity ? undefined : hi + 1);
      const b = {
        select: () => b,
        eq: (c, v) => (filters.push((r) => r[c] === v), b),
        is: () => b,
        gte: (c, v) => (filters.push((r) => String(r[c]) >= String(v)), b),
        order: () => b,
        limit: () => b,
        range: (a, z) => ((lo = a), (hi = z), b),
        then: (res, rej) => Promise.resolve({ data: rows(), error: null }).then(res, rej),
        insert: async (row) => ((tables[t] ??= []).push(row), { error: null }),
      };
      return b;
    },
  };
}

(async () => {
  const R = makeLoader()("src/lib/measureReadout.ts");

  out("1. Weeks (Monday, New York)");
  check("Tue 2026-11-10 → week of Mon 11-09", R.weekOf("2026-11-10T20:00:00Z"), "2026-11-09");
  check("Sun 22:00 New York (Mon 03:00 UTC) stays in the week before", R.weekOf("2026-11-09T03:00:00Z"), "2026-11-02");
  check("Mon 00:30 New York starts the week", R.weekOf("2026-11-09T05:30:00Z"), "2026-11-09");
  check("across the DST change (Sun 11-01 in EDT→EST)", R.weekOf("2026-11-01T12:00:00Z"), "2026-10-26");
  check("weeks from 10-16 to 11-10, newest first", R.weeksBetween("2026-10-16", Date.parse("2026-11-10T20:00:00Z")), ["2026-11-09", "2026-11-02", "2026-10-26", "2026-10-19", "2026-10-12"]);
  check("nearest-rank percentiles", [R.percentile([1000, 3000, 2000], 0.5), R.percentile([1000, 3000, 2000], 0.9), R.percentile([], 0.5)], [2000, 3000, null]);

  out("2. Block 1 — THE TEST (cards), hand count");
  const H = "anon_house_aaaaaaaa";
  const cards = [
    { card_id: "c1", client_id: H, kind: "sent", is_sender: null, created_at: "2026-10-20T15:00:00Z" },
    { card_id: "c1", client_id: H, kind: "sent", is_sender: null, created_at: "2026-10-21T15:00:00Z" },
    { card_id: "c1", client_id: H, kind: "open", is_sender: true, created_at: "2026-10-20T15:01:00Z" },
    { card_id: "c1", client_id: "anon_r1_xxxxxxxx", kind: "open", is_sender: false, created_at: "2026-10-20T18:00:00Z" },
    { card_id: "c2", client_id: "anon_r1_xxxxxxxx", kind: "sent", is_sender: null, created_at: "2026-10-27T15:00:00Z" },
    { card_id: "c1", client_id: "anon_r2_xxxxxxxx", kind: "open", is_sender: false, created_at: "2026-10-22T12:00:00Z" },
    { card_id: "c2", client_id: "anon_u1_xxxxxxxx", kind: "open", is_sender: false, created_at: "2026-10-28T12:00:00Z" },
    { card_id: "c3", client_id: "anon_u1_xxxxxxxx", kind: "sent", is_sender: null, created_at: "2026-10-29T12:00:00Z" },
    { card_id: "c3", client_id: "anon_r3_xxxxxxxx", kind: "open", is_sender: false, created_at: "2026-11-09T03:00:00Z" },
    { card_id: "c9", client_id: "anon_agent_s40", kind: "sent", is_sender: null, created_at: "2026-10-20T15:00:00Z" },
    { card_id: "c9", client_id: "anon_agent_s40b", kind: "open", is_sender: false, created_at: "2026-10-20T16:00:00Z" },
    { card_id: "c0", client_id: "anon_old_xxxxxxx", kind: "sent", is_sender: null, created_at: "2026-10-10T16:00:00Z" },
  ];
  const usage = [
    { client_id: "anon_u1_xxxxxxxx", route: "openai", created_at: "2026-10-01T12:00:00Z" },
    { client_id: "anon_r1_xxxxxxxx", route: "openai", created_at: "2026-10-20T18:05:00Z" },
  ];
  const now1 = Date.parse("2026-11-10T20:00:00Z");
  const b1 = R.computeBlock1(cards, usage, { since: "2026-10-16", now: now1, exclude: new Set() });
  const col = (b, k) => Object.fromEntries(Object.entries(b).map(([w, v]) => [w, v[k]]));
  check("cards shared, once per card, week of first share (c0 before 10-16 left out)", col(b1, "cards_shared"), { "2026-11-09": 0, "2026-11-02": 0, "2026-10-26": 2, "2026-10-19": 1, "2026-10-12": 0 });
  check("cards opened by another device (sender's own open and agents left out)", col(b1, "cards_opened_by_other"), { "2026-11-09": 0, "2026-11-02": 1, "2026-10-26": 1, "2026-10-19": 1, "2026-10-12": 0 });
  check("receiving devices: first event is someone else's card (u1 searched first)", col(b1, "receiving_devices"), { "2026-11-09": 0, "2026-11-02": 1, "2026-10-26": 0, "2026-10-19": 2, "2026-10-12": 0 });
  check("receivers who made their own (r1)", col(b1, "receivers_made_own"), { "2026-11-09": 0, "2026-11-02": 0, "2026-10-26": 0, "2026-10-19": 1, "2026-10-12": 0 });
  check("…as a share of receiving devices", col(b1, "receivers_made_own_pct"), { "2026-11-09": null, "2026-11-02": 0, "2026-10-26": null, "2026-10-19": 50, "2026-10-12": null });
  const b1o = R.computeBlock1(cards, usage, { since: "2026-10-16", now: now1, exclude: new Set([H]) });
  check("outside the house: the house's share of c1 drops out", col(b1o, "cards_shared")["2026-10-19"], 0);
  check("outside the house: receivers unchanged (none is a house device)", col(b1o, "receiving_devices"), col(b1, "receiving_devices"));
  const b1a = R.computeBlock1(cards, usage, { since: "2026-10-16", now: now1, exclude: new Set(), agentsOnly: true });
  check("agents=1 counts agents only", [col(b1a, "cards_shared")["2026-10-19"], col(b1a, "receiving_devices")["2026-10-19"]], [1, 1]);
  const empty1 = R.computeBlock1([], [], { since: "2026-10-16", now: now1, exclude: new Set() });
  check("no data → every week zeros", Object.values(empty1).every((w) => w.cards_shared === 0 && w.receiving_devices === 0), true);

  out("3. Block 2 — Quality, hand count");
  const now2 = Date.parse("2026-11-17T15:00:00Z");
  const m = (kind, lane, extra = {}, at = "2026-11-10T15:00:00Z") => ({ kind, lane, origin: null, category: null, picks: null, ms: null, client_id: null, created_at: at, ...extra });
  const q = [
    m("search", "search", { picks: 5, ms: 1000, client_id: "anon_x_xxxxxxxxx", origin: "voice", category: "movies" }),
    m("search", "search", { picks: 3, ms: 3000, client_id: "anon_x_xxxxxxxxx", origin: "typed", category: "tv" }),
    m("search", "search", { picks: 5, ms: 2000, client_id: H, origin: "chips", category: "movies" }),
    m("search", "snap", { picks: 4, ms: 9000, client_id: "anon_x_xxxxxxxxx", origin: "snap", category: "movies" }),
    m("search", "wine", { picks: 5, ms: 4000, client_id: "anon_x_xxxxxxxxx", origin: "snap", category: "wine" }, "2026-11-16T15:00:00Z"),
    m("search", "search", { picks: 1, ms: 99, client_id: "anon_agent_s40", origin: "typed", category: "movies" }),
    m("retry", "search"),
    m("retry_failed", "search"),
    m("late", "search"),
    m("error", "snap"),
  ];
  const b2 = R.computeBlock2(q, { since: "2026-11-10", now: now2 });
  check("weeks", Object.keys(b2), ["2026-11-16", "2026-11-09"]);
  check("search lane, week of 11-09", b2["2026-11-09"].search, { sets: 3, under_five: 1, median_ms: 2000, p90_ms: 3000, retries: 1, retries_failed: 1, gave_up: 1, server_errors: 0 });
  check("snap lane, week of 11-09", b2["2026-11-09"].snap, { sets: 1, under_five: 1, median_ms: 9000, p90_ms: 9000, retries: 0, retries_failed: 0, gave_up: 0, server_errors: 1 });
  check("wine lane, empty week → zeros and no times", b2["2026-11-09"].wine, { sets: 0, under_five: 0, median_ms: null, p90_ms: null, retries: 0, retries_failed: 0, gave_up: 0, server_errors: 0 });
  check("wine lane, week of 11-16", [b2["2026-11-16"].wine.sets, b2["2026-11-16"].wine.under_five, b2["2026-11-16"].wine.median_ms], [1, 0, 4000]);

  out("4. Block 3 — Use, hand count");
  const q3 = [
    ...q,
    m("compare_on", null, { category: "tv", client_id: "anon_x_xxxxxxxxx" }),
    m("compare_on", null, { category: "movies", client_id: "anon_x_xxxxxxxxx" }),
    m("compare_on", null, { category: "wine", client_id: H }),
    m("nudge_asked", null),
    m("nudge_asked", null),
    m("nudge_poster", null),
    m("nudge_not_yet", null),
  ];
  const u3 = [
    { client_id: H, route: "openai", created_at: "2026-11-10T14:00:00Z" },
    { client_id: "anon_y_xxxxxxxxx", route: "reksnap-vision", created_at: "2026-11-11T14:00:00Z" },
    { client_id: "anon_z_xxxxxxxxx", route: "signals", created_at: "2026-11-11T14:00:00Z" },
    { client_id: "anon_agent_s40", route: "openai", created_at: "2026-11-11T14:00:00Z" },
    { client_id: "anon_w_xxxxxxxxx", route: "openai", created_at: "2026-11-08T14:00:00Z" },
  ];
  const b3 = R.computeBlock3(q3, u3, { since: "2026-11-10", now: now2, exclude: new Set() });
  const w = b3["2026-11-09"];
  check("active devices: H (search), x (searches), y (snap); signals-only z, agents and before-11-10 w left out", w.active_devices, 3);
  check("searches by how they started", [w.searches, w.by_voice, w.by_typed, w.by_chips, w.by_snap, w.by_mlt], [4, 1, 1, 1, 1, 0]);
  check("categories", [w.cat_movies, w.cat_tv, w.cat_books, w.cat_wine, w.cat_other], [3, 1, 0, 0, 0]);
  check("Compare to switched on: times, distinct devices", [w.compare_on, w.compare_on_devices], [3, 2]);
  check("asked, answered with a poster, Not yet", [w.asked, w.asked_poster, w.asked_not_yet], [2, 1, 1]);
  const b3o = R.computeBlock3(q3, u3, { since: "2026-11-10", now: now2, exclude: new Set([H]) })["2026-11-09"];
  check("outside the house: H drops out", [b3o.active_devices, b3o.searches, b3o.compare_on, b3o.compare_on_devices], [2, 3, 2, 1]);
  check("outside the house: the nudge has no device → —", [b3o.asked, b3o.asked_poster, b3o.asked_not_yet], [null, null, null]);
  check("the week of 11-16 shows the wine search", [b3["2026-11-16"].searches, b3["2026-11-16"].cat_wine], [1, 1]);
  const e3 = R.computeBlock3([], [], { since: "2026-11-10", now: now2, exclude: new Set() });
  check("no data → zeros", Object.values(e3).every((x) => x.searches === 0 && x.active_devices === 0 && x.asked === 0), true);
  check("house lines: first eight characters and activity", R.houseLines([H], cards, usage, "2026-10-16"), [{ id8: "anon_hou", rows: 3, last: "2026-10-21" }]);

  out("5. /api/signals \"measure\" — allow-lists, nothing else stored");
  const { measureRow } = makeLoader()("src/lib/measureRow.ts");
  const CID = "anon_agent_s40_dev";
  check("compare_on → kind, category, device only (a title in the body is dropped)", measureRow({ event: "compare_on", category: "tv", title: "Severance", name: "Brad" }, CID), { kind: "compare_on", category: "tv", client_id: CID });
  check("compare_on with a title as category → refused", measureRow({ event: "compare_on", category: "Severance" }, CID), null);
  check("search → only the allow-listed fields", measureRow({ event: "search", origin: "voice", category: "movies", lane: "search", picks: 5, ms: 1234, words: "a cozy mystery" }, CID), { kind: "search", origin: "voice", category: "movies", lane: "search", picks: 5, ms: 1234, client_id: CID });
  check("search with 6 picks → refused", measureRow({ event: "search", origin: "voice", category: "movies", lane: "search", picks: 6, ms: 1 }, CID), null);
  check("nudge rows hold no device", [measureRow({ event: "nudge_asked" }, CID), measureRow({ event: "nudge_not_yet", title: "x" }, CID)], [{ kind: "nudge_asked" }, { kind: "nudge_not_yet" }]);
  check("server kinds can't be sent by a client", [measureRow({ event: "retry" }, CID), measureRow({ event: "error" }, CID)], [null, null]);

  const sent = [];
  const memStore = {};
  global.window = { localStorage: { getItem: (k) => memStore[k] ?? null, setItem: (k, v) => (memStore[k] = String(v)), removeItem: (k) => delete memStore[k] } };
  global.localStorage = global.window.localStorage;
  memStore["rekomendr.client_id"] = CID;
  global.fetch = async (url, init) => (sent.push([url, JSON.parse(init.body)]), { ok: true, status: 200, json: async () => ({ ok: true }) });
  const MC = makeLoader()("src/lib/measureClient.ts");
  MC.sendMeasure({ event: "compare_on", category: "tv" });
  await new Promise((r) => setTimeout(r, 5));
  check("the Compare to event's payload: device id, kind, event, category — nothing else", sent[0], ["/api/signals", { clientId: CID, kind: "measure", event: "compare_on", category: "tv" }]);
  MC.sendMeasure({ event: "nudge_not_yet" });
  await new Promise((r) => setTimeout(r, 5));
  check("\"Not yet\" sends only its count", sent[1], ["/api/signals", { clientId: CID, kind: "measure", event: "nudge_not_yet" }]);
  MC.measureSearchOnce("e1", "chips", "TV Shows", 4, new Date(Date.now() - 2500).toISOString());
  MC.measureSearchOnce("e1", "chips", "TV Shows", 5, new Date().toISOString());
  await new Promise((r) => setTimeout(r, 5));
  const s2 = sent[2][1];
  check("a search is sent once per entry (its fill-in is the same search)", sent.length, 3);
  check("…with origin, category, lane, picks and ms only", [Object.keys(s2).sort(), s2.origin, s2.category, s2.lane, s2.picks, s2.ms >= 2400 && s2.ms < 10000], [["category", "clientId", "event", "kind", "lane", "ms", "origin", "picks"], "chips", "tv", "search", 4, true]);
  check("lanes: a wine search is wine wherever it started; a snap is snap", [MC.measureLane("typed", "wine"), MC.measureLane("snap", "movies"), MC.measureLane("mlt", "books")], ["wine", "snap", "search"]);
  check("the client never names a title in a measure body (source)", /title|label|said|words/.test(read("src/lib/measureClient.ts").split("export type MeasureBody")[1].split(";")[0]), false);

  out("6. Server counters — retries and errors");
  const savedWindow = global.window;
  delete global.window;
  const tables = { measure_events: [] };
  const measure = makeLoader()("src/lib/measure.ts");
  measure.__setMeasureStore(stubStore(tables));
  const PR = makeLoader({ "./measure": measure })("src/lib/parseRetry.ts");
  let n = 0;
  const flaky = async () => ({ text: n++ === 0 ? "not json" : "[1]" });
  await PR.parseWithRetry("search", {}, flaky, flaky, (t) => JSON.parse(t));
  check("a retry that succeeds → one retry row (lane, no device)", tables.measure_events, [{ kind: "retry", lane: "search" }]);
  const bad = async () => ({ text: "nope" });
  await PR.parseWithRetry("wine-shelf", {}, bad, bad, (t) => JSON.parse(t));
  check("a retry that still fails → retry + retry_failed (wine)", tables.measure_events.slice(1), [{ kind: "retry", lane: "wine" }, { kind: "retry_failed", lane: "wine" }]);
  tables.measure_events.length = 0;
  await measure.countErrors("search", async () => new Response("ok"))(new Request("https://x"));
  await measure.countErrors("snap", async () => new Response("x", { status: 502 }))(new Request("https://x"));
  let threw = false;
  await measure.countErrors("search", async () => { throw new Error("boom"); })(new Request("https://x")).catch(() => (threw = true));
  check("a 5xx and a throw are counted; a 200 is not; the throw still throws", [tables.measure_events, threw], [[{ kind: "error", lane: "snap" }, { kind: "error", lane: "search" }], true]);
  measure.__setMeasureStore(null);
  check("no store → the counter answers false, never throws", await measure.recordServer("retry", "search"), false);
  check("every retry tag has a lane", ["search", "snap-read", "backfill", "detail", "chain", "typed-wine", "wine-shelf", "wine"].map(measure.laneForTag).every(Boolean), true);
  const tags = [...read("app/api/reksnap/route.ts").matchAll(/parseWithRetry\(\s*"([^"]+)"/g), ...read("app/api/openai/route.ts").matchAll(/parseWithRetry\(\s*"([^"]+)"/g), ...read("src/lib/wineReks.ts").matchAll(/parseWithRetry\(\s*"([^"]+)"/g)].map((x) => x[1]);
  check(`every parseWithRetry tag in the code is mapped (${tags.length})`, tags.filter((t) => !measure.laneForTag(t)), []);
  for (const f of ["openai", "slots", "anchor", "mood", "screen"]) check(`${f}: POST is wrapped in countErrors`, /countErrors\("(search|snap)"/.test(read(`app/api/${f}/route.ts`)), true);
  check("reksnap: 5xx counted on both answers (JSON and ndjson)", (read("app/api/reksnap/route.ts").match(/if \(res\.status >= 500\) await recordServer\("error", lane\)/g) || []).length, 2);
  check("openai: a backfill landing after 90 s is counted as gave up", /useJson && Date\.now\(\) - t0 >= CLIENT_ABORT_MS\) await recordServer\("late", "search"\)/.test(read("app/api/openai/route.ts")), true);

  out("7. /api/stats");
  const statsTables = {
    card_events: cards,
    api_usage: usage,
    measure_events: [],
    house_devices: [{ client_id: H }],
    user_likes: [], wine_marks: [], go_tos: [], goto_events: [], voice_moods: [], voice_events: [],
  };
  const route = makeLoader({
    "../../../src/lib/envCheck": { runEnvCheck() {} },
    "../../../src/lib/anchorSnapshots": { getSnapshotStore: async () => stubStore(statsTables) },
  })("app/api/stats/route.ts");
  delete process.env.STATS_KEY;
  check("no STATS_KEY set → 404", (await route.GET(new Request("https://x/api/stats?key=anything"))).status, 404);
  process.env.STATS_KEY = "right-key";
  check("wrong key → 404", (await route.GET(new Request("https://x/api/stats?key=wrong-key"))).status, 404);
  check("missing key → 404", (await route.GET(new Request("https://x/api/stats"))).status, 404);
  const res = await route.GET(new Request("https://x/api/stats?key=right-key"));
  const html = await res.text();
  check("right key → 200", res.status, 200);
  check("the existing readout is still there", /Cards sent/.test(html) && /Receivers who sent their own/.test(html) && /Watched/.test(html), true);
  check("the three blocks are there", [/<h2>THE TEST \(cards\)<\/h2>/.test(html), /<h2>Quality<\/h2>/.test(html), /<h2>Use<\/h2>/.test(html)], [true, true, true]);
  check("renamed: \"Voice: cards with no tap\" and \"Voice: no tap (%)\"", [/Voice: cards with no tap/.test(html), /Voice: no tap \(%\)/.test(html), /ignored/.test(html)], [true, true, false]);
  check("no measure rows → zeros, not an error", /Result sets shown<\/td><td>0<\/td><td>0<\/td><td>0<\/td>/.test(html), true);
  check("house devices shown by first eight characters only", [/anon_hou…<\/b>/.test(html), html.includes(H)], [true, false]);
  check("the Session 38 note", /Device counts before 2026-11-10 are overstated/.test(html), true);
  const json = await (await route.GET(new Request("https://x/api/stats?key=right-key&format=json"))).json();
  check("JSON carries the blocks", [!!json.measure.block1, !!json.measure.block2, !!json.measure.block3], [true, true, true]);
  const broken = makeLoader({
    "../../../src/lib/envCheck": { runEnvCheck() {} },
    "../../../src/lib/anchorSnapshots": { getSnapshotStore: async () => ({ from: (t) => (["measure_events", "house_devices"].includes(t) ? { select: () => { throw new Error("relation does not exist"); } } : stubStore(statsTables).from(t)) }) },
  })("app/api/stats/route.ts");
  const bres = await broken.GET(new Request("https://x/api/stats?key=right-key"));
  const bhtml = await bres.text();
  check("tables not there yet → page still 200, blocks say unavailable", [bres.status, /Unavailable right now/.test(bhtml), /House devices: unavailable/.test(bhtml)], [200, true, true]);

  out("8. \"Did you watch one of these?\"");
  global.window = savedWindow;
  const WA = makeLoader()("src/lib/watchAsk.ts");
  const H_ = 3600_000;
  const now8 = Date.parse("2026-11-10T20:00:00Z");
  const pick = (t, poster = true) => ({ title: t, year: 2020, tmdbId: 1, posterPath: poster ? `/${t}.jpg` : null, category: "Movies" });
  const entry = (id, ageH, extra = {}) => ({ id, kind: "voice", label: "x", category: "Movies", at: new Date(now8 - ageH * H_).toISOString(), picks: ["A", "B", "C", "D", "E"].map((t) => pick(id + t)), restore: { lane: "search" }, facts: {}, ...extra });
  check("2 h old → not asked", WA.askCandidate([entry("e", 2)], now8, []), null);
  check("4 h old → asked, five posters", WA.askCandidate([entry("e", 4)], now8, [])?.picks.length, 5);
  check("8 days old → not asked", WA.askCandidate([entry("e", 24 * 8)], now8, []), null);
  check("exactly 7 days → still asked; just over → not", [!!WA.askCandidate([entry("e", 24 * 7)], now8, []), WA.askCandidate([entry("e", 24 * 7 + 0.01)], now8, [])], [true, null]);
  check("already asked → never twice", WA.askCandidate([entry("e", 4)], now8, ["e"]), null);
  check("the newest Movies/TV search is the one asked about", WA.askCandidate([entry("old", 30), entry("new", 5)], now8, [])?.entryId, "new");
  check("the newest Movies/TV search is under 3 h → nothing (no reaching back)", WA.askCandidate([entry("old", 30), entry("new", 1)], now8, []), null);
  check("wine and books are never asked about", [WA.askCandidate([entry("w", 4, { category: "Wine" })], now8, []), WA.askCandidate([entry("b", 4, { category: "Books" })], now8, [])], [null, null]);
  check("TV Shows is asked about", !!WA.askCandidate([entry("t", 4, { category: "TV Shows" })], now8, []), true);
  check("fewer than three posters → not asked", WA.askCandidate([entry("p", 4, { picks: [pick("a"), pick("b"), pick("c", false), pick("d", false)] })], now8, []), null);
  check("a pick already marked Watched → not asked", WA.noneWatched(entry("e", 4), ["eC"]), false);
  check("none watched → asked", WA.noneWatched(entry("e", 4), ["something else"]), true);
  WA.rememberAsked("e9");
  check("asked ids remembered on the device", WA.askedIds(), ["e9"]);

  const sos = read("src/components/SayOrSnap.tsx");
  check("approved wording only", [/export const ASK_LINE = 'Did you watch one of these\?';/.test(sos), /export const ASK_NOT_YET = 'Not yet';/.test(sos)], [true, true]);
  check("\"Not yet\" sends only nudge_not_yet", /sendMeasure\(\{ event: 'nudge_not_yet' \}\);\s*end\(\);/.test(sos), true);
  check("a poster tap writes the Watched mark (the same hook as the Watched button)", /marks\.toggle\(\{ title: p\.title/.test(sos) && /useWatchedMarks\(\)/.test(sos), true);
  check("the ask is remembered before it shows (never twice)", sos.indexOf("rememberAsked(cand.entryId)") < sos.indexOf("setAsk(cand)"), true);
  check("posters hidden → no ask", /postersHidden\(\)\) return;/.test(sos), true);

  out(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  out("CRASH " + (e && e.stack ? e.stack : e));
  process.exit(1);
});
