/* eslint-disable no-console */
//
// scripts/validate-s21.cjs — the health wall on the result tabs.
//
// Compiles the REAL /api/reksnap route from source and drives it with a stub
// OpenAI (a scripted vision answer) and an in-memory Supabase stand-in. No
// keys, no network. Proves: a health anchor ships NO rek list (S2.1 took the
// tabs, S2.4 took Similar), whatever mode the model inferred, and no backfill
// can generate one for it; every non-health anchor is unchanged. The client
// half is asserted from source (tab row, list reset, the plain line).
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
          return { choices: [{ message: { content: JSON.stringify(ai.next) } }] };
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
  check("health test uses the shared category set", /const health = HEALTH_MEDICAL_CATEGORIES\.has\(/.test(src), true);

  out(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error = process.stderr.write.bind(process.stderr);
  process.stderr.write(`HARNESS CRASH: ${err && err.stack}\n`);
  process.exit(1);
});
