// validate-s27.cjs — S27: the shelf's top card is the shelf read's most
// popular bottle (Brad, 2026-10-30): the best-known, most widely available
// bottle on the shelf, not the one the photo centers on. The label stays
// "This shelf · most popular".
//
//   1. The shelf-read prompt — only the anchor instruction (and the Return
//      line's two new fields) changed; the rest is byte-identical to main
//      before S27. The picks prompt's ring-taste go_to line is kept.
//   2. cleanShelfRead — the pick counts only when it names a listed bottle;
//      its reason is kept, trimmed and capped.
//   3. The route — a shelf snap whose read picks another bottle: the set
//      anchors on the pick, detected_item / token / price follow it, the
//      picks never repeat it, and the pick + reason ride in the result and
//      the log.
//   4. The route — the pick is the vision bottle; the read names none; a
//      single-bottle snap; a health-side name: no swap, and the read's
//      anchor_price never prices a bottle it isn't.
//
// Compiles the REAL /api/reksnap route and the wine libs. Stubs OpenAI by
// routing on each request's system prompt. No keys, no network.
//
//   node scripts/validate-s27.cjs
//
const { execFileSync, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CACHE = path.join(ROOT, "node_modules", ".cache");
fs.mkdirSync(CACHE, { recursive: true });
const OUT = fs.mkdtempSync(path.join(CACHE, "s27-validate-"));
const BASE = "985a142"; // main before S27
const S27 = "ec23de7"; // the S27 prompt commit (later sessions may change prompts with approval)

console.log("Compiling /api/reksnap, wineShelf, wineReks from source…");
execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "tsc", "app/api/reksnap/route.ts", "src/lib/wineShelf.ts", "src/lib/wineReks.ts",
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

/* ---------------- OpenAI stub: route by system prompt ---------------- */
const wineRequests = [];
let shelfReply = null;
let wineReply = () => ({ anchor: {}, reks: [] });
let visionReply = null;
class FakeOpenAI {
  constructor() {
    this.chat = {
      completions: {
        create: async (req) => {
          const sys = req.messages?.[0]?.content || "";
          let text;
          if (sys.startsWith("You are reading a photo taken in a wine shop")) {
            text = JSON.stringify(shelfReply);
          } else if (sys.startsWith("You are a taste-aware wine recommendation engine")) {
            wineRequests.push(req);
            text = JSON.stringify(wineReply(req));
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
require.cache[require.resolve("openai")] = {
  id: "openai", filename: "openai", loaded: true, exports: { __esModule: true, default: FakeOpenAI },
};

process.env.OPENAI_API_KEY = "stub";
process.env.MINT_SIGNING_SECRET = "s27-secret";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.TMDB_API_KEY;

const W = require(path.join(OUT, "src/lib/wineShelf.js"));
const R = require(path.join(OUT, "src/lib/wineReks.js"));
const M = require(path.join(OUT, "src/lib/mintToken.js"));
const route = require(path.join(OUT, "app/api/reksnap/route.js"));
const post = async (body) => {
  const res = await route.POST(new Request("http://local/api/reksnap", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
  return { status: res.status, json: await res.json().catch(() => null) };
};
const logs = [];
const quiet = () => {
  const saved = [console.info, console.warn];
  console.info = (...a) => logs.push(a);
  console.warn = () => {};
  return () => { [console.info, console.warn] = saved; };
};

const ME = "anon_s27_client_0001";
const IMG = "data:image/jpeg;base64,AAAA";
const KIM = "Kim Crawford Sauvignon Blanc";
const OYSTER = "Oyster Bay Sauvignon Blanc";
const lastUser = () => {
  const m = wineRequests[wineRequests.length - 1].messages;
  const u = m[m.length - 1].content;
  return typeof u === "string" ? u : JSON.stringify(u);
};
const bottles = [
  { name: "Matua Sauvignon Blanc", price: 10.99 },
  { name: KIM, price: 14.99 },
  { name: OYSTER, price: 12.99 },
  { name: "Whitehaven Sauvignon Blanc", price: 16.99 },
  { name: "Starborough Sauvignon Blanc", price: 11.99 },
];
const vision = (name, description) =>
  JSON.stringify({
    detected_item: { name, description, category: "wine" },
    mode: "similar",
    results: { similar: [1, 2, 3, 4, 5].map((i) => ({ name: `Vision Sim ${i}`, description: "x", category: "wine" })), uses: [], alternatives: [] },
  });
const KIM_TEXT = "Dry and zesty — grapefruit and cut grass.";
wineReply = () => ({
  anchor: { price_usd: 13, dry_sweet: 2, light_bold: 2 },
  reks: [
    { name: OYSTER, price_usd: 13, dry_sweet: 2, light_bold: 2 },
    { name: KIM, price_usd: 15, dry_sweet: 2, light_bold: 2 },
    { name: "Matua Sauvignon Blanc", price_usd: 11, dry_sweet: 1, light_bold: 1 },
    { name: "Whitehaven Sauvignon Blanc", price_usd: 17, dry_sweet: 2, light_bold: 2 },
    { name: "Starborough Sauvignon Blanc", price_usd: 12, dry_sweet: 2, light_bold: 2 },
    { name: "Brancott Estate Sauvignon Blanc", price_usd: 12, dry_sweet: 2, light_bold: 2 },
    { name: "Nobilo Sauvignon Blanc", price_usd: 11, dry_sweet: 2, light_bold: 2 },
  ],
});
const snap = () => post({ image: IMG, clientId: ME, category: "Wine", wineVisit: { seen: [], rejected: [] } });

(async () => {
  out("1. The shelf-read prompt");
  const d = execSync(`git diff ${BASE} ${S27} -- src/lib/wineReks.ts`, { cwd: ROOT, encoding: "utf8" }).split("\n");
  const removedStr = d.filter((l) => /^-\s*["'`]/.test(l) && !/^---/.test(l));
  const addedStr = d.filter((l) => /^\+\s*["'`]/.test(l) && !/^\+\+\+/.test(l));
  check("exactly two prompt lines changed: the anchor instruction and the Return line", [removedStr.length, addedStr.length], [2, 2]);
  check("the old instruction named the centered bottle", /the one the photo centers on, or the nearest and largest/.test(removedStr[0] || ""), true);
  const p = R.SHELF_READ_PROMPT;
  check("the new one asks for the best-known, most widely available bottle", /best-known, most widely available one, not the one the photo centers on/.test(p), true);
  check("…by name, as listed, with a reason and its tag", [/anchor_name: its name exactly as you listed it in bottles/.test(p), /anchor_reason:/.test(p), /anchor_price: its tag price, only if readable/.test(p)], [true, true, true]);
  check("the old MAIN-bottle wording is gone", /MAIN bottle/.test(p), false);
  const oldRet = (removedStr[1] || "").replace(/^-\s*/, "");
  const newRet = (addedStr[1] || "").replace(/^\+\s*/, "");
  check("the Return line only gains anchor_name and anchor_reason", newRet.replace('"anchor_name": string|null, "anchor_reason": string|null, ', ""), oldRet);
  check("the read's opening rule is untouched", p.startsWith("You are reading a photo taken in a wine shop, a grocery aisle, or at home. Report only what is READABLE in the photo. Never guess, never fill in from memory.\n"), true);
  const ctx = { kind: "set", count: 8, anchor: { name: KIM, description: "d", category: "wine" }, anchorPrice: 15, anchorPriceSource: "tag", band: W.bandFor(15, null), shelf: null, shelfSnap: false, seen: [], disliked: [], favorite: { name: OYSTER, dry: null, body: null }, chained: null, kept: [] };
  check("the ring-taste go_to line is kept in the picks prompt", /Also return go_to, at the top level beside "anchor"/.test(R.buildWineReksPrompt("VOICE", ctx)), true);

  out("\n2. cleanShelfRead");
  const c1 = W.cleanShelfRead({ scene: "shelf", anchor_name: "oyster bay sauvignon blanc", anchor_reason: "  The best-selling NZ Sauvignon Blanc in most US stores.  ", anchor_price: "12.99", bottles });
  check("a listed pick takes the listing's spelling, reason trimmed", [c1.anchorName, c1.anchorReason, c1.anchorPrice], [OYSTER, "The best-selling NZ Sauvignon Blanc in most US stores.", 12.99]);
  const c2 = W.cleanShelfRead({ scene: "shelf", anchor_name: "Yellow Tail Shiraz", anchor_reason: "everywhere", bottles });
  check("a pick that isn't on the shelf → none, and no reason", [c2.anchorName, c2.anchorReason], [null, null]);
  const c3 = W.cleanShelfRead({ scene: "shelf", bottles });
  check("no pick → none", [c3.anchorName, c3.anchorReason], [null, null]);
  const c4 = W.cleanShelfRead({ scene: "shelf", anchor_name: KIM, anchor_reason: "x".repeat(300), bottles });
  check("the reason is capped at 120", c4.anchorReason.length, 120);

  out("\n3. The route — the read picks another bottle");
  const restore = quiet();
  visionReply = vision(KIM, KIM_TEXT);
  shelfReply = { scene: "shelf", anchor_name: OYSTER, anchor_reason: "Widely stocked, the category's best-known label.", anchor_price: 12.99, bottles };
  logs.length = 0;
  wineRequests.length = 0;
  const a = await snap();
  const aw = a.json.wine;
  check("200, a shelf snap", [a.status, aw.shelfSnap], [200, true]);
  check("the top card is the read's pick, with no borrowed text", a.json.detected_item.name === OYSTER && a.json.detected_item.description === "", true);
  check("the pick and its reason ride in the result", aw.anchorPick, { name: OYSTER, shelfIndex: 2, by: "shelf-read", reason: "Widely stocked, the category's best-known label.", visionName: KIM });
  check("…and in the log", logs.some((l) => l[0] === "[wine] shelf anchor" && l[1].by === "shelf-read" && l[1].reason === "Widely stocked, the category's best-known label." && l[1].visionName === KIM && l[1].tag === 12.99), true);
  check("the shelf read's log carries the pick", logs.some((l) => l[0] === "[wine] shelf read" && l[1].anchorName === OYSTER), true);
  check("its tag prices the top card", [aw.anchor.price, aw.anchor.priceSource], [12.99, "tag"]);
  check("the picks ran on the pick as anchor", /Oyster Bay Sauvignon Blanc/.test(lastUser()) && !/Kim Crawford.{0,40}grapefruit/.test(lastUser()), true);
  const names = a.json.results.similar.map((r) => r.name);
  check("the five never repeat the top card", [names.length, names.includes(OYSTER)], [5, false]);
  check("the centered bottle may now be a pick", names.includes(KIM), true);
  check("the token attests the shelf's top bottle", M.verifyAnchor({ name: OYSTER, category: "wine", short: "", long: null, clientId: ME }, a.json.detected_item_token), true);
  check("…not the centered one", M.verifyAnchor({ name: KIM, category: "wine", short: KIM_TEXT, long: null, clientId: ME }, a.json.detected_item_token), false);

  out("\n4. The route — no swap");
  shelfReply = { scene: "shelf", anchor_name: KIM, anchor_reason: "Everywhere.", anchor_price: 14.99, bottles };
  const b = await snap();
  check("the pick is the centered bottle → it stays, text and all", [b.json.detected_item.name, b.json.detected_item.description, b.json.wine.anchorPick.by, b.json.wine.anchorPick.reason], [KIM, KIM_TEXT, "shelf-read", "Everywhere."]);
  shelfReply = { scene: "shelf", anchor_price: null, bottles };
  const c = await snap();
  check("the read names none → the vision bottle, by vision", [c.json.detected_item.name, c.json.wine.anchorPick.by, c.json.wine.anchorPick.reason], [KIM, "vision", null]);
  shelfReply = { scene: "shelf", anchor_name: "Yellow Tail Shiraz", anchor_price: 8.99, bottles };
  const c2r = await snap();
  check("…a pick off the shelf is ignored", [c2r.json.detected_item.name, c2r.json.wine.anchorPick.by, c2r.json.wine.anchor.price], [KIM, "vision", 14.99]);
  shelfReply = { scene: "single", anchor_name: "Whitehaven Sauvignon Blanc", anchor_price: 21.99, bottles: [{ name: "Whitehaven Sauvignon Blanc", price: 21.99 }] };
  const s = await snap();
  check("a single-bottle snap never swaps", [s.json.detected_item.name, s.json.wine.shelfSnap, s.json.wine.anchorPick], [KIM, false, null]);
  check("…and the pick's price never prices the vision bottle", s.json.wine.anchor.priceSource === "tag", false);
  shelfReply = { scene: "single", anchor_price: 19.99, bottles: [] };
  const s2 = await snap();
  check("no pick named → anchor_price still prices the snapped bottle", [s2.json.wine.anchor.price, s2.json.wine.anchor.priceSource], [19.99, "tag"]);
  shelfReply = { scene: "shelf", anchor_name: "Halls Cough Drops", anchor_price: 4.99, bottles: [...bottles, { name: "Halls Cough Drops", price: 4.99 }] };
  const h = await snap();
  check("a health-side name is never the top card", h.json.detected_item.name, KIM);
  restore();

  out(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
