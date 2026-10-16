/* eslint-disable no-console */
//
// scripts/validate-s8a.cjs — S8a: wine quick fixes (docs/s8-wine-shelf-plan.md).
//
//   1. The pairing sentence ("Built for X, not Y") never survives on a wine
//      anchor — field strings, a generated corpus of the mold, and the route
//      end to end (the token signs the cut text, so save/share attest it).
//      THIS FAILS IF THE PATTERN RETURNS.
//   2. Non-wine anchors keep their second sentence (byte-identical).
//   3. Dense shelves: a failed whole-photo read names itself and asks for
//      strips; a strip read that fails on a wine shelf says "That's a lot of
//      bottles"; strips that read fine ship a normal result; the photo goes
//      up at detail "high".
//   4. The bottle and where-to-buy links.
//
// Compiles the REAL /api/reksnap route and src/lib/wineShelf.ts from
// source. Stubs OpenAI. No keys, no network.
//
//   node scripts/validate-s8a.cjs
//
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CACHE = path.join(ROOT, "node_modules", ".cache");
fs.mkdirSync(CACHE, { recursive: true });
const OUT = fs.mkdtempSync(path.join(CACHE, "s8a-validate-"));

console.log("Compiling /api/reksnap and wineShelf from source…");
execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "tsc",
    "app/api/reksnap/route.ts",
    "src/lib/wineShelf.ts",
    "--outDir", OUT,
    "--rootDir", ".",
    "--module", "commonjs",
    "--target", "es2020",
    "--moduleResolution", "node",
    "--esModuleInterop",
    "--skipLibCheck",
    "--lib", "es2020,dom",
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

