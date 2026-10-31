/* eslint-disable no-console */
//
// scripts/validate-s26b.cjs — S26b: wine Compare to (Brad's S25 brief,
// items 4–7; docs/S25_HOME_GO_AND_SHELF_COMPARE_LAUNCH_PROMPT.md).
//
//   1. The picks prompt: no reference → byte-identical to S8; the snapped
//      bottle or a reference with a known taste → no go_to ask; only a
//      reference with unknown taste adds one line (existing lines intact).
//   2. The route — a shelf snap: no reference by default (the go-to rides
//      as a name only), no vs. lines, the go-to still flagged on the shelf
//      and kept off the picks, the top-card pick returned and logged.
//   3. The route — a single-bottle snap compares to the snapped bottle.
//   4. The route — the text branch with a shelf bottle as the reference:
//      lines against it, its taste position back from the model.
//   5. The client, from source: pills gone, status line, the top cards,
//      the compare row, the This shelf tab, the approved wording.
//
// Compiles the REAL /api/reksnap route and the wine libs. Stubs OpenAI by
// routing on each request's system prompt. No keys, no network.
//
//   node scripts/validate-s26b.cjs
//
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CACHE = path.join(ROOT, "node_modules", ".cache");
fs.mkdirSync(CACHE, { recursive: true });
const OUT = fs.mkdtempSync(path.join(CACHE, "s26b-validate-"));

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
process.env.MINT_SIGNING_SECRET = "s26b-secret";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.TMDB_API_KEY;

const W = require(path.join(OUT, "src/lib/wineShelf.js"));
const R = require(path.join(OUT, "src/lib/wineReks.js"));
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

const ME = "anon_s26b_client_0001";
const IMG = "data:image/jpeg;base64,AAAA";
const lastSystem = () => wineRequests[wineRequests.length - 1].messages[0].content;
const returnLine = (p) => p.split("\n").find((l) => l.startsWith("Return JSON only:"));

