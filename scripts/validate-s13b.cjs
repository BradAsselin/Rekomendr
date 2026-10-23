/* eslint-disable no-console */
//
// scripts/validate-s13b.cjs — S13b: early paint on shelf snaps
// (docs/s13-opus-voice-plan.md, A2).
//
//   1. The route: { stream: "ndjson" } sends the shelf's bottles the moment
//      the read finishes, then one final line with the same status and
//      body the JSON path returns. Without the flag: JSON, unchanged.
//   2. Only a shelf (the wineSnap test); never a single bottle, a haul, or
//      a shelf that names anything health-side (§2.2).
//   3. The client: asks for NDJSON, paints only for the live snap, clears
//      on landing; the loading view uses existing wording only.
//
// Compiles the REAL /api/reksnap route. Stubs OpenAI by system prompt.
//
//   node scripts/validate-s13b.cjs
//
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CACHE = path.join(ROOT, "node_modules", ".cache");
fs.mkdirSync(CACHE, { recursive: true });
const OUT = fs.mkdtempSync(path.join(CACHE, "s13b-validate-"));

console.log("Compiling /api/reksnap from source…");
execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "tsc", "app/api/reksnap/route.ts",
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
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

/* ---------------- OpenAI stub: route by system prompt ---------------- */
let shelfReply = null;
const visionReply = JSON.stringify({
  detected_item: { name: "Josh Cellars Cabernet Sauvignon", description: "Dry and plush — blackberry and mocha.", category: "wine" },
  mode: "similar",
  results: {
    similar: [1, 2, 3, 4, 5].map((i) => ({ name: `Vision Sim ${i}`, description: "x", category: "wine" })),
    uses: [],
    alternatives: [],
  },
});
const wineReply = {
  anchor: { price_usd: 15, dry_sweet: 1, light_bold: 4 },
  reks: [
    { name: "Bogle Cabernet Sauvignon", description: "a", category: "wine", price_usd: 12.99, dry_sweet: 1, light_bold: 4 },
    { name: "Cannonball Cabernet Sauvignon", description: "b", category: "wine", price_usd: 15.99, dry_sweet: 1, light_bold: 4 },
    { name: "Louis Martini Sonoma Cabernet", description: "c", category: "wine", price_usd: 17, dry_sweet: 1, light_bold: 4 },
    { name: "Columbia Crest H3 Cabernet", description: "d", category: "wine", price_usd: 14, dry_sweet: 1, light_bold: 4 },
    { name: "Avalon Cabernet Sauvignon", description: "e", category: "wine", price_usd: 11, dry_sweet: 1, light_bold: 4 },
  ],
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
class FakeOpenAI {
  constructor() {
    this.chat = {
      completions: {
        create: async (req) => {
          const sys = req.messages?.[0]?.content || "";
          let text;
          if (sys.startsWith("You are reading a photo taken in a wine shop")) {
            await wait(10);
            text = JSON.stringify(shelfReply);
          } else if (sys.startsWith("You are a taste-aware wine recommendation engine")) {
            // The picks land well after the read, as they do live.
            await wait(120);
            text = JSON.stringify(wineReply);
          } else {
            text = visionReply;
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
FakeOpenAI.APIConnectionError = class extends Error {};
require.cache[require.resolve("openai")] = {
  id: "openai", filename: "openai", loaded: true, exports: { __esModule: true, default: FakeOpenAI },
};

process.env.OPENAI_API_KEY = "stub";
process.env.MINT_SIGNING_SECRET = "s13b-secret";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.TMDB_API_KEY;
delete process.env.REKS_MODEL_PROVIDER;

const route = require(path.join(OUT, "app/api/reksnap/route.js"));
const ME = "anon_s13b_client_0001";
const IMG = "data:image/jpeg;base64,AAAA";

async function postRaw(body) {
  const res = await route.POST(new Request("http://local/api/reksnap", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
  const type = res.headers.get("content-type") || "";
  if (!type.includes("ndjson")) return { type, status: res.status, json: await res.json().catch(() => null) };
  // Read line by line, stamping when each line arrived.
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  const t0 = Date.now();
  let buf = "";
  const lines = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      if (buf.slice(0, nl).trim()) lines.push({ at: Date.now() - t0, msg: JSON.parse(buf.slice(0, nl)) });
      buf = buf.slice(nl + 1);
    }
  }
  return { type, status: res.status, lines };
}
const quiet = () => {
  const saved = [console.info, console.warn, console.error];
  console.info = () => {};
  console.warn = () => {};
  console.error = () => {};
  return () => { [console.info, console.warn, console.error] = saved; };
};
const shelfOf = (names, scene = "shelf") => ({
  scene,
  anchor_price: null,
  bottles: names.map((n, i) => ({ name: n, price: 10 + i, talker_points: null, talker_source: null, staff_pick: false })),
});

(async () => {
  out("\n1. The route");
  shelfReply = shelfOf(["Josh Cellars Cabernet Sauvignon", "Bogle Cabernet Sauvignon", "Cannonball Cabernet Sauvignon", "Avalon Cabernet Sauvignon"]);
  let done = quiet();
  const nd = await postRaw({ image: IMG, clientId: ME, category: "Wine", wineVisit: {}, stream: "ndjson" });
  const js = await postRaw({ image: IMG, clientId: ME + "x", category: "Wine", wineVisit: {} });
  done();
  check("NDJSON content type with the flag", nd.type.includes("ndjson"), true);
  check("two lines: shelf, then final", nd.lines.map((l) => l.msg.type), ["shelf", "final"]);
  check("the shelf line lists the bottles and tag prices", nd.lines[0].msg.bottles, [
    { name: "Josh Cellars Cabernet Sauvignon", price: 10 },
    { name: "Bogle Cabernet Sauvignon", price: 11 },
    { name: "Cannonball Cabernet Sauvignon", price: 12 },
    { name: "Avalon Cabernet Sauvignon", price: 13 },
  ]);
  check("the shelf arrives before the picks (≥80ms earlier)", nd.lines[1].at - nd.lines[0].at >= 80, true);
  const fin = nd.lines[1].msg;
  check("final carries the JSON path's status", [fin.status, js.status], [200, 200]);
  check("final body has the same shape as the JSON body", Object.keys(fin.body).sort(), Object.keys(js.json).sort());
  check("final body: the same anchor and five picks", [fin.body.detected_item.name, fin.body.results.similar.length], [js.json.detected_item.name, js.json.results.similar.length]);
  check("without the flag: plain JSON, as before", js.type.includes("json") && !js.type.includes("ndjson"), true);

  out("\n2. Only a shelf, never health");
  const linesFor = async (reply) => {
    shelfReply = reply;
    const d = quiet();
    const r = await postRaw({ image: IMG, clientId: ME + Math.random().toString(36).slice(2, 8), category: "Wine", wineVisit: {}, stream: "ndjson" });
    d();
    return r.lines.map((l) => l.msg.type);
  };
  check("single bottle → no early line", await linesFor(shelfOf(["Josh Cellars Cabernet Sauvignon"], "single")), ["final"]);
  check("haul → no early line", await linesFor(shelfOf(["A Wine", "B Wine", "C Wine"], "haul")), ["final"]);
  check("'other' scene with 4+ bottles still counts (the wineSnap test)", await linesFor(shelfOf(["A Wine", "B Wine", "C Wine", "D Wine"], "other")), ["shelf", "final"]);
  check("a health label on the shelf → nothing painted", await linesFor(shelfOf(["Advil Ibuprofen Tablets", "Josh Cellars Cabernet Sauvignon", "Bogle Cabernet Sauvignon"])), ["final"]);
  check("a Movies-bar snap (no shelf read up front) → no early line", await (async () => {
    shelfReply = shelfOf(["A Wine", "B Wine", "C Wine", "D Wine"]);
    const d = quiet();
    const r = await postRaw({ image: IMG, clientId: ME + "m", category: "Movies", wineVisit: {}, stream: "ndjson" });
    d();
    return r.lines[0].msg.type === "final" || r.lines.length === 2;
  })(), true);
  shelfReply = shelfOf(["A Wine", "B Wine"]);
  done = quiet();
  const bad = await postRaw({ clientId: ME, category: "Wine", stream: "ndjson" });
  done();
  check("an error still ends in one final line with its status", [bad.lines.length, bad.lines[0].msg.type, bad.lines[0].msg.status], [1, "final", 400]);

  out("\n3. The client");
  const page = read("app/page.tsx");
  const results = read("src/components/RekSnapResults.tsx");
  check("snaps ask for NDJSON", /stream: "ndjson"/.test(page), true);
  check("early bottles only for the live snap", page.includes("if (snapId === snapIdRef.current) setShelfPreview(bottles);"), true);
  check("cleared on a new snap and when the snap lands", [/setShelfPreview\(null\);\s*setSnapLoading\(true\);/.test(page), /setSnapLoading\(false\);\s*setShelfPreview\(null\);/.test(page)], [true, true]);
  check("non-NDJSON answers read as before", page.includes('if (!type.includes("ndjson") || !res.body)'), true);
  const labels = (results.match(/"Reks Ray™ is [^"]+"/g) || []).sort();
  check("loading view: existing wording only", [...new Set(labels)], ["\"Reks Ray™ is finding your reks…\"", "\"Reks Ray™ is reading your photo…\""]);
  const base = require("child_process").execSync("git show 0a81a81:src/components/RekSnapResults.tsx", { cwd: ROOT, encoding: "utf8" });
  check("…both lines already in the app before S13", ["Reks Ray™ is finding your reks…", "Reks Ray™ is reading your photo…"].every((l) => base.includes(l)), true);
  check("no aria/visible label added to the bottle list", /data-testid="shelf-preview">/.test(results) && !/aria-label="Bottles/.test(results), true);

  out(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  process.stderr.write("HARNESS CRASH: " + (err && err.stack) + String.fromCharCode(10));
  process.exit(1);
});
