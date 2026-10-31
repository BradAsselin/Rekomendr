/* eslint-disable no-console */
//
// scripts/validate-s34.cjs — S34 (Brad, 2026-10-31): the one silent retry
// on a reply that doesn't parse, extended from the chain (S33) to
//   1. the first read of a photo (whole photo, strips, typed bottle):
//      re-read once, not streamed, same input; a second miss is the
//      failure line as before;
//   2. the wine shelf read (shelf/bottle facts);
//   3. the wine picks — the card chain (steer) and the re-roll (set);
//   4. a poster/TV re-read still takes the TMDb path (from source).
// Every site logs the same way: warn "[tag] parse failed — retrying",
// info "[tag] parse retry succeeded", error "[tag] parse failed — giving
// up", each with attempt, of, chars, finishReason and the error.
//
// Compiles the REAL /api/reksnap route and wine libs. Stubs OpenAI by
// system prompt with a reply queue per call type. No keys, no network.
//
//   node scripts/validate-s34.cjs
//
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CACHE = path.join(ROOT, "node_modules", ".cache");
fs.mkdirSync(CACHE, { recursive: true });
const OUT = fs.mkdtempSync(path.join(CACHE, "s34-validate-"));

console.log("Compiling /api/reksnap and the wine libs from source…");
execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "tsc", "app/api/reksnap/route.ts", "src/lib/wineReks.ts", "src/lib/parseRetry.ts",
    "--outDir", OUT, "--rootDir", ".", "--module", "commonjs", "--target", "es2020",
    "--moduleResolution", "node", "--esModuleInterop", "--skipLibCheck", "--lib", "es2020,dom",
  ],
  { stdio: "inherit", cwd: ROOT, shell: process.platform === "win32" }
);

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
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

/* ---------------- OpenAI stub: a reply queue per call type ---------------- */
const SHELF = "You are reading a photo taken in a wine shop";
const WINE = "You are a taste-aware wine recommendation engine";
const q = { vision: [], shelf: [], wine: [] };
const calls = { vision: [], shelf: [], wine: [] };
const take = (k, dflt) => (q[k].length ? q[k].shift() : dflt);
const DEFAULT_SHELF = JSON.stringify({ scene: "other", bottles: [] });
const DEFAULT_WINE = JSON.stringify({ anchor: {}, reks: [] });
class FakeOpenAI {
  constructor() {
    this.moderations = { create: async () => ({ results: [{ flagged: false }] }) };
    this.chat = {
      completions: {
        create: async (req) => {
          const sys = String(req.messages?.[0]?.content || "");
          let text;
          if (sys.startsWith(SHELF)) {
            calls.shelf.push(req);
            text = take("shelf", DEFAULT_SHELF);
          } else if (sys.startsWith(WINE)) {
            calls.wine.push(req);
            text = take("wine", DEFAULT_WINE);
          } else if (req.response_format?.json_schema && !req.stream && /typed|wine/i.test(sys) && !sys.includes("detected_item")) {
            text = JSON.stringify({ specific: true, name: "Kim Crawford Sauvignon Blanc" });
          } else {
            calls.vision.push(req);
            text = take("vision", "{}");
          }
          if (req.stream) {
            return {
              async *[Symbol.asyncIterator]() {
                for (let i = 0; i < text.length; i += 50) yield { choices: [{ delta: { content: text.slice(i, i + 50) } }] };
                yield { choices: [{ delta: {}, finish_reason: "stop" }] };
              },
            };
          }
          return { choices: [{ message: { content: text }, finish_reason: "stop" }], usage: {} };
        },
      },
    };
  }
}
// The route's failure classifier checks these classes (src/lib/openaiFailure.ts).
FakeOpenAI.APIConnectionError = class extends Error {};
FakeOpenAI.APIConnectionTimeoutError = class extends Error {};
FakeOpenAI.APIError = class extends Error {};
require.cache[require.resolve("openai")] = {
  id: "openai", filename: "openai", loaded: true, exports: { __esModule: true, default: FakeOpenAI },
};

process.env.OPENAI_API_KEY = "stub";
process.env.MINT_SIGNING_SECRET = "s34-secret";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.TMDB_API_KEY;

