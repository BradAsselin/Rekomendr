/* eslint-disable no-console */
//
// scripts/validate-s35.cjs — S35 (Brad, 2026-10-31): the one silent retry
// on a reply that doesn't parse (src/lib/parseRetry.ts), extended to the
// last four calls that failed on one bad reply:
//   1. the snap thumbs-down replacement (backfill, non-wine);
//   2. Show details (anchorDetail);
//   3. the typed-wine check (does the typed text name a wine?);
//   4. the search lane's picks (/api/openai prompt mode) — judged with
//      the engine's own reader (src/lib/jsonArray.ts).
// Each logs the same way: warn "[tag] parse failed — retrying", info
// "[tag] parse retry succeeded", error "[tag] parse failed — giving up".
// A second miss fails exactly as one miss did before.
//
// Compiles the REAL routes. Stubs OpenAI by system prompt with a reply
// queue per call type. No keys, no network.
//
//   node scripts/validate-s35.cjs
//
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CACHE = path.join(ROOT, "node_modules", ".cache");
fs.mkdirSync(CACHE, { recursive: true });
const OUT = fs.mkdtempSync(path.join(CACHE, "s35-validate-"));

console.log("Compiling /api/reksnap and /api/openai from source…");
execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "tsc", "app/api/reksnap/route.ts", "app/api/openai/route.ts", "src/lib/parseRetry.ts", "src/lib/jsonArray.ts",
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
const KINDS = {
  backfill: "You are a taste-aware recommendation engine. The user snapped a photo, the item below was detected, and they dismissed one",
  detail: "You are a taste-aware recommendation engine. The user snapped a photo of the item below and was shown its two-sentence profile",
  classify: "Decide whether the user's text names ONE specific wine",
  search: "You are a recommendation engine. Return only valid JSON.",
};
const q = { vision: [], backfill: [], detail: [], classify: [], search: [] };
const calls = { vision: [], backfill: [], detail: [], classify: [], search: [] };
const take = (k, dflt) => (q[k].length ? q[k].shift() : dflt);
class FakeOpenAI {
  constructor() {
    this.moderations = { create: async () => ({ results: [{ flagged: false }] }) };
    this.chat = {
      completions: {
        create: async (req) => {
          const sys = String(req.messages?.[0]?.content || "");
          let kind = Object.keys(KINDS).find((k) => sys.startsWith(KINDS[k])) || "vision";
          calls[kind].push(req);
          const text = take(kind, "{}");
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
FakeOpenAI.APIConnectionError = class extends Error {};
FakeOpenAI.APIConnectionTimeoutError = class extends Error {};
FakeOpenAI.APIError = class extends Error {};
require.cache[require.resolve("openai")] = {
  id: "openai", filename: "openai", loaded: true, exports: { __esModule: true, default: FakeOpenAI },
};

process.env.OPENAI_API_KEY = "stub";
process.env.MINT_SIGNING_SECRET = "s35-secret";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.TMDB_API_KEY;

const snapRoute = require(path.join(OUT, "app/api/reksnap/route.js"));
const searchRoute = require(path.join(OUT, "app/api/openai/route.js"));
const post = async (route, url, body) => {
  const res = await route.POST(new Request(url, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
  const raw = await res.text();
  let json = null;
  try { json = JSON.parse(raw); } catch {}
  return { status: res.status, json, raw };
};
const snap = (body) => post(snapRoute, "http://local/api/reksnap", body);
const search = (body) => post(searchRoute, "http://local/api/openai", body);

const logs = { info: [], warn: [], error: [], log: [] };
let saved = null;
const quiet = () => {
  for (const k of Object.keys(logs)) logs[k].length = 0;
  saved = [console.info, console.warn, console.error, console.log];
  console.info = (...a) => logs.info.push(a);
  console.warn = (...a) => logs.warn.push(a);
  console.error = (...a) => logs.error.push(a);
  console.log = (...a) => logs.log.push(a);
};
const loud = () => { [console.info, console.warn, console.error, console.log] = saved; };
const reset = () => { for (const k of Object.keys(calls)) { calls[k].length = 0; q[k].length = 0; } };
const tagged = (level, msg) => logs[level].filter((a) => a[0] === msg).map((a) => a[1]);
const shape = (d) => !!d && d.of === 2 && typeof d.chars === "number" && "finishReason" in d && typeof d.error === "string";
const attempts = (tag) => [
  tagged("warn", `[${tag}] parse failed — retrying`).map((d) => shape(d) && d.attempt),
  tagged("info", `[${tag}] parse retry succeeded`).map((d) => d.attempt),
  tagged("error", `[${tag}] parse failed — giving up`).map((d) => shape(d) && d.attempt),
];

const ME = "anon_s35_client_0001";
const IMG = "data:image/jpeg;base64,AAAA";
const GARBAGE = "Sorry — I can't help with that one.";
const COFFEE = { name: "Stumptown Hair Bender", description: "Medium roast — cherry and dark chocolate.", category: "coffee" };
const snapJson = (item) => JSON.stringify({
  detected_item: item,
  mode: "similar",
  results: { similar: [1, 2, 3, 4, 5].map((i) => ({ name: `${item.name} Sim ${i}`, description: "x", category: item.category })), uses: [], alternatives: [] },
});
const BACKFILL_OK = JSON.stringify({ rek: { name: "Counter Culture Big Trouble", description: "Nutty and sweet.", category: "coffee" } });
const DETAIL_OK = JSON.stringify({ long: "A longer read of the roast." });

(async () => {
  // One real snap mints the detected-item token the follow-ups need.
  reset(); quiet();
  q.vision.push(snapJson(COFFEE));
  const first = await snap({ image: IMG, clientId: ME });
  loud();
  const token = first.json?.detected_item_token;
  check("setup: a snap with its detected-item token", [first.status, !!token], [200, true]);

  out("\n1. The thumbs-down replacement (backfill)");
  const bf = { detectedItem: first.json?.detected_item, mode: "similar", excludeNames: [], rejectedNames: ["Stumptown Hair Bender Sim 1"], clientId: ME, token };
  reset(); quiet();
  q.backfill.push(GARBAGE, BACKFILL_OK);
  const b1 = await snap({ backfill: bf });
  loud();
  check("a bad reply, a good one → the replacement ships", [b1.status, b1.json?.rek?.name, calls.backfill.length], [200, "Counter Culture Big Trouble", 2]);
  check("…the retry asks the same thing", JSON.stringify(calls.backfill[0]?.messages) === JSON.stringify(calls.backfill[1]?.messages), true);
  check("…logged under [backfill] with its mode (warn 1, info 2)", [attempts("backfill"), tagged("warn", "[backfill] parse failed — retrying")[0]?.mode], [[[1], [2], []], "similar"]);
  reset(); quiet();
  q.backfill.push(GARBAGE, GARBAGE);
  const b2 = await snap({ backfill: bf });
  loud();
  check("two bad replies → Backfill failed as before, exactly two tries", [b2.status, b2.json?.error, calls.backfill.length], [502, "Backfill failed", 2]);
  check("…both attempts logged", attempts("backfill"), [[1], [], [2]]);
  reset(); quiet();
  q.backfill.push(BACKFILL_OK);
  const b3 = await snap({ backfill: bf });
  loud();
  check("a good first reply: one call, nothing logged", [b3.status, calls.backfill.length, attempts("backfill")], [200, 1, [[], [], []]]);

  out("\n2. Show details");
  const ad = { name: COFFEE.name, shortDescription: COFFEE.description, category: COFFEE.category, clientId: ME, token };
  reset(); quiet();
  q.detail.push(GARBAGE, DETAIL_OK);
  const d1 = await snap({ anchorDetail: ad });
  loud();
  check("a bad reply, a good one → the details ship", [d1.status, d1.json?.long, calls.detail.length], [200, "A longer read of the roast.", 2]);
  check("…logged under [detail] (warn 1, info 2)", attempts("detail"), [[1], [2], []]);
  reset(); quiet();
  q.detail.push(GARBAGE, GARBAGE);
  const d2 = await snap({ anchorDetail: ad });
  loud();
  check("two bad replies → Detail failed as before, exactly two tries", [d2.status, d2.json?.error, calls.detail.length], [502, "Detail failed", 2]);
  check("…both attempts logged", attempts("detail"), [[1], [], [2]]);

  out("\n3. The typed-wine check");
  const typed = { typed: { text: "Bonanza", clientId: ME }, wineVisit: { seen: [], rejected: [], favorite: null, chip: null } };
  reset(); quiet();
  q.classify.push(GARBAGE, JSON.stringify({ specific: false, name: null }));
  const c1 = await snap(typed);
  loud();
  check("a bad reply, a good one → the check's answer is used (not a wine → search as before)", [c1.status, c1.json, calls.classify.length, calls.vision.length], [200, { anchor: null }, 2, 0]);
  check("…logged under [typed-wine] (warn 1, info 2)", attempts("typed-wine"), [[1], [2], []]);
  check("…no 'returned non-JSON' line when the retry works", logs.warn.some((a) => /returned non-JSON/.test(a[0])), false);
  reset(); quiet();
  q.classify.push(GARBAGE, JSON.stringify({ specific: true, name: "Bonanza" }));
  q.vision.push(snapJson({ name: "Bonanza Cabernet Sauvignon", description: "Ripe and plush.", category: "wine" }));
  const c2 = await snap(typed);
  loud();
  check("a bad reply, then 'a wine' → the bottle is read", [calls.classify.length, calls.vision.length >= 1, c2.json?.detected_item?.name], [2, true, "Bonanza Cabernet Sauvignon"]);
  reset(); quiet();
  q.classify.push(GARBAGE, GARBAGE);
  const c3 = await snap(typed);
  loud();
  check("two bad replies → search as before, exactly two tries", [c3.status, c3.json, calls.classify.length, calls.vision.length], [200, { anchor: null }, 2, 0]);
  check("…both attempts logged, then the old line", [attempts("typed-wine"), logs.warn.some((a) => /wine classifier returned non-JSON — search as before/.test(a[0]))], [[[1], [], [2]], true]);

  out("\n4. The search lane's picks (/api/openai prompt mode)");
  const ARR = JSON.stringify([{ title: "Heat", year: 1995 }, { title: "Thief", year: 1981 }]);
  const ask = { prompt: "Recommend five crime films.", clientId: ME };
  reset(); quiet();
  q.search.push(GARBAGE, ARR);
  const s1 = await search(ask);
  loud();
  check("a reply with no array, then a good one → the good one goes back", [s1.status, s1.raw, calls.search.length], [200, ARR, 2]);
  check("…logged under [search] (warn 1, info 2)", attempts("search"), [[1], [2], []]);
  reset(); quiet();
  q.search.push("```json\n" + ARR + "\n```");
  const s2 = await search(ask);
  loud();
  check("a fenced array the engine can read is NOT retried", [s2.status, calls.search.length, attempts("search")], [200, 1, [[], [], []]]);
  reset(); quiet();
  q.search.push(JSON.stringify({ results: [{ title: "Heat" }] }));
  await search({ ...ask, jsonResponse: true, temperature: 0.5 });
  loud();
  check("an object with results (backfill's JSON mode) is NOT retried", calls.search.length, 1);
  reset(); quiet();
  q.search.push(GARBAGE, "still no array");
  const s3 = await search(ask);
  loud();
  check("two bad replies → the last reply goes back as before, exactly two tries", [s3.status, s3.raw, calls.search.length], [200, "still no array", 2]);
  check("…both attempts logged", attempts("search"), [[1], [], [2]]);

  out("\n5. From source");
  const eng = read("src/engine/rekomendrEngine.ts");
  check("the engine reads replies with the same shared reader", [/import \{ extractJsonArray \} from "\.\.\/lib\/jsonArray"/.test(eng), /function extractJsonArray/.test(eng)], [true, false]);
  const src = read("app/api/reksnap/route.ts");
  check("snap route: chain, backfill, detail, typed-wine, first read all use the helper", ["chain", "backfill", "detail", "typed-wine", "snap-read"].map((t) => new RegExp(`parseWithRetry\\(\\s*"${t}"`).test(src)), [true, true, true, true, true]);
  check("snap route: no single-shot parse-or-fail left on a model reply", [/parsed = JSON\.parse\(text\);/.test(src), /JSON\.parse\(jsonText\(completion\.text\)\)/.test(src)], [false, false]);

  out(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  if (saved) loud();
  console.error(e);
  process.exit(1);
});
