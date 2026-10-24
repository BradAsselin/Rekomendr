#!/usr/bin/env node
/* S17v — AI-search Movies/TV cards read TMDb's synopsis (VOICE, docs/s17-mood-first-plan.md).
 * The verify verdict carries the overview (stubbed TMDb), the client keeps
 * it, the engine swaps it in for the generated copy, and the cut matches
 * the slot cards'. No network.
 * Run: node scripts/validate-s17v.cjs */

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
let passed = 0;
let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? passed++ : failed++;
  process.stdout.write(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)}, expected ${JSON.stringify(want)})`}\n`);
}
const say = (s) => process.stdout.write(s + "\n");
function load(rel, extra = {}) {
  const out = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true } }).outputText;
  const m = { exports: {} };
  const req = (id) => {
    if (extra[id]) return extra[id];
    if (id.startsWith(".")) {
      const p = path.join(path.dirname(rel), id);
      return load(fs.existsSync(path.join(root, p + ".ts")) ? p + ".ts" : p + ".tsx", extra);
    }
    return require(id);
  };
  new Function("module", "exports", "require", out)(m, m.exports, req);
  return m.exports;
}
for (const level of ["log", "warn", "info", "error"]) console[level] = () => {};

(async () => {
  say("\n1. The cut: the slot cards' shortSynopsis, one shared module");
  const S = load("src/lib/synopsis.ts");
  const long = "A con man takes one last job. His crew has other plans for the money. Nobody tells the cop who is watching from across the street, and that is where everything goes sideways for all of them in the end, one slow and terrible hour at a time, until only one of them is left standing.";
  check("first sentences under 220 chars", S.shortSynopsis(long), "A con man takes one last job. His crew has other plans for the money.");
  check("short text untouched", S.shortSynopsis("  A heist.  "), "A heist.");
  check("slotRecipe re-exports the same function", /export \{ shortSynopsis \} from "\.\/synopsis";/.test(read("src/lib/slotRecipe.ts")), true);

  say("\n2. The verdict carries TMDb's overview (stubbed TMDb)");
  process.env.TMDB_API_KEY = "test-key";
  globalThis.fetch = async (url) => {
    const q = new URL(url).searchParams.get("query") || "";
    const rows = q === "Heat"
      ? [{ id: 949, title: "Heat", release_date: "1995-12-15", poster_path: "/heat.jpg", overview: "  Obsessive master thief Neil McCauley leads a top-notch crew.  " }]
      : q === "Blank"
      ? [{ id: 5, title: "Blank", release_date: "2001-01-01", poster_path: null, overview: "" }]
      : [];
    return new Response(JSON.stringify({ results: rows }), { status: 200 });
  };
  const V = load("src/lib/tmdbVerify.ts", { "server-only": {} });
  const out = await V.verifyTitles([{ title: "Heat", year: 1995, kind: "movie" }, { title: "Blank", year: 2001, kind: "movie" }]);
  check("overview trimmed onto the resolved verdict", [out.verdicts[0].resolved, out.verdicts[0].tmdbId, out.verdicts[0].overview], [true, 949, "Obsessive master thief Neil McCauley leads a top-notch crew."]);
  check("an empty overview is null (the generated copy stays)", out.verdicts[1].overview, null);
  check("capped at 1200 chars", /\.slice\(0, 1200\)/.test(read("src/lib/tmdbVerify.ts")), true);

  say("\n3. The browser side keeps it; the engine swaps it in");
  const tv = read("src/lib/titleVerification.ts");
  check("client match carries overview", /overview: typeof v\.overview === "string"/.test(tv), true);
  const eng = read("src/engine/rekomendrEngine.ts");
  check("survivor: short = shortSynopsis(overview), long = overview", /m\.overview \? \{ short: shortSynopsis\(m\.overview\), long: m\.overview \} : \{\}/.test(eng), true);
  check("no overview → generated copy kept", /return \{ \.\.\.r, \.\.\.text, tmdbId: m\.tmdbId, posterPath: m\.posterPath \};/.test(eng), true);
  check("engine imports the pure module (never slotRecipe: server-only)", /from "\.\.\/lib\/synopsis"/.test(eng) && !/slotRecipe/.test(eng), true);

  say(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  process.stdout.write("CRASH " + (e && e.stack ? e.stack : e) + "\n");
  process.exit(1);
});
