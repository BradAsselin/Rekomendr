// validate-s28.cjs — S28: the shelf read writes one short sentence about
// its most popular bottle (Brad, 2026-10-30), and the top card shows it.
//
//   1. The shelf-read prompt — exactly one line added; nothing else in it
//      changed from main before S28.
//   2. cleanShelfRead — the line counts only beside a listed pick.
//   3. The route — a swapped top card carries the line (pairing-cut, like
//      every wine anchor's short): detected_item, the token and the picks'
//      profile line all use it. No line → no short. No swap → the vision
//      read's text stays.
//   4. The client shows it: the top card's short is detected_item's.
//
// Compiles the REAL /api/reksnap route and the wine libs. Stubs OpenAI by
// routing on each request's system prompt. No keys, no network.
//
//   node scripts/validate-s28.cjs
//
const { execFileSync, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CACHE = path.join(ROOT, "node_modules", ".cache");
fs.mkdirSync(CACHE, { recursive: true });
const OUT = fs.mkdtempSync(path.join(CACHE, "s28-validate-"));

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
process.env.MINT_SIGNING_SECRET = "s28-secret";
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

const ME = "anon_s28_client_0001";
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

const BASE = "024bd6b"; // main before S28
const S28 = "e17ff25"; // the S28 prompt commit (later sessions may change prompts with approval)
const LINE = "Dry and grassy — grapefruit and passionfruit over a flinty edge.";

(async () => {
  out("1. The shelf-read prompt");
  const d = execSync(`git diff ${BASE} ${S28} -- src/lib/wineReks.ts`, { cwd: ROOT, encoding: "utf8" }).split("\n");
  const removedStr = d.filter((l) => /^-\s*["'`]/.test(l) && !/^---/.test(l));
  const addedStr = d.filter((l) => /^\+\s*["'`]/.test(l) && !/^\+\+\+/.test(l));
  check("one prompt line added, none removed or changed", [addedStr.length, removedStr.length], [1, 0]);
  const p = R.SHELF_READ_PROMPT;
  const line = p.split("\n").find((l) => l.startsWith("Also return anchor_line"));
  check("the line asks for one short sentence about the picked bottle", /one short sentence about that bottle, the way a wine card's first line reads/.test(line || ""), true);
  check("…opening on dry vs. sweet, concrete notes, no filler/rating/pairing", [/open on dry vs\. sweet/.test(line), /no rating, no occasion or pairing/.test(line), /Null when anchor_name is null/.test(line)], [true, true, true]);
  check("it sits right after the most-popular instruction", p.split("\n")[p.split("\n").indexOf(line) - 1].startsWith("anchor_name / anchor_reason / anchor_price"), true);
  check("the Return line is untouched", /"anchor_name": string\|null, "anchor_reason": string\|null, "anchor_price": number\|null, "bottles"/.test(p) && !/"anchor_line"/.test(p.split("\n").find((l) => l.startsWith("Return JSON only:"))), true);

  out("\n2. cleanShelfRead");
  const c1 = W.cleanShelfRead({ scene: "shelf", anchor_name: OYSTER, anchor_line: `  ${LINE}  `, bottles });
  check("a listed pick keeps its line, trimmed", c1.anchorLine, LINE);
  const c2 = W.cleanShelfRead({ scene: "shelf", anchor_name: "Yellow Tail Shiraz", anchor_line: LINE, bottles });
  check("no listed pick → no line", c2.anchorLine, null);
  check("no line → null", W.cleanShelfRead({ scene: "shelf", anchor_name: OYSTER, bottles }).anchorLine, null);
  check("capped at 240", W.cleanShelfRead({ scene: "shelf", anchor_name: OYSTER, anchor_line: "x".repeat(400), bottles }).anchorLine.length, 240);

  out("\n3. The route");
  const restore = quiet();
  visionReply = vision(KIM, KIM_TEXT);
  shelfReply = { scene: "shelf", anchor_name: OYSTER, anchor_reason: "Everywhere.", anchor_line: LINE, anchor_price: 12.99, bottles };
  wineRequests.length = 0;
  logs.length = 0;
  const a = await snap();
  check("the swapped top card carries the line", [a.json.detected_item.name, a.json.detected_item.description], [OYSTER, LINE]);
  check("the token attests that short", M.verifyAnchor({ name: OYSTER, category: "wine", short: LINE, long: null, clientId: ME }, a.json.detected_item_token), true);
  check("the picks see it as the anchor's profile", lastUser().includes(`Its signature profile: ${LINE}`), true);
  check("the shelf read's log carries it", logs.some((l) => l[0] === "[wine] shelf read" && l[1].anchorLine === LINE), true);
  shelfReply = { ...shelfReply, anchor_line: `${LINE} Built for oysters, not a steak.` };
  const b = await snap();
  check("a pairing sentence is cut, like every wine anchor's", b.json.detected_item.description, LINE);
  shelfReply = { scene: "shelf", anchor_name: OYSTER, anchor_price: 12.99, bottles };
  const c = await snap();
  check("no line → no short (never the other bottle's text)", [c.json.detected_item.name, c.json.detected_item.description], [OYSTER, ""]);
  shelfReply = { scene: "shelf", anchor_name: KIM, anchor_line: LINE, anchor_price: 14.99, bottles };
  const e = await snap();
  check("no swap → the vision read's text stays", [e.json.detected_item.name, e.json.detected_item.description], [KIM, KIM_TEXT]);
  restore();

  out("\n4. The client");
  const src = fs.readFileSync(path.join(ROOT, "src/components/RekSnapResults.tsx"), "utf8");
  check("the top card's short is detected_item's description", src.includes('label="This shelf · most popular"') && src.includes("short={firstSentence(result.detected_item.description)}"), true);

  out(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