/* ---------------- OpenAI stub: scripted replies ---------------- */
const calls = [];
const replies = []; // queue of { text } | { throw }
const nextReply = () => replies.shift() ?? { text: "" };
class FakeOpenAI {
  constructor() {
    this.moderations = { create: async () => ({ results: [{ flagged: false }] }) };
    this.chat = {
      completions: {
        create: async (req) => {
          calls.push(req);
          const r = nextReply();
          if (r.throw) throw r.throw;
          if (req.stream) {
            const text = r.text;
            return {
              async *[Symbol.asyncIterator]() {
                const step = 40;
                for (let i = 0; i < text.length; i += step) {
                  yield { choices: [{ delta: { content: text.slice(i, i + step) } }] };
                }
                yield { choices: [{ delta: {}, finish_reason: r.finish ?? "stop" }] };
                yield { choices: [], usage: { prompt_tokens: 1000, completion_tokens: 200 } };
              },
            };
          }
          return {
            choices: [{ message: { content: r.text }, finish_reason: r.finish ?? "stop" }],
            usage: { prompt_tokens: 1000, completion_tokens: 200 },
          };
        },
      },
    };
  }
}
const seed = (file, exports) => {
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
seed(require.resolve("openai"), { __esModule: true, default: FakeOpenAI });

process.env.OPENAI_API_KEY = "stub";
process.env.MINT_SIGNING_SECRET = "s8a-secret";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.TMDB_API_KEY;

const route = require(path.join(OUT, "app/api/reksnap/route.js"));
const wine = require(path.join(OUT, "src/lib/wineShelf.js"));
const { verifyAnchor } = require(path.join(OUT, "src/lib/mintToken.js"));

const post = async (body) => {
  const res = await route.POST(
    new Request("http://local/api/reksnap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  return { status: res.status, json: await res.json().catch(() => null) };
};

const ME = "anon_s8a_client_0001";
const IMG = "data:image/jpeg;base64,AAAA";
const rek = (name, category = "wine") => ({ name, description: "Similarly dry. Moves. Lands.", category, rank: 1 });
const five = (prefix, category) => [1, 2, 3, 4, 5].map((i) => rek(`${prefix} ${i}`, category));
const snapJson = (item) =>
  JSON.stringify({
    detected_item: item,
    mode: "similar",
    results: {
      similar: five("Sim", item.category),
      uses: five("Use", "food"),
      alternatives: five("Alt", item.category),
    },
  });

const S1_RED = "Dry and fruit-forward — blackberry and plum over hints of vanilla and oak.";
const S1_WHITE = "Dry and zesty — grapefruit and passionfruit over a grassy, mineral edge.";

(async () => {
  out("\n1. The pairing sentence — unit");
  const field = [
    [`${S1_RED} Built for a grilled steak dinner, not a light salad.`, S1_RED],
    [`${S1_WHITE} Built for a fresh seafood dinner, not a rich, creamy pasta.`, S1_WHITE],
    [`${S1_RED} Built for a weeknight steak, not a tasting night.`, S1_RED],
    [`Off-dry and peach-led — ripe stone fruit where most bottles on the same shelf go citrus-sharp. Built for spicy takeout on a weeknight, not a cheese board.`, "Off-dry and peach-led — ripe stone fruit where most bottles on the same shelf go citrus-sharp."],
    [`${S1_WHITE} A hot afternoon on the porch, not a rich dinner.`, S1_WHITE],
    [`${S1_RED} Made for slow-cooked short ribs rather than a light fish dinner.`, S1_RED],
    [`${S1_RED} Pairs with burgers off the grill.`, S1_RED],
    [`${S1_RED} Pour it alongside a cheese board.`, S1_RED],
  ];
  for (const [input, want] of field) check(`cut: "${input.slice(input.indexOf(".") + 2, input.indexOf(".") + 48)}…"`, wine.stripPairingSentence(input), want);
  check("one sentence stays as is", wine.stripPairingSentence(S1_RED), S1_RED);
  check("sentence 1 is never touched, even if it pairs", wine.stripPairingSentence("Built for steak, not salad — dry and tannic."), "Built for steak, not salad — dry and tannic.");
  check("a non-pairing sentence 2 stays", wine.stripPairingSentence(`${S1_RED} The finish runs long and dusty.`), `${S1_RED} The finish runs long and dusty.`);

  out("\n2. The mold, generated — zero may survive");
  const openers = ["Built for", "built for", "Made for", "Meant for", "Designed for", "Happiest with", "Best with", "At its best with", "Shines with", "Works best with"];
  const xs = ["a grilled steak dinner", "a fresh seafood dinner", "spicy takeout on a weeknight", "a backyard barbecue", "roast chicken on a Sunday", "a weeknight pasta", "a cheese board"];
  const ys = ["a light salad", "a rich, creamy pasta", "a tasting night", "a dessert course", "a steakhouse", "a hot afternoon"];
  let total = 0;
  let survived = 0;
  const survivors = [];
  for (const o of openers) for (const x of xs) for (const y of ys) {
    for (const s1 of [S1_RED, S1_WHITE]) {
      total++;
      const got = wine.stripPairingSentence(`${s1} ${o} ${x}, not ${y}.`);
      if (got !== s1) { survived++; if (survivors.length < 3) survivors.push(got); }
    }
  }
  check(`"Built for X, not Y" variants surviving (of ${total})`, survived, 0);
  if (survivors.length) out(`        e.g. ${survivors.join(" | ")}`);

  out("\n3. The route — wine anchors are cut, and the token signs the cut");
  const wineItem = { name: "Caymus Bonanza Cabernet Sauvignon", description: `${S1_RED} Built for a grilled steak dinner, not a light salad.`, category: "wine" };
  replies.push({ text: snapJson(wineItem) });
  calls.length = 0;
  const r1 = await post({ image: IMG, clientId: ME, category: "Wine" });
  check("200", r1.status, 200);
  check("anchor description = sentence 1 only", r1.json?.detected_item?.description, S1_RED);
  check("token verifies over the CUT text", verifyAnchor({ name: wineItem.name, category: "wine", short: S1_RED, long: null, clientId: ME }, r1.json?.detected_item_token), true);
  check("token does NOT verify over the model's original", verifyAnchor({ name: wineItem.name, category: "wine", short: wineItem.description, long: null, clientId: ME }, r1.json?.detected_item_token), false);
  const img = calls[0]?.messages?.[1]?.content?.find((c) => c.type === "image_url");
  check("photo goes up at detail high", img?.image_url?.detail, "high");

  for (const cat of ["red wine", "white wine", "sparkling wine", "prosecco", "rosé"]) {
    replies.push({ text: snapJson({ ...wineItem, category: cat }) });
    const r = await post({ image: IMG, clientId: ME });
    check(`category "${cat}" is cut too`, r.json?.detected_item?.description, S1_RED);
  }

  const typedItem = { name: "Kim Crawford Sauvignon Blanc", description: `${S1_WHITE} Built for a fresh seafood dinner, not a rich, creamy pasta.`, category: "wine" };
  replies.push({ text: JSON.stringify({ specific: true, name: "Kim Crawford Sauvignon Blanc" }) });
  replies.push({ text: snapJson(typedItem) });
  const rt = await post({ typed: { text: "kim crawford sauv blanc", clientId: ME } });
  check("typed wine by name is cut too", rt.json?.detected_item?.description, S1_WHITE);

  out("\n4. Non-wine anchors keep their second sentence");
  const coffee = { name: "Stumptown Hair Bender", description: "Medium roast — cherry and dark chocolate. Built for a slow Sunday pour-over, not a rushed drip pot.", category: "coffee" };
  replies.push({ text: snapJson(coffee) });
  const rc = await post({ image: IMG, clientId: ME });
  check("coffee anchor unchanged", rc.json?.detected_item?.description, coffee.description);
  const beer = { name: "Sierra Nevada Pale Ale", description: "Hop-forward and piney. Built for a backyard burger, not a dessert.", category: "beer" };
  replies.push({ text: snapJson(beer) });
  check("beer anchor unchanged", (await post({ image: IMG, clientId: ME })).json?.detected_item?.description, beer.description);

  out("\n5. Dense shelves");
  const warn = console.warn;
  const warned = [];
  console.warn = (...a) => { warned.push(a); };
  replies.push({ text: "I'm sorry, I can't identify the individual bottles in this image.", finish: "stop" });
  const d1 = await post({ image: IMG, clientId: ME, category: "Movies" });
  check("unparseable whole photo → 502 asking for strips", [d1.status, d1.json?.retry], [502, "strips"]);
  const line = warned.find((a) => a[0] === "[snap-read-fail]");
  check("…and names itself: [snap-read-fail] with why + head + finish reason", [!!line, line?.[1]?.why, line?.[1]?.finishReason, (line?.[1]?.head || "").startsWith("I'm sorry")], [true, "unparseable", "stop", true]);

  calls.length = 0;
  replies.push({ text: "{}" });
  const d2 = await post({ strips: [IMG, IMG, IMG], clientId: ME, category: "Wine" });
  check("strips fail on the Wine bar → the bottles line", [d2.status, d2.json?.error, d2.json?.dense, d2.json?.retry ?? null], [502, "That's a lot of bottles. Try one or two shelves.", true, null]);
  const stripImgs = (calls[0]?.messages?.[1]?.content || []).filter((c) => c.type === "image_url");
  check("strip call sends every strip at detail high", [stripImgs.length, stripImgs.every((c) => c.image_url.detail === "high")], [3, true]);
  check("strip call is not streamed", !!calls[0]?.stream, false);

  replies.push({ text: JSON.stringify({ detected_item: { name: "Wine shelf", description: "x", category: "wine" }, results: {} }) });
  const d3 = await post({ strips: [IMG, IMG, IMG], clientId: ME, category: "Movies" });
  check("strips fail but the read said wine → the bottles line", d3.json?.error, "That's a lot of bottles. Try one or two shelves.");

  replies.push({ text: "nope" });
  const d4 = await post({ strips: [IMG, IMG], clientId: ME, category: "Movies" });
  check("strips fail on a non-wine read → the plain read failure", [d4.json?.error, d4.json?.dense ?? null], ["Could not read that photo.", null]);

  replies.push({ text: snapJson(wineItem) });
  const d5 = await post({ strips: [IMG, IMG, IMG], clientId: ME });
  check("strips that read → a normal, cut wine result", [d5.status, d5.json?.detected_item?.description, d5.json?.results?.similar?.length], [200, S1_RED, 5]);

  replies.push({ text: JSON.stringify({ detected_item: { name: "Shelf", description: "x", category: "wine" }, results: { similar: [], uses: [], alternatives: [] } }) });
  const d6 = await post({ image: IMG, clientId: ME });
  check("all lists empty on a whole photo → strips asked for too", [d6.status, d6.json?.retry], [502, "strips"]);
  console.warn = warn;

  out("\n6. Links");
  check("bottle image search", wine.bottleImageUrl("Caymus Bonanza Cabernet Sauvignon"), "https://www.google.com/search?tbm=isch&q=Caymus%20Bonanza%20Cabernet%20Sauvignon%20bottle");
  check("where to buy", wine.whereToBuyUrl("Cannonball Cabernet Sauvignon"), "https://www.google.com/search?tbm=shop&q=Cannonball%20Cabernet%20Sauvignon%20wine");
  check("isWineCategory: wine words yes, beer/spirits no", ["wine", "Red Wine", "prosecco", "beer", "whiskey", "cider", ""].map(wine.isWineCategory), [true, true, true, false, false, false, false]);

  out("\n7. Source fence");
  const src = fs.readFileSync(path.join(ROOT, "app/api/reksnap/route.ts"), "utf8");
  check("vision SYSTEM_PROMPT still asks for sentence 2 (voice text untouched)", src.includes("Sentence 2: one concrete moment or contrast"), true);
  check("cut happens before signAnchor", src.indexOf("stripPairingSentence(modelShort)") < src.indexOf("const detectedItemToken"), true);

  out(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
