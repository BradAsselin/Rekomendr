/* eslint-disable no-console */
//
// scripts/validate-s8b.cjs — S8b: the wine shelf engine (docs/s8-wine-shelf-plan.md).
//
//   1. Price: ±35% default band ($23 → $15–31), chips, estimate slack.
//   2. Names: the same bottle is recognized across shelf/model/dislike
//      spellings; different grapes of one producer are different wines.
//   3. The response-site guarantees (finishWineReks): no repeats in a visit,
//      disliked producers never return, the band holds, shelf first, tag
//      prices win, scores only from the shelf, off-shelf labeled, the
//      anchor and the favorite are never reks.
//   4. The route: a wine snap's Similar is the engine's; the visit's seen
//      list holds across snaps (15 different reks in three snaps); the
//      favorite on the shelf is flagged; the text branch is attested and
//      walled (health and non-wine refused).
//
// Compiles the REAL /api/reksnap route and the wine libs. Stubs OpenAI by
// routing on each request's system prompt. No keys, no network.
//
//   node scripts/validate-s8b.cjs
//
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CACHE = path.join(ROOT, "node_modules", ".cache");
fs.mkdirSync(CACHE, { recursive: true });
const OUT = fs.mkdtempSync(path.join(CACHE, "s8b-validate-"));

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
const calls = { vision: 0, shelf: 0, wine: 0 };
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
            calls.shelf++;
            text = JSON.stringify(shelfReply);
          } else if (sys.startsWith("You are a taste-aware wine recommendation engine")) {
            calls.wine++;
            wineRequests.push(req);
            text = JSON.stringify(wineReply(req));
          } else {
            calls.vision++;
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
process.env.MINT_SIGNING_SECRET = "s8b-secret";
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
const quiet = () => {
  const saved = [console.info, console.warn];
  console.info = () => {};
  console.warn = () => {};
  return () => { [console.info, console.warn] = saved; };
};

const ME = "anon_s8b_client_0001";
const IMG = "data:image/jpeg;base64,AAAA";

(async () => {
  out("\n1. Price");
  check("$23 anchor → $15–31", W.bandFor(23, null), { min: 15, max: 31, chip: null });
  check("Splurge chip → $60 and up", [W.bandFor(23, "splurge").min, W.bandText(W.bandFor(23, "splurge"))], [60, "$60 and up"]);
  check("Under $20 chip text", W.bandText(W.bandFor(null, "under20")), "under $20");
  check("no price and no chip → no band", W.bandFor(null, null), null);
  const b = W.bandFor(23, null);
  check("estimate $32.50 within slack, $34 out", [W.inBand(32.5, b, "estimate"), W.inBand(34, b, "estimate")], [true, false]);
  check("a tag gets no slack ($31.99 out)", W.inBand(31.99, b, "tag"), false);
  check("formatPrice tag / estimate", [W.formatPrice(17.99, "tag"), W.formatPrice(21.6, "estimate")], ["$17.99", "about $22"]);

  out("\n2. Names");
  check("shelf 'Cannonball Cabernet' = 'Cannonball Cabernet Sauvignon 2021'", W.sameWine("Cannonball Cabernet", "Cannonball Cabernet Sauvignon 2021"), true);
  check("'Matua Sauvignon Blanc' ≠ 'Matua Pinot Noir'", W.sameWine("Matua Sauvignon Blanc", "Matua Pinot Noir"), false);
  check("'La Marca Prosecco' = 'LA MARCA Prosecco DOC'", W.sameWine("La Marca Prosecco", "LA MARCA Prosecco DOC"), true);
  check("'Decoy Cabernet' and 'Decoy Merlot': same producer", W.sameProducer("Decoy Cabernet Sauvignon", "Decoy Merlot"), true);
  check("'Josh Cellars Cabernet' vs 'Bogle Cabernet': different producer", W.sameProducer("Josh Cellars Cabernet", "Bogle Cabernet"), false);
  check("short name of the go-to", W.shortWineName("Caymus Bonanza Cabernet Sauvignon 2021"), "Caymus Bonanza");

  out("\n3. Guarantees");
  const shelf = W.cleanShelfRead({
    scene: "shelf",
    bottles: [
      { name: "Josh Cellars Cabernet Sauvignon", price: 14.99 },
      { name: "Cannonball Cabernet", price: 17.99, talker_points: 90, talker_source: "Wine Enthusiast" },
      { name: "Bonanza Cabernet", price: 16.99, staff_pick: true },
      { name: "Silver Oak Alexander Valley", price: 89.99, talker_points: 150 },
    ],
  }).bottles;
  check("an impossible score (150) is never kept", shelf.find((x) => /silver/i.test(x.name)).talkerPoints, null);
  const raw = [
    { name: "Silver Oak Alexander Valley Cabernet", price_usd: 85 },
    { name: "Decoy Cabernet Sauvignon", price_usd: 22 },
    { name: "Bogle Cabernet Sauvignon", price_usd: 16, dry_sweet: 2, light_bold: 4 },
    { name: "Cannonball Cabernet Sauvignon", price_usd: 22, dry_sweet: 1.4, light_bold: 9, vs_favorite: "vs. your Bonanza: Drier, less vanilla." },
    { name: "Josh Cellars Cabernet Sauvignon", price_usd: 15 },
    { name: "Meiomi Pinot Noir", price_usd: 22 },
    { name: "Caymus Bonanza Cabernet", price_usd: 20 },
    { name: "Robert Mondavi Private Selection Cabernet", price_usd: 18 },
  ];
  const fin = W.finishWineReks(raw, {
    anchorName: "Josh Cellars Cabernet Sauvignon",
    anchorCategory: "wine",
    shelf,
    shelfSnap: true,
    band: W.bandFor(23, null),
    seen: ["Meiomi Pinot Noir 2022"],
    disliked: ["Decoy Red Blend"],
    favoriteName: "Bonanza Cabernet",
    need: 5,
  });
  const names = fin.reks.map((r) => r.name);
  check("anchor, favorite, seen, disliked producer, out-of-band all dropped", [fin.log.droppedSelf, fin.log.droppedSeen, fin.log.droppedDisliked, fin.log.droppedBand], [2, 1, 1, 1]);
  check("shelf bottles first, then off-shelf in the model's order", names, ["Cannonball Cabernet Sauvignon", "Bogle Cabernet Sauvignon", "Robert Mondavi Private Selection Cabernet"]);
  const cb = fin.reks[0].wine;
  check("on-shelf pick carries its TAG price, the talker, onShelf", [cb.price, cb.priceSource, cb.onShelf, cb.offShelf, cb.talkerPoints, cb.talkerSource], [17.99, "tag", true, false, 90, "Wine Enthusiast"]);
  check("taste clamps to 1..5", [cb.dry, cb.body], [1, 5]);
  check("vs_favorite arrives bare and lowercase", cb.vsFavorite, "drier, less vanilla");
  const bg = fin.reks[1].wine;
  check("off-shelf pick on a shelf snap: estimate, labeled, no score", [bg.price, bg.priceSource, bg.offShelf, bg.talkerPoints], [16, "estimate", true, null]);
  const noShelf = W.finishWineReks([{ name: "Bogle Cabernet Sauvignon", price_usd: 12 }], { anchorName: "x", anchorCategory: "wine", shelf: null, shelfSnap: false, band: null, seen: [], disliked: [], favoriteName: null, need: 5 });
  check("no shelf snap → never labeled off-shelf, no vs line without a favorite", [noShelf.reks[0].wine.offShelf, noShelf.reks[0].wine.vsFavorite], [false, null]);

  out("\n4. Prompt assembly (conditional blocks)");
  const ctx = { kind: "set", count: 8, anchor: { name: "A", description: "d", category: "wine" }, anchorPrice: 23, anchorPriceSource: "tag", band: W.bandFor(23, null), shelf: null, shelfSnap: false, seen: [], disliked: [], favorite: null, chained: null, kept: [] };
  const p0 = R.buildWineReksPrompt("VOICE", ctx);
  check("no favorite → no go-to block, no vs_favorite field", [/GO-TO/.test(p0), /vs_favorite/.test(p0)], [false, false]);
  check("no shelf → big-box availability rule", /widely distributed labels that a typical US grocery/.test(p0), true);
  const p1 = R.buildWineReksPrompt("VOICE", { ...ctx, favorite: { name: "Bonanza" }, shelf, shelfSnap: true, kind: "backfill" });
  check("favorite → go-to block; shelf → shelf-first; replacement → must come from shelf", [/GO-TO WINE is Bonanza/.test(p1), /ON THE SHELF \(listed below\)/.test(p1), /MUST come from it/.test(p1)], [true, true, true]);
  check("the locked voice block rides verbatim", p1.includes("\nVOICE\n"), true);
  check("price band in words", /inside \$15–\$31/.test(p0), true);

  out("\n5. The route — a shelf snap");
  const restore = quiet();
  visionReply = JSON.stringify({
    detected_item: { name: "Josh Cellars Cabernet Sauvignon", description: "Dry and plush — blackberry and mocha. Built for a grilled steak dinner, not a light salad.", category: "wine" },
    mode: "uses",
    results: {
      similar: [1, 2, 3, 4, 5].map((i) => ({ name: `Vision Sim ${i}`, description: "x", category: "wine" })),
      uses: [1, 2, 3, 4, 5].map((i) => ({ name: `Dish ${i}`, description: "x", category: "food" })),
      alternatives: [1, 2, 3, 4, 5].map((i) => ({ name: `Alt ${i}`, description: "x", category: "wine" })),
    },
  });
  shelfReply = {
    scene: "shelf",
    anchor_price: null,
    bottles: [
      { name: "Josh Cellars Cabernet Sauvignon", price: 22.99 },
      { name: "Cannonball Cabernet", price: 17.99, talker_points: 90, talker_source: "Wine Enthusiast" },
      { name: "Bonanza Cabernet", price: 16.99 },
      { name: "Decoy Cabernet", price: 24.99 },
    ],
  };
  // A model that ignores instructions: repeats, the favorite, a disliked
  // producer, out-of-band picks — the response site must hold anyway.
  let gen = 0;
  wineReply = () => {
    gen++;
    const pool = [];
    for (let i = 1; i <= 30; i++) pool.push({ name: `Producer${i} Cabernet Sauvignon`, price_usd: 15 + (i % 15), dry_sweet: 2, light_bold: 4, vs_favorite: "drier" });
    return {
      anchor: { price_usd: 99, dry_sweet: 2, light_bold: 4 },
      reks: [
        { name: "Cannonball Cabernet Sauvignon", price_usd: 20 },
        { name: "Decoy Cabernet Sauvignon", price_usd: 22 },
        { name: "Bonanza Cabernet", price_usd: 17 },
        { name: "Splurgey Reserve Cabernet", price_usd: 120 },
        ...pool,
      ],
    };
  };
  const seen = [];
  const sets = [];
  for (let i = 0; i < 3; i++) {
    const r = await post({ image: IMG, clientId: ME, category: "Wine", wineVisit: { seen, rejected: ["Decoy Red Blend"], favorite: { name: "Bonanza Cabernet", dry: 2, body: 4 } } });
    sets.push(r.json);
    seen.push(r.json.detected_item.name, ...r.json.results.similar.map((x) => x.name));
  }
  restore();
  const first = sets[0];
  check("200, anchor cut, Similar is the engine's (not the vision list)", [!!first.detected_item, first.detected_item.description, first.results.similar.some((x) => /Vision Sim/.test(x.name))], [true, "Dry and plush — blackberry and mocha.", false]);
  check("shelf snap → mode similar", first.mode, "similar");
  check("anchor price = its TAG ($22.99), not the model's $99", [first.wine.anchor.price, first.wine.anchor.priceSource], [22.99, "tag"]);
  check("band = tag ±35% ($15–31)", [first.wine.band.min, first.wine.band.max], [15, 31]);
  check("first pick: the shelf's Cannonball, tag price + talker", [first.results.similar[0].name, first.results.similar[0].wine.price, first.results.similar[0].wine.talkerPoints], ["Cannonball Cabernet Sauvignon", 17.99, 90]);
  check("favorite on the shelf flagged with its tag", first.wine.favoriteHere, { name: "Bonanza Cabernet", price: 16.99 });
  const allNames = sets.flatMap((s) => s.results.similar.map((x) => x.name.toLowerCase()));
  check("three snaps → 15 reks, all different", [allNames.length, new Set(allNames).size], [15, 15]);
  check("never Decoy, never the favorite, never out of band", [allNames.some((n) => /decoy|bonanza|splurgey/.test(n))], [false]);
  check("every rek carries a token; model-written vs_favorite rides through", first.results.similar.slice(1).every((x) => x.wine.vsFavorite === "drier" && !!x.token), true);
  check("Use it for and Instead try stay the vision read's", [first.results.uses[0].name, first.results.alternatives[0].name], ["Dish 1", "Alt 1"]);
  check("shelf read once per snap, picks once per snap", [calls.shelf, calls.wine], [3, 3]);

  out("\n6. The route — the text branch");
  const restore2 = quiet();
  const tok = first.detected_item_token;
  const base = { detectedItem: first.detected_item, token: tok, clientId: ME, shelf: first.wine.shelf, shelfSnap: true, anchorPrice: 22.99, anchorPriceSource: "tag", seen, rejected: [] };
  const chip = await post({ wine: { ...base, kind: "set", chip: "splurge" } });
  const lastWine = wineRequests[wineRequests.length - 1].messages[0].content;
  check("Splurge chip: the prompt asks for $60 and up", /inside \$60 and up/.test(lastWine), true);
  check("Splurge chip: only the $120 pick survives the band", chip.json.reks.map((r) => r.name), ["Splurgey Reserve Cabernet"]);
  const bf = await post({ wine: { ...base, kind: "backfill" } });
  check("backfill → one rek", [bf.status, typeof bf.json.rek?.name], [200, "string"]);
  const forged = await post({ wine: { ...base, kind: "set", detectedItem: { ...first.detected_item, description: "forged" } } });
  check("forged anchor text → 400 (attested)", forged.status, 400);
  const steerNoChain = await post({ wine: { ...base, kind: "steer" } });
  check("steer without a chained wine → 400", steerNoChain.status, 400);
  wineReply = () => ({ anchor: {}, reks: [{ name: "Josh Cellars Cabernet Sauvignon", price_usd: 20 }] });
  const none = await post({ wine: { ...base, kind: "set" } });
  check("nothing survives → honest notice, empty list", [none.json.reks.length, none.json.notice], [0, "No new bottles left in this price range. Try another price above."]);
  restore2();

  out(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
