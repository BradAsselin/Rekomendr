/* eslint-disable no-console */
//
// scripts/validate-s21.cjs — the health wall on the result tabs.
//
// Compiles the REAL /api/reksnap route from source and drives it with a stub
// OpenAI (a scripted vision answer) and an in-memory Supabase stand-in. No
// keys, no network. Proves: a health anchor ships NO rek list (S2.1 took the
// tabs, S2.4 took Similar), whatever mode the model inferred, and no backfill
// can generate one for it; every non-health anchor is unchanged. S2.5: the
// health anchor's own short is its category alone (S2.6), built in code and
// signed as such; no long tier generates. The client half is asserted from
// source (tab row, list reset, the plain line, the short twin).
//
//   node scripts/validate-s21.cjs
//
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CACHE = path.join(ROOT, "node_modules", ".cache");
fs.mkdirSync(CACHE, { recursive: true });
const OUT = fs.mkdtempSync(path.join(CACHE, "s21-validate-"));

console.log("Compiling /api/reksnap from source…");
execFileSync(
  "npx",
  [
    "tsc",
    "app/api/reksnap/route.ts",
    "src/lib/anchorSnapshots.ts",
    "--outDir", OUT,
    "--rootDir", ".",
    "--module", "commonjs",
    "--target", "es2020",
    "--moduleResolution", "node",
    "--esModuleInterop",
    "--skipLibCheck",
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
  out(`  ${ok ? "PASS" : "FAIL"}  ${label}  (got ${a}, expected ${e})`);
};

let logs = [];
for (const level of ["warn", "info", "log", "error"]) {
  const orig = console[level].bind(console);
  console[level] = (...args) => {
    logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    if (process.env.S21_VERBOSE) orig(...args);
  };
}
const logged = (needle) => logs.some((l) => l.includes(needle));

/* In-memory Supabase: every read is empty, every insert succeeds. */
function query() {
  const b = {
    select() { return b; }, insert() { return b; }, eq() { return b; }, gt() { return b; },
    gte() { return b; }, in() { return b; }, order() { return b; }, limit() { return b; },
    not() { return b; }, is() { return b; }, ilike() { return b; },
    maybeSingle() { return Promise.resolve({ data: null, error: null }); },
    then(res, rej) { return Promise.resolve({ data: [], error: null, count: 0 }).then(res, rej); },
  };
  return b;
}
const fakeSupabase = { from: () => query() };

/* Stub OpenAI: answers with whatever the case scripted. */
const ai = { calls: 0, next: null };
class FakeOpenAI {
  constructor() {
    this.chat = {
      completions: {
        create: async () => {
          ai.calls++;
          return {
            choices: [{ message: { content: JSON.stringify(ai.next) } }],
            usage: { prompt_tokens: 1234, completion_tokens: 567 },
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
const SUPA = path.join(OUT, "src/lib/supabaseServer.js");
seed(SUPA, { supabaseServer: fakeSupabase });
delete process.env.TMDB_API_KEY;
delete process.env.MINT_SIGNING_SECRET;
process.env.OPENAI_API_KEY = "stub";
process.env.SUPABASE_URL = "http://stub.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "stub";

const { POST } = require(path.join(OUT, "app/api/reksnap/route.js"));
const CLIENT = "anon_s21_harness";
const post = async (body) => {
  const res = await POST(
    new Request("http://local/api/reksnap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: CLIENT, ...body }),
    })
  );
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
};

const five = (prefix, category) =>
  [1, 2, 3, 4, 5].map((i) => ({
    name: `${prefix} ${i}`,
    description: `${prefix} ${i} description.`,
    category,
    rank: i,
  }));
const visionAnswer = (category, mode) => ({
  detected_item: { name: "Vitafusion Recovery Gummies", description: "A gummy supplement.", category },
  mode,
  results: {
    similar: five("Similar", category),
    uses: five("Take after exercising to support muscle recovery", category),
    alternatives: five("Instead", category),
  },
});
const IMAGE = "data:image/jpeg;base64,AAAA";

(async () => {
  out("\n1. Health anchors ship no rek list");
  for (const category of ["supplement", "vitamins", "medication", "skincare", "Supplements "]) {
    for (const mode of ["uses", "alternatives", "similar"]) {
      logs = [];
      ai.next = visionAnswer(category, mode);
      const r = await post({ image: IMAGE });
      const tag = `${JSON.stringify(category)} / model mode ${mode}`;
      check(`${tag}: 200`, r.status, 200);
      check(`${tag}: uses withheld`, r.json?.results?.uses?.length, 0);
      check(`${tag}: alternatives withheld`, r.json?.results?.alternatives?.length, 0);
      check(`${tag}: similar withheld`, r.json?.results?.similar?.length, 0);
      check(`${tag}: lands on similar`, r.json?.mode, "similar");
      check(`${tag}: no notice (not the new-to-me voice)`, r.json?.notice, undefined);
      if (mode === "uses") check(`${tag}: [health-wall] tripwire`, logged("[health-wall] rek lists withheld"), true);
    }
  }
  // The field case's text never leaves the server.
  ai.next = visionAnswer("supplement", "uses");
  const field = await post({ image: IMAGE });
  check("field-case claim text absent from the response", JSON.stringify(field.json).includes("muscle recovery"), false);
  check("no Similar text in the response either", JSON.stringify(field.json).includes("Similar 1"), false);
  check("anchor itself still ships", field.json?.detected_item?.name, "Vitafusion Recovery Gummies");

  out("\n2. Health anchor whose Similar list is empty: anchor only, no notice, no 502");
  ai.next = { ...visionAnswer("supplement", "uses"), results: { similar: [], uses: five("Take daily", "supplement"), alternatives: [] } };
  const thin = await post({ image: IMAGE });
  check("status 200", thin.status, 200);
  check("all lists empty", [thin.json?.results?.similar?.length, thin.json?.results?.uses?.length, thin.json?.results?.alternatives?.length], [0, 0, 0]);
  check("mode similar", thin.json?.mode, "similar");
  check("no new-to-me notice", thin.json?.notice, undefined);

  out("\n3. Positive control: non-health anchors are unchanged");
  for (const category of ["wine", "scotch", "food", "book", "cleaning"]) {
    logs = [];
    ai.next = visionAnswer(category, "uses");
    const r = await post({ image: IMAGE });
    check(`${category}: all three lists ship`, [r.json?.results?.similar?.length, r.json?.results?.uses?.length, r.json?.results?.alternatives?.length], [5, 5, 5]);
    check(`${category}: model's mode kept`, r.json?.mode, "uses");
    check(`${category}: no [health-wall] line`, logged("[health-wall]"), false);
  }

  out("\n4. Backfill: nothing generates for a health anchor");
  const item = { name: "Vitafusion Recovery Gummies", description: "A gummy supplement.", category: "supplement" };
  for (const mode of ["uses", "alternatives", "similar"]) {
    ai.calls = 0;
    const r = await post({ backfill: { detectedItem: item, mode, excludeNames: [], rejectedNames: [], clientId: CLIENT } });
    check(`health backfill ${mode}: 403`, r.status, 403);
    check(`health backfill ${mode}: no OpenAI call`, ai.calls, 0);
  }
  ai.next = { rek: { name: "Port pairing", description: "Two sentences.", category: "wine" } };
  for (const mode of ["similar", "alternatives"]) {
    const r = await post({ backfill: { detectedItem: { name: "Bonanza Cab", description: "x", category: "wine" }, mode, excludeNames: [], rejectedNames: [], clientId: CLIENT } });
    check(`wine backfill ${mode}: 200 (positive control)`, r.status, 200);
  }
  const wine = await post({ backfill: { detectedItem: { name: "Bonanza Cab", description: "x", category: "wine" }, mode: "uses", excludeNames: [], rejectedNames: [], clientId: CLIENT } });
  check("wine backfill uses: 200 (positive control)", wine.status, 200);

  out("\n5. Client source: tabs hidden, every list emptied, the plain line");
  const src = fs.readFileSync(path.join(ROOT, "src/components/RekSnapResults.tsx"), "utf8");
  check("tab row gated on !anchorIsHealthMedical", /\{!anchorIsHealthMedical && \(\s*<div className="flex justify-center gap-2 mb-3">/.test(src), true);
  check("activeMode forced to similar on health", src.includes('setActiveMode(health ? "similar" : result.mode)'), true);
  check("every list emptied on health", src.includes("? { similar: [], uses: [], alternatives: [] }"), true);
  check("the plain line, exact wording", src.includes(`const HEALTH_ANCHOR_LINE = "Rekomendr doesn't recommend health products.";`), true);
  check("line shown on the anchor, health only", src.includes("markerLine={anchorIsHealthMedical ? HEALTH_ANCHOR_LINE : undefined}"), true);
  check("still no Share on health", /const anchorShareable =\s*!anchorIsHealthMedical/.test(src), true);
  check("health test uses the shared wall function", /const health = isHealthMedical\(/.test(src), true);
  check("client never uses an exact-match health set", src.includes("HEALTH_MEDICAL_CATEGORIES"), false);

  out("\n6. S2.5–S2.7: a health anchor's short is its mapped category label, nothing the model wrote");
  process.env.MINT_SIGNING_SECRET = "s21-harness-secret";
  const tok = require(path.join(OUT, "src/lib/mintToken.js"));
  const claim = "Provides antioxidant support for immune health, designed to enhance overall wellness.";
  for (const [category, expected] of [
    ["vitamins", "Supplements"],
    ["health", "Health"],
    ["drug", "Medication"],
    ["lotion", "Skincare"],
    ["medication", "Medication"],
    ["skincare", "Skincare"],
    ["Supplements ", "Supplements"],
  ]) {
    logs = [];
    ai.next = { ...visionAnswer(category, "similar"), detected_item: { name: "Vitafusion Recovery Gummies", description: claim, category } };
    const r = await post({ image: IMAGE });
    const tag = JSON.stringify(category);
    check(`${tag}: short replaced`, r.json?.detected_item?.description, expected);
    check(`${tag}: model's claim absent from the response`, JSON.stringify(r.json).includes("antioxidant"), false);
    check(`${tag}: [health-wall] anchor short replaced tripwire`, logged("[health-wall] anchor short replaced"), true);
    check(`${tag}: token usage on the withheld line`, logged('"promptTokens":1234') && logged('"completionTokens":567'), true);
    const t = r.json?.detected_item_token;
    const att = { name: "Vitafusion Recovery Gummies", category: r.json?.detected_item?.category, long: null, clientId: CLIENT };
    check(`${tag}: token signs the replacement`, tok.verifyAnchor({ ...att, short: expected }, t), true);
    check(`${tag}: token refuses the model's sentence`, tok.verifyAnchor({ ...att, short: claim }, t), false);
  }
  // Positive control: a wine's short is the model's own, untouched.
  logs = [];
  ai.next = { ...visionAnswer("wine", "similar"), detected_item: { name: "Bonanza Cab", description: "Plush, dark-fruited Cabernet.", category: "wine" } };
  const wineSnap = await post({ image: IMAGE });
  check("wine: short is the model's own", wineSnap.json?.detected_item?.description, "Plush, dark-fruited Cabernet.");
  check("wine: no anchor-short tripwire", logged("anchor short replaced"), false);
  // No long tier for a health anchor, even with a valid token.
  ai.calls = 0;
  const hShort = "Supplements";
  const hTok = tok.signAnchor({ name: "Vitafusion Recovery Gummies", category: "vitamins", short: hShort, long: null, clientId: CLIENT });
  const detail = await post({ anchorDetail: { name: "Vitafusion Recovery Gummies", category: "vitamins", shortDescription: hShort, clientId: CLIENT, token: hTok } });
  check("health Show details: 403", detail.status, 403);
  check("health Show details: no OpenAI call", ai.calls, 0);
  delete process.env.MINT_SIGNING_SECRET;

  check("client: short twin renders healthAnchorShort on health", /short=\{\s*anchorIsHealthMedical\s*\?\s*healthAnchorShort\(result\.detected_item\.category\)/.test(src), true);
  check("client: the product name is not repeated in the short", /healthAnchorShort\([^)]*detected_item\.name/.test(src), false);
  check("client: no long rendered on health", src.includes("long={anchorIsHealthMedical ? undefined : anchorLong ?? undefined}"), true);
  check("client: no expand affordance on health", src.includes("expandable={!anchorIsHealthMedical}"), true);
  check("client: health anchor save never mints", /itemName === result\.detected_item\.name &&\s*!isHealthMedical\(/.test(src), true);

  out("\n7. S2.7: every pre-S2.7 wall word still walls, onto its label");
  const gates = require(path.join(OUT, "src/lib/categoryGates.js"));
  const EXPECT = {
    Medication: ["medication", "medications", "medicine", "medicines", "drug", "drugs", "pharmacy", "prescription", "otc", "antacid", "ointment", "topical", "medical"],
    Supplements: ["vitamin", "vitamins", "supplement", "supplements", "probiotic", "probiotics"],
    Skincare: ["skincare", "skin care", "cream", "creams", "lotion", "balm", "serum", "sunscreen"],
    Beauty: ["cosmetic", "cosmetics", "beauty", "makeup"],
  };
  const expectedFor = (w) => Object.keys(EXPECT).find((k) => EXPECT[k].includes(w)) ?? "Health";
  for (const w of gates.LEGACY_HEALTH_WORDS) {
    check(`legacy ${JSON.stringify(w)} walls → ${expectedFor(w)}`, [gates.isHealthMedical(w), gates.healthAnchorShort(w)], [true, expectedFor(w)]);
  }
  check("every expected word is a legacy word", Object.values(EXPECT).flat().every((w) => gates.LEGACY_HEALTH_WORDS.includes(w)), true);
  check("case/whitespace normalised", gates.healthAnchorShort("  Medication "), "Medication");

  out("\n8. S2.7: the stem wall catches drifted categories (fail-closed)");
  const LEAKERS = [
    ["pain relief", "Medication"], ["Pain Reliever", "Medication"], ["painkiller", "Medication"],
    ["analgesic", "Medication"], ["allergy relief", "Medication"], ["Allergy & Sinus", "Medication"],
    ["antihistamine", "Medication"], ["sleep aid", "Medication"], ["cold & flu", "Medication"],
    ["flu", "Medication"], ["cough syrup", "Medication"], ["cough drops", "Medication"],
    ["laxative", "Medication"], ["Rx", "Medication"], ["OTC medicine", "Medication"],
    ["pharmaceuticals", "Medication"], ["eye drops", "Medication"], ["nasal spray", "Medication"],
    ["hydrocortisone", "Medication"], ["antiseptic", "Medication"], ["decongestant", "Medication"],
    ["multivitamin", "Supplements"], ["mineral supplement", "Supplements"], ["melatonin", "Supplements"],
    ["dietary supplements", "Supplements"], ["collagen", "Supplements"],
    ["hand cream", "Skincare"], ["Crème hydratante", "Skincare"], ["moisturizer", "Skincare"],
    ["body lotion", "Skincare"], ["lip balm", "Skincare"], ["SPF 50", "Skincare"], ["dermatology", "Skincare"],
    ["cosmetics", "Beauty"], ["make up", "Beauty"], ["beauty", "Beauty"],
    ["health", "Health"], ["Health & Wellness", "Health"], ["first aid", "Health"],
    ["personal care", "Health"], ["CBD oil", "Health"], ["essential oils", "Health"],
    // fail-closed calls (report): walled on purpose
    ["wellness tea", "Health"], ["health food", "Health"], ["hemp seeds", "Health"],
    ["probiotic drink", "Supplements"], ["vitamin water", "Supplements"], ["lemon balm", "Skincare"],
  ];
  for (const [c, label] of LEAKERS) {
    check(`walls ${JSON.stringify(c)} → ${label}`, [gates.isHealthMedical(c), gates.healthAnchorShort(c)], [true, label]);
  }
  const CLEAN = [
    "wine", "red wine", "Spanish wine", "champagne", "scotch", "beer", "cream ale", "coffee",
    "cold brew coffee", "cold cuts", "cold drinks", "cold-pressed juice", "mineral water",
    "ice cream", "sour cream", "cream cheese", "Irish cream liqueur", "coffee creamer", "crème brûlée",
    "healthy snacks", "food", "cheese", "cereal", "tropical fruit", "snack",
    "movie", "movies", "tv show", "comedic film", "book", "music", "flute", "fluid ounces",
    "cleaning supplies", "detergent", "dish soap", "household cleaner", "paint", "painting supplies",
    "sleepwear", "electronics", "unknown", "",
  ];
  for (const c of CLEAN) {
    check(`does not wall ${JSON.stringify(c)}`, gates.isHealthMedical(c), false);
  }
  check("recipe gate: pain relief never gets a recipe", gates.categoryGetsRecipe("pain relief"), false);
  check("recipe gate: wine still does", gates.categoryGetsRecipe("wine"), true);

  out("\n9. S2.7: every route gate walls a drifted category ('pain relief')");
  process.env.MINT_SIGNING_SECRET = "s21-harness-secret";
  logs = [];
  ai.next = { ...visionAnswer("pain relief", "uses"), detected_item: { name: "Tylenol Extra Strength", description: claim, category: "pain relief" } };
  const pr = await post({ image: IMAGE });
  check("vision: lists withheld", [pr.json?.results?.similar?.length, pr.json?.results?.uses?.length, pr.json?.results?.alternatives?.length], [0, 0, 0]);
  check("vision: short is the label", pr.json?.detected_item?.description, "Medication");
  check("vision: claim absent", JSON.stringify(pr.json).includes("antioxidant"), false);
  const prItem = { name: "Tylenol Extra Strength", category: "pain relief", description: "Medication" };
  const prTok = tok.signAnchor({ name: prItem.name, category: prItem.category, short: "Medication", long: null, clientId: CLIENT });
  ai.calls = 0;
  const bf = await post({ backfill: { detectedItem: prItem, mode: "similar", excludeNames: [], rejectedNames: [], clientId: CLIENT, token: prTok } });
  check("backfill: 403, no OpenAI call", [bf.status, ai.calls], [403, 0]);
  const dt = await post({ anchorDetail: { name: prItem.name, category: prItem.category, shortDescription: "Medication", clientId: CLIENT, token: prTok } });
  check("Show details: 403, no OpenAI call", [dt.status, ai.calls], [403, 0]);
  const ch = await post({ chain: { kind: "reroll", detectedItem: prItem, mode: "similar", trail: [], rejectedNames: [], excludeNames: [], clientId: CLIENT, anchorToken: prTok } });
  check("chain: 403, no OpenAI call", [ch.status, ai.calls], [403, 0]);
  const snapsLib = require(path.join(OUT, "src/lib/anchorSnapshots.js"));
  check("save/share/completion/public-read twin walls it", snapsLib.isHealthCategory("pain relief"), true);
  check("save/share twin leaves wine alone", snapsLib.isHealthCategory("wine"), false);
  delete process.env.MINT_SIGNING_SECRET;

  out("\n10. S2.7: name backstop + canonical category");
  process.env.MINT_SIGNING_SECRET = "s21-harness-secret";
  logs = [];
  ai.next = { ...visionAnswer("snacks", "similar"), detected_item: { name: "Halls cough drop", description: "Sweet and soothing, with menthol to ease the throat.", category: "snacks" } };
  const hd = await post({ image: IMAGE });
  check("cough drop filed as snacks: walled", [hd.json?.results?.similar?.length, hd.json?.results?.uses?.length, hd.json?.results?.alternatives?.length], [0, 0, 0]);
  check("cough drop: short is Medication", hd.json?.detected_item?.description, "Medication");
  check("cough drop: category canonicalized to medication", hd.json?.detected_item?.category, "medication");
  check("cough drop: claim absent", JSON.stringify(hd.json).includes("throat"), false);
  check("cough drop: [health-wall] walled by name tripwire", logged("[health-wall] walled by name"), true);
  const hdTok = hd.json?.detected_item_token;
  check("cough drop: token signs the canonical category", tok.verifyAnchor({ name: "Halls cough drop", category: "medication", short: "Medication", long: null, clientId: CLIENT }, hdTok), true);
  check("cough drop: token refuses the model's category", tok.verifyAnchor({ name: "Halls cough drop", category: "snacks", short: "Medication", long: null, clientId: CLIENT }, hdTok), false);
  ai.calls = 0;
  const hdItem = { name: "Halls cough drop", category: "medication", description: "Medication" };
  const hdBf = await post({ backfill: { detectedItem: hdItem, mode: "similar", excludeNames: [], rejectedNames: [], clientId: CLIENT, token: hdTok } });
  check("cough drop: downstream backfill 403, no OpenAI call", [hdBf.status, ai.calls], [403, 0]);
  logs = [];
  ai.next = { ...visionAnswer("pain relief", "similar"), detected_item: { name: "Tylenol", description: "x", category: "pain relief" } };
  const pc = await post({ image: IMAGE });
  check("drifted category canonicalized ('pain relief' → medication)", pc.json?.detected_item?.category, "medication");
  check("category-walled snap does not log walled-by-name", logged("walled by name"), false);
  for (const [name, category] of [["Cold Mountain", "movie"], ["Pain & Gain", "movies"], ["Medicine Man", "movie"], ["Sleeping Giant Pinot Noir", "wine"], ["Stumptown Cold Brew", "coffee"], ["Relief Ale", "beer"], ["Health Warrior Chia Bar", "snacks"]]) {
    logs = [];
    ai.next = { ...visionAnswer(category, "similar"), detected_item: { name, description: "A description.", category } };
    const r = await post({ image: IMAGE });
    check(`name control ${JSON.stringify(name)} (${category}): not walled`, [r.json?.results?.similar?.length > 0, r.json?.detected_item?.category], [true, category]);
  }
  for (const [name, label] of [["Halls Cough Drops", "Medication"], ["Ricola lozenges", "Medication"], ["Advil Liqui-Gels ibuprofen", "Medication"], ["Bayer Aspirin", "Medication"], ["Nature Made Vitamin D3", "Supplements"], ["Claritin Allergy", "Medication"], ["Vitaminwater", "Supplements"]]) {
    check(`name ${JSON.stringify(name)} → ${label}`, gates.healthLabelFromName(name), label);
  }
  for (const name of ["Cold Mountain", "Pain & Gain", "Medicine Man", "Sleeping Giant", "Painted Wolf Pinotage", "Relief Ale", "Healthy Choice", "Sainte Magdeleine"]) {
    check(`name ${JSON.stringify(name)} not walled by name`, gates.healthLabelFromName(name), null);
  }
  delete process.env.MINT_SIGNING_SECRET;

  out("\n11. S2.8: the server trusts health_class over the category; backstops hold");
  const CASES = [
    // [health_class, category, name, walled?, label, tripwire]
    ["medication", "snacks", "Starburst", true, "Medication", "walled by health_class"],
    ["medication", "skincare", "Cortizone-10", true, "Medication", null],
    ["supplement", "health", "Centrum", true, "Supplements", null],
    ["skincare", "health", "Nivea Creme", true, "Skincare", null],
    ["other_health", "makeup", "Maybelline", true, "Beauty", null],
    ["other_health", "gift set", "Bath bombs", true, "Health", "walled by health_class"],
    ["none", "pain relief", "Tylenol", true, "Medication", "backstop walled a health_class=none anchor"],
    ["none", "snacks", "Halls cough drop", true, "Medication", "backstop walled a health_class=none anchor"],
    ["maybe", "pain relief", "Tylenol", true, "Medication", "[health-class] missing or invalid"],
    ["none", "wine", "Sainte Magdeleine", false, null, null],
    ["none", "movies", "Cold Mountain", false, null, null],
    ["none", "ice cream", "Häagen-Dazs", false, null, null],
  ];
  for (const [hc, category, name, walled, label, wire] of CASES) {
    logs = [];
    ai.next = { ...visionAnswer(category, "similar"), detected_item: { name, description: "A model-written sentence about soothing relief.", category, health_class: hc } };
    const r = await post({ image: IMAGE });
    const tag = `class=${hc} cat=${JSON.stringify(category)} name=${JSON.stringify(name)}`;
    const n = (r.json?.results?.similar?.length ?? 0) + (r.json?.results?.uses?.length ?? 0) + (r.json?.results?.alternatives?.length ?? 0);
    if (walled) {
      check(`${tag}: walled → ${label}`, [n, r.json?.detected_item?.description, r.json?.detected_item?.category], [0, label, label.toLowerCase()]);
      check(`${tag}: model sentence absent`, JSON.stringify(r.json).includes("soothing relief"), false);
    } else {
      check(`${tag}: not walled`, [n > 0, r.json?.detected_item?.category], [true, category]);
    }
    if (wire) check(`${tag}: tripwire "${wire}"`, logged(wire), true);
  }
  check("class never sent to the client", JSON.stringify((await (async () => { ai.next = { ...visionAnswer("wine", "similar"), detected_item: { name: "x", description: "y", category: "wine", health_class: "none" } }; return post({ image: IMAGE }); })()).json).includes("health_class"), false);
  const routeSrc = fs.readFileSync(path.join(ROOT, "app/api/reksnap/route.ts"), "utf8");
  check("vision prompt shape carries health_class enum", routeSrc.includes('\\"health_class\\": \\"none\\"|\\"medication\\"|\\"supplement\\"|\\"skincare\\"|\\"other_health\\"'), true);
  check("unit: cleanHealthClass rejects junk", [gates.cleanHealthClass("Medication "), gates.cleanHealthClass("maybe"), gates.cleanHealthClass(undefined)], ["medication", null, null]);
  check("unit: class none never un-walls a stem hit", gates.anchorWallLabel("none", "antihistamine", "x"), "Medication");

  out(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error = process.stderr.write.bind(process.stderr);
  process.stderr.write(`HARNESS CRASH: ${err && err.stack}\n`);
  process.exit(1);
});
