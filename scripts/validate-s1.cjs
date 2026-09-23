/* eslint-disable no-console */
//
// scripts/validate-s1.cjs — S1's counted validation.
//
// Charter §3.10 (stale-bundle discipline) requires any prompt change to
// be validated against a FRESH bundle and to report the fingerprint
// markers; charter §4 requires feel-level changes to be COUNTED, not
// judged off one screen. This script does the half a session can do
// without a human's eye: it compiles the engine from source (so the
// bundle is fresh by construction, never a cached one) and drives the
// REAL public entry point — getTop5FromEngine — with the transport
// stubbed, capturing every prompt the engine actually builds.
//
// It needs no OPENAI_API_KEY and makes no network call: globalThis.fetch
// is replaced, so the only thing under test is Rekomendr's own assembly
// and slot placement.
//
// What it CANNOT do, and does not pretend to: judge whether the model's
// output feels like a can't-wait-to-watch set. That is Brad's five
// searches over a week, and it is the acceptance test in the PR.
//
//   node scripts/validate-s1.cjs
//
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), "s1-validate-"));

console.log("Compiling the engine from source (fresh bundle, not a cached one)…");
execFileSync(
  "npx",
  [
    "tsc",
    "src/engine/rekomendrEngine.ts",
    "--outDir", OUT,
    "--module", "commonjs",
    "--target", "es2020",
    "--moduleResolution", "node",
    "--esModuleInterop",
    "--skipLibCheck",
  ],
  { stdio: "inherit" }
);

const ENGINE_PATH = path.join(OUT, "engine", "rekomendrEngine.js");

// Each scenario gets a FRESH engine module. The engine keeps
// session-seen memory in module state (per category, for the life of the
// browser session), so sharing one instance across scenarios would let
// one scenario's titles suppress the next one's — and, more to the
// point, a "fresh visit" is exactly the case the Shortlist and the
// freshness slot exist to serve. Reloading models that honestly.
const freshEngine = () => {
  for (const k of Object.keys(require.cache)) {
    if (k.startsWith(OUT)) delete require.cache[k];
  }
  return require(ENGINE_PATH);
};

/* ------------------------------------------------------------------
   Transport stub — captures prompts, answers with canned sets.
------------------------------------------------------------------- */
let captured = [];
let freshnessReply = [];
let mainReply = [];

const isFreshnessPrompt = (p) => p.includes("THIS IS THE RECALL SLOT");

globalThis.fetch = async (_url, init) => {
  const body = JSON.parse(init.body);
  const prompt = body.prompt;
  const kind = isFreshnessPrompt(prompt) ? "freshness" : "main";
  captured.push({ kind, prompt });
  const items = kind === "freshness" ? freshnessReply : mainReply;
  return {
    ok: true,
    text: async () => JSON.stringify(items),
  };
};

const card = (title, year) => ({
  title,
  year: year || 2015,
  short: "A setup sentence. A complication sentence. A closing sentence.",
  long: "One. Two. Three.",
  genre: "Drama",
  vibeTags: ["Witty"],
});

/* ------------------------------------------------------------------
   Assertions
------------------------------------------------------------------- */
let pass = 0;
let fail = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  ok ? pass++ : fail++;
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label}  (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`
  );
};

const SHELF_LINE = "Your job is the next shelf down";
const BEST_PICKS_LINE = "give them your strongest, most enjoyable answers";
const RECALL_LINE = "THIS IS THE RECALL SLOT";

// §3.10 fingerprint markers — the same four /api/openai logs as
// [prompt-diag]. hasExpectLine TRUE would mean a stale bundle.
const fingerprint = (p) => ({
  hasSimulationClose: p.includes("THE SIMULATION CLOSE"),
  hasBannedRegister: p.includes("BANNED REGISTER"),
  hasExpectLine: p.includes("THE EXPECT LINE"),
  hasPrimeRule: p.includes("THE PRIME RULE"),
  promptChars: p.length,
});

const titles = (n, prefix) =>
  Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`);

// One fresh search. `seed` disambiguates session-seen memory between runs.
async function run({ liked = [], disliked = [], watched = [], shortlist = [], fresh = [], seed = "" }) {
  captured = [];
  mainReply = titles(6, `Main${seed}`).map((t) => card(t));
  freshnessReply = fresh.map((t) => card(t));
  const engine = freshEngine();
  const reks = await engine.getTop5FromEngine({
    rawQuery: `Movies||Romance||something clever ${seed}`,
    likedTitles: liked,
    dislikedTitles: disliked,
    watchedTitles: watched,
    shortlist,
  });
  return {
    reks,
    main: captured.filter((c) => c.kind === "main").map((c) => c.prompt),
    freshness: captured.filter((c) => c.kind === "freshness").map((c) => c.prompt),
  };
}