(async () => {
  out("1. The picks prompt");
  const ctx = { kind: "set", count: 8, anchor: { name: "Kim Crawford Sauvignon Blanc", description: "d", category: "wine" }, anchorPrice: 15, anchorPriceSource: "tag", band: W.bandFor(15, null), shelf: null, shelfSnap: false, seen: [], disliked: [], favorite: null, chained: null, kept: [] };
  const p0 = R.buildWineReksPrompt("VOICE", ctx);
  check("no reference → no go-to block, no go_to ask", [/GO-TO/.test(p0), /go_to/.test(p0)], [false, false]);
  const pSelf = R.buildWineReksPrompt("VOICE", { ...ctx, favorite: { name: "Kim Crawford Sauvignon Blanc", dry: null, body: null } });
  check("the snapped bottle as reference → lines, no go_to ask", [/GO-TO WINE is Kim Crawford/.test(pSelf), /go_to/.test(pSelf)], [true, false]);
  const pKnown = R.buildWineReksPrompt("VOICE", { ...ctx, favorite: { name: "Oyster Bay Sauvignon Blanc", dry: 3, body: 3 } });
  check("a reference with a known taste → no go_to ask", /go_to/.test(pKnown), false);
  const pAsk = R.buildWineReksPrompt("VOICE", { ...ctx, favorite: { name: "Oyster Bay Sauvignon Blanc", dry: null, body: null } });
  check("a reference with unknown taste → one added go_to line", (pAsk.match(/go_to/g) || []).length, 1);
  const askLines = pAsk.split("\n");
  const at = askLines.findIndex((l) => /go_to/.test(l));
  askLines.splice(at, 2); // the added line and its blank
  check("…and without it the prompt is byte-identical", askLines.join("\n"), pKnown);
  check("the Return JSON line is unchanged by the ask", returnLine(pAsk), returnLine(pKnown));
  check("…and unchanged from S8 with no reference", returnLine(p0).includes('"vs_favorite"'), false);
  check("referenceTaste: the client's taste wins, else the model's, else null", [
    W.referenceTaste({ name: "A", dry: 2, body: 5 }, { dry_sweet: 4, light_bold: 1 }),
    W.referenceTaste({ name: "A", dry: null, body: null }, { dry_sweet: 4.2, light_bold: 9 }),
    W.referenceTaste({ name: "A" }, null),
  ], [{ name: "A", dry: 2, body: 5 }, { name: "A", dry: 4, body: 5 }, { name: "A", dry: null, body: null }]);

  out("\n2. The route — a shelf snap, nothing compared");
  const restore = quiet();
  visionReply = JSON.stringify({
    detected_item: { name: "Kim Crawford Sauvignon Blanc", description: "Dry and zesty — grapefruit and cut grass. Built for oysters, not a steak.", category: "wine" },
    mode: "similar",
    results: { similar: [1, 2, 3, 4, 5].map((i) => ({ name: `Vision Sim ${i}`, description: "x", category: "wine" })), uses: [], alternatives: [] },
  });
  shelfReply = {
    scene: "shelf",
    anchor_price: null,
    bottles: [
      { name: "Oyster Bay Sauvignon Blanc", price: 12.99 },
      { name: "Kim Crawford Sauvignon Blanc", price: 14.99 },
      { name: "Dr. Loosen Dr. L Riesling", price: 13.99 },
      { name: "Matua Sauvignon Blanc", price: 10.99 },
      { name: "Whitehaven Sauvignon Blanc", price: 16.99 },
    ],
  };
  wineReply = () => ({
    anchor: { price_usd: 15, dry_sweet: 2, light_bold: 2 },
    go_to: { dry_sweet: 3, light_bold: 3 },
    reks: [
      { name: "Dr. Loosen Dr. L Riesling", price_usd: 14, dry_sweet: 4, light_bold: 2, vs_favorite: "sweeter" },
      { name: "Matua Sauvignon Blanc", price_usd: 11, dry_sweet: 1, light_bold: 1, vs_favorite: "drier" },
      { name: "Whitehaven Sauvignon Blanc", price_usd: 17, dry_sweet: 2, light_bold: 2, vs_favorite: "riper" },
      { name: "Oyster Bay Sauvignon Blanc", price_usd: 13, dry_sweet: 3, light_bold: 3, vs_favorite: "same" },
      { name: "Starborough Sauvignon Blanc", price_usd: 12, dry_sweet: 2, light_bold: 2, vs_favorite: "brighter" },
    ],
  });
  const shelf = await post({ image: IMG, clientId: ME, category: "Wine", wineVisit: { seen: [], rejected: [], goTo: "Dr. Loosen Dr. L Riesling" } });
  const sw = shelf.json.wine;
  check("200, a shelf snap", [shelf.status, sw.shelfSnap], [200, true]);
  check("no reference by default (Brad's Riesling is not compared)", [sw.reference, sw.autoRef, /GO-TO WINE/.test(lastSystem())], [null, false, false]);
  check("no vs. lines on the five", shelf.json.results.similar.every((r) => r.wine.vsFavorite === null), true);
  check("the go-to is still flagged on the shelf, with its tag", sw.favoriteHere, { name: "Dr. Loosen Dr. L Riesling", price: 13.99 });
  check("…and kept off the picks", shelf.json.results.similar.some((r) => /Loosen/.test(r.name)), false);
  check("the top-card pick returned (the vision read's bottle, its shelf index)", sw.anchorPick, { name: "Kim Crawford Sauvignon Blanc", shelfIndex: 1, by: "vision", reason: null, visionName: "Kim Crawford Sauvignon Blanc" });
  check("…and logged for tuning", logs.some((a) => a[0] === "[wine] shelf anchor" && a[1].shelfIndex === 1 && a[1].bottles === 5 && a[1].tag === 14.99), true);
  check("every bottle read rides back for the This shelf tab", sw.shelf.map((b) => b.name), shelfReply.bottles.map((b) => b.name));

  out("\n3. The route — a single-bottle snap");
  shelfReply = { scene: "single", anchor_price: 14.99, bottles: [{ name: "Kim Crawford Sauvignon Blanc", price: 14.99 }] };
  const single = await post({ image: IMG, clientId: ME, category: "Wine", wineVisit: { seen: [], rejected: [], goTo: null } });
  const gw = single.json.wine;
  check("the snapped bottle is the reference (autoRef)", [gw.autoRef, gw.reference && gw.reference.name], [true, "Kim Crawford Sauvignon Blanc"]);
  check("its ring position is the anchor's", [gw.reference.dry, gw.reference.body], [gw.anchor.dry, gw.anchor.body]);
  check("the prompt compares to it and asks no go_to", [/GO-TO WINE is Kim Crawford Sauvignon Blanc/.test(lastSystem()), /go_to/.test(lastSystem())], [true, false]);
  check("the picks carry vs. lines", single.json.results.similar.length > 0 && single.json.results.similar.every((r) => typeof r.wine.vsFavorite === "string"), true);
  check("no shelf pick off a shelf", gw.anchorPick, null);
  const chosen = await post({ image: IMG, clientId: ME, category: "Wine", wineVisit: { seen: [], rejected: [], favorite: { name: "Josh Cellars Cabernet Sauvignon", dry: 2, body: 4 } } });
  check("a chosen reference wins over the auto one", [chosen.json.wine.autoRef, chosen.json.wine.reference.name], [false, "Josh Cellars Cabernet Sauvignon"]);

  out("\n4. The route — the text branch, a shelf bottle picked");
  const first = shelf.json;
  const base = { detectedItem: first.detected_item, token: first.detected_item_token, clientId: ME, shelf: sw.shelf, shelfSnap: true, anchorPrice: 14.99, anchorPriceSource: "tag", seen: [], rejected: [], goTo: "Dr. Loosen Dr. L Riesling" };
  const pick = await post({ wine: { ...base, kind: "set", favorite: { name: "Oyster Bay Sauvignon Blanc", description: null, dry: null, body: null } } });
  check("200, five back", [pick.status, pick.json.reks.length > 0], [200, true]);
  check("lines against the picked bottle", [/GO-TO WINE is Oyster Bay Sauvignon Blanc/.test(lastSystem()), pick.json.reks.every((r) => typeof r.wine.vsFavorite === "string")], [true, true]);
  check("the picked bottle is never a pick", pick.json.reks.some((r) => /Oyster Bay/.test(r.name)), false);
  check("its taste position comes back (the model's go_to)", pick.json.reference, { name: "Oyster Bay Sauvignon Blanc", dry: 3, body: 3 });
  check("the reference is logged with the set", logs.some((a) => a[0] === "[wine] picks" && a[1].reference && a[1].reference.name === "Oyster Bay Sauvignon Blanc" && a[1].reference.taste === true), true);
  const neutral = await post({ wine: { ...base, kind: "set" } });
  check("no reference → no lines, no reference back", [neutral.json.reference, neutral.json.reks.every((r) => r.wine.vsFavorite === null)], [null, true]);
  restore();

  out("\n5. The client, from source");
  const rsr = read("src/components/RekSnapResults.tsx");
  const page = read("app/page.tsx");
  const top = read("src/components/WineTopCard.tsx");
  const sheet = read("src/components/WineCompareSheet.tsx");
  const facts = read("src/components/WineFacts.tsx");
  check("the go-to rides as goTo, never as the comparison", /goTo: getWineFavorite\(\)\?\.name \?\? null/.test(page) && !/favorite: getWineFavorite\(\)/.test(page) && !/favorite: getWineFavorite\(\)/.test(rsr), true);
  check("re-runs send the first reference", /favorite: refPayload\(wineRefsRef\.current\[0\], forResult\.detected_item\.description\)/.test(rsr), true);
  check("the bottle pills are gone", /data-testid="shelf-preview"/.test(rsr), false);
  check('status line: "Reading the shelf…", then its count', rsr.includes('"Reading the shelf…"') && rsr.includes("`Reading the shelf… ${early.length} bottles found`"), true);
  check('top card labels: "This shelf · most popular" / "Comparing to · from this shelf"', rsr.includes('label="This shelf · most popular"') && rsr.includes('"Comparing to · from this shelf"'), true);
  check("the shelf top card has no star, save or thumbs", !/SignalButtons|Bookmark|Star|onThumb|onSave/.test(top), true);
  check("the compare card: amber outline and a ×", /border-\[3px\] border-amber-500/.test(top) && /<X size=\{20\}/.test(top), true);
  check('"Your 5 from this shelf" + the movie header\'s Compare to', rsr.includes(">Your 5 from this shelf<") && /<CompareHeader\s+refs=\{wineRefs\.map/.test(rsr), true);
  check("vs. lines name the reference; your only for the starred go-to", rsr.includes('`vs. ${refIsGoTo ? "your " : ""}${shortWineName(reference.name)}: ${rek.wine.vsFavorite}.`'), true);
  check("the ring legend drops your for other references", /\{refIsGoTo \? `your \$\{favShort\}` : favShort\}/.test(facts), true);
  check('sheet: "This shelf N" first, selected by default, with the helper line', sheet.includes('["This shelf", "Favorites", "Recent", "Saved"]') && sheet.includes('(shelfList.length ? "This shelf"') && sheet.includes('"Every bottle we read in your shelf photo. Pick one you know."'), true);
  check("sheet: up to 3, like movies", /if \(picked\.length >= MAX_WINE_REFS\) return;/.test(sheet) && /export const MAX_WINE_REFS = MAX_REFS;/.test(read("src/lib/wineCompare.ts")), true);
  check("× brings the five from before back", /const before = preCompareRef\.current;/.test(rsr) && /before\.filter\(\(r\) => !gone\.has\(r\.name\)\)/.test(rsr), true);
  check("a new snap clears the references (single bottle: the snapped one)", /result\.wine\?\.autoRef && result\.wine\.scene !== "haul"/.test(rsr) && /preCompareRef\.current = null;\s*setWineSheetOpen\(false\);/.test(rsr), true);
  check("moving the bar off Wine clears them", /was !== barCategory && wineRefsRef\.current\.length\) applyWineRefsRef\.current\(\[\]\)/.test(rsr), true);
  check("nothing new leaves the device (no fetch in the wine compare modules)", [/fetch\(/.test(read("src/lib/wineCompare.ts")), /fetch\(/.test(top), /fetch\(/.test(sheet)], [false, false, false]);

  out(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