const route = require(path.join(OUT, "app/api/reksnap/route.js"));
const post = async (body) => {
  const res = await route.POST(new Request("http://local/api/reksnap", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
  return { status: res.status, json: await res.json().catch(() => null) };
};
const logs = { info: [], warn: [], error: [] };
let saved = null;
const quiet = () => {
  logs.info.length = 0; logs.warn.length = 0; logs.error.length = 0;
  saved = [console.info, console.warn, console.error];
  console.info = (...a) => logs.info.push(a);
  console.warn = (...a) => logs.warn.push(a);
  console.error = (...a) => logs.error.push(a);
};
const loud = () => { [console.info, console.warn, console.error] = saved; };
const reset = () => { for (const k of Object.keys(calls)) { calls[k].length = 0; q[k].length = 0; } };
const tagged = (level, msg) => logs[level].filter((a) => a[0] === msg).map((a) => a[1]);
const shape = (d) => !!d && d.of === 2 && typeof d.chars === "number" && "finishReason" in d && typeof d.error === "string";

const ME = "anon_s34_client_0001";
const IMG = "data:image/jpeg;base64,AAAA";
const GARBAGE = "I'm sorry, I can't read the labels in this photo.";
const snapJson = (item) => JSON.stringify({
  detected_item: item,
  mode: "similar",
  results: { similar: [1, 2, 3, 4, 5].map((i) => ({ name: `${item.name} Sim ${i}`, description: "x", category: item.category })), uses: [], alternatives: [] },
});
const COFFEE = { name: "Stumptown Hair Bender", description: "Medium roast — cherry and dark chocolate.", category: "coffee" };
const WINE_ITEM = { name: "Kim Crawford Sauvignon Blanc", description: "Dry and zesty — grapefruit and cut grass.", category: "wine" };

(async () => {
  out("1. The first read of a photo");
  reset(); quiet();
  q.vision.push(GARBAGE, snapJson(COFFEE));
  const p1 = await post({ image: IMG, clientId: ME });
  loud();
  check("a bad first read, a good re-read → 200 with the re-read", [p1.status, p1.json?.detected_item?.name], [200, COFFEE.name]);
  check("…two reads: the first streamed, the re-read not, same input", [calls.vision.length, !!calls.vision[0]?.stream, !!calls.vision[1]?.stream, JSON.stringify(calls.vision[0]?.messages?.[1]) === JSON.stringify(calls.vision[1]?.messages?.[1])], [2, true, false, true]);
  const w1 = tagged("warn", "[snap-read] parse failed — retrying");
  check("…attempt 1 logged (warn, attempt photo), attempt 2 logged (info)", [w1.length === 1 && shape(w1[0]) && w1[0].attempt === 1 && w1[0].of === 2, tagged("info", "[snap-read] parse retry succeeded").length, tagged("error", "[snap-read] parse failed — giving up").length], [true, 1, 0]);
  check("…no read-failure line when the re-read works", logs.warn.some((a) => a[0] === "[snap-read-fail]"), false);

  reset(); quiet();
  q.vision.push(GARBAGE, GARBAGE);
  const p2 = await post({ image: IMG, clientId: ME });
  loud();
  check("two bad reads → the failure as before (502, strips asked for)", [p2.status, p2.json?.retry], [502, "strips"]);
  check("…exactly two reads", calls.vision.length, 2);
  check("…both attempts logged (warn 1, error 2) and the read-failure line", [
    tagged("warn", "[snap-read] parse failed — retrying").map((d) => d.attempt),
    tagged("error", "[snap-read] parse failed — giving up").map((d) => d.attempt),
    logs.warn.some((a) => a[0] === "[snap-read-fail]" && a[1].why === "unparseable"),
  ], [[1], [2], true]);

  reset(); quiet();
  q.vision.push(snapJson(COFFEE));
  const p3 = await post({ image: IMG, clientId: ME });
  loud();
  check("a good first read: one read, no retry logged", [p3.status, calls.vision.length, logs.warn.filter((a) => /parse failed/.test(a[0])).length], [200, 1, 0]);

  reset(); quiet();
  q.vision.push("nope", snapJson(COFFEE));
  const p4 = await post({ strips: [IMG, IMG], clientId: ME });
  loud();
  check("strips: a bad read, a good re-read → 200", [p4.status, calls.vision.length, tagged("warn", "[snap-read] parse failed — retrying")[0]?.attempt], [200, 2, 1]);
  check("…logged as the strips read", tagged("info", "[snap-read] parse retry succeeded")[0]?.attempt, 2);

  out("\n2. The wine shelf read");
  const SHELF_OK = JSON.stringify({
    scene: "shelf",
    anchor_price: null,
    bottles: [
      { name: "Oyster Bay Sauvignon Blanc", price: 12.99 },
      { name: "Kim Crawford Sauvignon Blanc", price: 14.99 },
      { name: "Matua Sauvignon Blanc", price: 10.99 },
    ],
  });
  const PICKS = (n) => JSON.stringify({
    anchor: { price_usd: 15, dry_sweet: 2, light_bold: 2 },
    reks: [1, 2, 3, 4, 5].map((i) => ({ name: `${n} Pick ${i} Sauvignon Blanc`, description: "Dry and bright.", category: "wine", price_usd: 14, dry_sweet: 2, light_bold: 2 })),
  });
  reset(); quiet();
  q.vision.push(snapJson(WINE_ITEM));
  q.shelf.push("not json at all", SHELF_OK);
  q.wine.push(PICKS("First"));
  const s1 = await post({ image: IMG, clientId: ME, category: "Wine", wineVisit: { seen: [], rejected: [], goTo: null } });
  loud();
  check("a bad shelf read, a good re-read → the shelf facts ship", [s1.status, (s1.json?.wine?.shelf || []).map((b) => b.name).length, calls.shelf.length], [200, 3, 2]);
  check("…both attempts logged under [wine-shelf]", [
    shape(tagged("warn", "[wine-shelf] parse failed — retrying")[0]),
    tagged("info", "[wine-shelf] parse retry succeeded").length,
  ], [true, 1]);

  reset(); quiet();
  q.vision.push(snapJson(WINE_ITEM));
  q.shelf.push("nope", "nope");
  q.wine.push(PICKS("Second"));
  const s2 = await post({ image: IMG, clientId: ME, category: "Wine", wineVisit: { seen: [], rejected: [], goTo: null } });
  loud();
  check("two bad shelf reads → the snap ships without shelf facts, as before", [s2.status, calls.shelf.length, (s2.json?.wine?.shelf || []).length], [200, 2, 0]);
  check("…logged: warn 1, error 2, then the fail-soft line", [
    tagged("warn", "[wine-shelf] parse failed — retrying").map((d) => d.attempt),
    tagged("error", "[wine-shelf] parse failed — giving up").map((d) => d.attempt),
    logs.warn.some((a) => a[0] === "[wine] shelf read failed — no shelf facts this snap"),
  ], [[1], [2], true]);

  out("\n3. The wine picks: card chain and re-roll");
  const first = s1.json;
  const base = { detectedItem: first.detected_item, token: first.detected_item_token, clientId: ME, shelf: first.wine?.shelf ?? [], shelfSnap: true, anchorPrice: 14.99, anchorPriceSource: "tag", seen: [], rejected: [], goTo: null };
  for (const [label, extra] of [
    ["card chain", { kind: "steer", chained: { name: "First Pick 1 Sauvignon Blanc", description: "Dry and bright." }, kept: [] }],
    ["re-roll", { kind: "set", kept: [] }],
  ]) {
    reset(); quiet();
    q.wine.push("{ broken", PICKS(label === "re-roll" ? "Reroll" : "Chain"));
    const r = await post({ wine: { ...base, ...extra } });
    loud();
    check(`${label}: a bad reply, a good one → 200 with the good set`, [r.status, calls.wine.length, (r.json?.reks || []).length > 0], [200, 2, true]);
    const w = tagged("warn", "[wine] parse failed — retrying");
    check(`${label}: logged under [wine] with its kind (warn 1, info 2)`, [w.length === 1 && shape(w[0]) && w[0].kind === extra.kind && w[0].attempt === 1, tagged("info", "[wine] parse retry succeeded").map((d) => d.attempt)], [true, [2]]);

    reset(); quiet();
    q.wine.push("{ broken", "{ broken");
    const bad = await post({ wine: { ...base, ...extra } });
    loud();
    check(`${label}: two bad replies → the failure as before, exactly two tries`, [bad.status >= 500, calls.wine.length], [true, 2]);
    check(`${label}: both attempts logged`, [
      tagged("warn", "[wine] parse failed — retrying").map((d) => d.attempt),
      tagged("error", "[wine] parse failed — giving up").map((d) => d.attempt),
    ], [[1], [2]]);
  }

  out("\n4. From source");
  const src = read("app/api/reksnap/route.ts");
  check("the re-read uses the first read's own input and the vision prompt", /user: readContent \?\? ""/.test(src) && /system: SYSTEM_PROMPT,\s*user: readContent \?\? ""/.test(src), true);
  check("each first-read branch records its input (typed, strips, photo)", [
    /readContent = typedUser;/.test(src),
    /readContent = \[\s*\{ type: "text", text: stripsNote/.test(src),
    /readContent = priorBlock/.test(src),
  ], [true, true, true]);
  check("the typed re-read runs at the typed path's own 0.3", /readContent = typedUser;[^]*?readTemperature = 0\.3;/.test(src), true);
  check("a re-read poster or TV screen still takes the TMDb path", /read\.attempt > 1 && !typed && strips\.length === 0[^]*?tryMediaSnap\(parsed\.detected_item/.test(src), true);
  check("the chain uses the same helper (S33's log lines unchanged)", /parseWithRetry\("chain", \{ kind \}/.test(src), true);
  const wr = read("src/lib/wineReks.ts");
  check("the wine picks and the shelf read use it too", [/parseWithRetry\("wine", \{ kind: ctx\.kind \}/.test(wr), /parseWithRetry\(\s*"wine-shelf"/.test(wr)], [true, true]);

  out(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  if (saved) loud();
  console.error(e);
  process.exit(1);
});