(async () => {
  console.log("\n=== 1. \"Next shelf down\" is gated on exclusion pressure ===");
  console.log("   (threshold: 12 marked titles — likes + dislikes, this category)\n");

  const pressureCases = [
    { n: 0, label: "cold search, 0 marked", expectShelf: false },
    { n: 4, label: "4 marked", expectShelf: false },
    { n: 11, label: "11 marked — one below the threshold", expectShelf: false },
    { n: 12, label: "12 marked — at the threshold", expectShelf: true },
    { n: 40, label: "40 marked — worked over", expectShelf: true },
  ];

  for (const c of pressureCases) {
    const r = await run({
      liked: titles(c.n, `Liked${c.n}`),
      seed: `p${c.n}`,
    });
    const p = r.main[0];
    console.log(`  -- ${c.label}`);
    check(`     down-shelf instruction present`, p.includes(SHELF_LINE), c.expectShelf);
    check(`     best-picks instruction present`, p.includes(BEST_PICKS_LINE), !c.expectShelf);
    // The two must never both appear: that is a prompt arguing with itself.
    check(
      `     exactly one of the two`,
      p.includes(SHELF_LINE) !== p.includes(BEST_PICKS_LINE),
      true
    );
  }

  console.log("\n=== 2. Fingerprint markers, every prompt (§3.10) ===");
  console.log("   hasExpectLine TRUE would mean a stale bundle.\n");
  {
    const r = await run({
      liked: ["Paddington"],
      disliked: ["Cats"],
      watched: ["Heat"],
      shortlist: [{ title: "Paddington", likedAt: "2026-07-04T10:00:00Z" }],
      fresh: ["Paddington"],
      seed: "fp",
    });
    for (const [kind, prompts] of [["main", r.main], ["freshness", r.freshness]]) {
      for (const p of prompts) {
        const f = fingerprint(p);
        console.log(`  -- ${kind} prompt`);
        check("     hasSimulationClose", f.hasSimulationClose, true);
        check("     hasBannedRegister", f.hasBannedRegister, true);
        check("     hasExpectLine (stale-bundle detector)", f.hasExpectLine, false);
        check("     hasPrimeRule", f.hasPrimeRule, true);
        console.log(`     promptChars: ${f.promptChars}`);
      }
    }
  }

  console.log("\n=== 3. The freshness slot's exemption is exactly one tier wide ===\n");
  {
    const r = await run({
      liked: ["Paddington", "Arrival"],
      disliked: ["Cats"],
      watched: ["Heat"],
      shortlist: [{ title: "Paddington", likedAt: "2026-07-04T10:00:00Z" }],
      fresh: ["Paddington"],
      seed: "ex",
    });
    const fp = r.freshness[0];
    const never = fp.split("Never return these titles")[1] || "";
    check("  recall-slot instruction present", fp.includes(RECALL_LINE), true);
    check("  down-shelf instruction absent", fp.includes(SHELF_LINE), false);
    check("  LIKED title exempt from never-return", never.includes("Paddington"), false);
    check("  DISLIKED title still excluded", never.includes("Cats"), true);
    check("  WATCHED title still excluded", never.includes("Heat"), true);
    check("  shortlist offered as candidates", fp.includes("Strongly prefer one of these"), true);

    const mp = r.main[0];
    const mneverIdx = mp.indexOf("Never return these titles");
    const mnever = mp.slice(mneverIdx);
    check("  main prompt still excludes the liked title", mnever.includes("Paddington"), true);
    check("  main prompt still excludes the watched title", mnever.includes("Heat"), true);
  }

  console.log("\n=== 4. Slot placement and the resurfacing marker ===\n");
  {
    // 4a — the pick IS a shortlist title: position 3, marker set.
    const a = await run({
      liked: ["Paddington"],
      shortlist: [{ title: "Paddington", likedAt: "2026-07-04T10:00:00Z" }],
      fresh: ["Paddington"],
      seed: "a",
    });
    check("  4a set size is still five", a.reks.length, 5);
    check("  4a slot is position 3", a.reks[2].title, "Paddington");
    check("  4a marker copy", a.reks[2].resurfacedNote, "You liked this in July.");
    check(
      "  4a no other card carries a marker",
      a.reks.filter((r) => r.resurfacedNote).length,
      1
    );

    // 4b — a canon pick that was never liked: placed, but NO marker.
    const b = await run({
      liked: ["Paddington"],
      shortlist: [{ title: "Paddington", likedAt: "2026-07-04T10:00:00Z" }],
      fresh: ["Casablanca"],
      seed: "b",
    });
    check("  4b slot is position 3", b.reks[2].title, "Casablanca");
    check("  4b canon pick carries NO marker", b.reks[2].resurfacedNote, undefined);

    // 4c — a like from a previous year names the year.
    const c = await run({
      liked: ["Arrival"],
      shortlist: [{ title: "Arrival", likedAt: "2025-07-04T10:00:00Z" }],
      fresh: ["Arrival"],
      seed: "c",
    });
    check("  4c marker names the year", c.reks[2].resurfacedNote, "You liked this in July 2025.");

    // 4d — the freshness generation fails: the plain five still ship.
    const d = await run({ liked: ["Paddington"], fresh: [], seed: "d" });
    check("  4d plain five still ship", d.reks.length, 5);
    check("  4d no marker anywhere", d.reks.some((r) => r.resurfacedNote), false);

    // 4e — a WATCHED title offered by the model is dropped, not placed.
    const e = await run({
      liked: ["Paddington"],
      watched: ["Paddington"],
      fresh: ["Paddington"],
      seed: "e",
    });
    check("  4e watched title never reaches the slot",
      e.reks.some((r) => r.title === "Paddington"), false);
    check("  4e set size is still five", e.reks.length, 5);

    // 4f — a DISLIKED title offered by the model is dropped, not placed.
    const f = await run({
      disliked: ["Cats"],
      fresh: ["Cats"],
      seed: "f",
    });
    check("  4f disliked title never reaches the slot",
      f.reks.some((r) => r.title === "Cats"), false);
  }

  console.log("\n=== 4g. Recall is CROSS-session: a title shown earlier in");
  console.log("        THIS visit is not resurfaced into the slot ===\n");
  {
    // Same engine instance twice = one visit, two searches. The first
    // search shows "Paddington" in the main five; the second search's
    // freshness generation offers it again and must be declined — you
    // saw it four minutes ago, which is not excitement the app forgot.
    const engine = freshEngine();
    captured = [];
    mainReply = [card("Paddington"), ...titles(5, "Other").map((t) => card(t))];
    freshnessReply = [];
    const first = await engine.getTop5FromEngine({
      rawQuery: "Movies||Romance||something clever",
      likedTitles: [],
    });
    check("  first search showed it", first.some((r) => r.title === "Paddington"), true);

    captured = [];
    mainReply = titles(6, "Second").map((t) => card(t));
    freshnessReply = [card("Paddington")];
    const second = await engine.getTop5FromEngine({
      rawQuery: "Movies||Romance||something else",
      likedTitles: ["Paddington"],
      shortlist: [{ title: "Paddington", likedAt: "2026-07-04T10:00:00Z" }],
    });
    check("  same visit: not resurfaced", second.some((r) => r.title === "Paddington"), false);
    check("  set is still five", second.length, 5);

    // A NEW visit (fresh module state) resurfaces it, as designed.
    const engine2 = freshEngine();
    captured = [];
    mainReply = titles(6, "Third").map((t) => card(t));
    freshnessReply = [card("Paddington")];
    const third = await engine2.getTop5FromEngine({
      rawQuery: "Movies||Romance||something clever",
      likedTitles: ["Paddington"],
      shortlist: [{ title: "Paddington", likedAt: "2026-07-04T10:00:00Z" }],
    });
    check("  new visit: resurfaced at position 3", third[2].title, "Paddington");
    check("  new visit: marker set", third[2].resurfacedNote, "You liked this in July.");
  }

  console.log("\n=== 5. The two generations run in parallel, not in series ===\n");
  {
    captured = [];
    const r = await run({ liked: ["Paddington"], fresh: ["Casablanca"], seed: "par" });
    check("  one main generation", r.main.length, 1);
    check("  one freshness generation", r.freshness.length, 1);
  }

  console.log(`\n${pass} passed, ${fail} failed.`);
  fs.rmSync(OUT, { recursive: true, force: true });
  process.exit(fail === 0 ? 0 : 1);
})();
