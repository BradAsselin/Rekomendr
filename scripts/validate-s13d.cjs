#!/usr/bin/env node
/* S13d — Sonnet 5.5 / Haiku 5.5 on the switch, and the dash-titled TV
 * banner ("Breaking Bad - Ozymandias"). Default unchanged.
 * Stubs both SDKs and TMDb — no keys, no network.
 * Run: node scripts/validate-s13d.cjs */

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
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)}, expected ${JSON.stringify(want)})`}`);
}

const calls = { openai: [], anthropic: [] };
class FakeOpenAI {
  constructor() {
    this.chat = { completions: { create: async (req) => { calls.openai.push(req); return { choices: [{ message: { content: "{}" }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1 } }; } } };
  }
}
FakeOpenAI.APIConnectionError = class extends Error {};
class FakeAnthropic {
  constructor() {
    this.beta = { messages: { stream: (req) => {
      calls.anthropic.push(req);
      const it = (async function* () { yield { type: "content_block_delta", delta: { type: "text_delta", text: "{}" } }; })();
      it.finalMessage = async () => ({ model: req.model, stop_reason: "end_turn", usage: { input_tokens: 1000, output_tokens: 100 } });
      return it;
    } } };
  }
}
function load(rel) {
  const out = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true } }).outputText;
  const m = { exports: {} };
  const req = (id) => {
    if (id === "openai") return { __esModule: true, default: FakeOpenAI };
    if (id === "@anthropic-ai/sdk") return { __esModule: true, default: FakeAnthropic };
    if (id.startsWith(".")) return load(path.join(path.dirname(rel), id) + ".ts");
    return require(id);
  };
  new Function("module", "exports", "require", out)(m, m.exports, req);
  return m.exports;
}
const logs = [];
for (const level of ["warn", "info", "error"]) console[level] = (...a) => logs.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));

(async () => {
  for (const k of Object.keys(process.env)) if (k.startsWith("REKS_")) delete process.env[k];
  delete process.env.VERCEL_ENV;
  process.env.NODE_ENV = "development";
  process.env.ANTHROPIC_API_KEY = "stub";
  process.env.TMDB_API_KEY = "v3key";

  console.log("1. The banner: a dash-separated episode title");
  const T = load("src/lib/tmdbMedia.ts");
  check("head before ' - '", T.headBeforeSeparator("Breaking Bad - Ozymandias"), "Breaking Bad");
  check("…before an en/em dash and a colon", [T.headBeforeSeparator("The Bear – Fishes"), T.headBeforeSeparator("Succession — Connor's Wedding"), T.headBeforeSeparator("Severance: Hello, Ms. Cobel")], ["The Bear", "Succession", "Severance"]);
  check("no separator, or an unspaced hyphen → unchanged", [T.headBeforeSeparator("Breaking Bad"), T.headBeforeSeparator("Spider-Man")], ["Breaking Bad", "Spider-Man"]);
  const searches = [];
  const SHOWS = { "breaking bad": [{ id: 1396, name: "Breaking Bad", original_name: "Breaking Bad", first_air_date: "2008-01-20", vote_count: 15000, overview: "x" }] };
  const MOVIES = { "mission: impossible - dead reckoning": [{ id: 575264, title: "Mission: Impossible - Dead Reckoning Part One", original_title: "Mission: Impossible - Dead Reckoning Part One", release_date: "2023-07-08", vote_count: 4000, overview: "x" }] };
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    const kind = u.pathname.endsWith("/tv") ? "tv" : "movie";
    const q = (u.searchParams.get("query") || "").toLowerCase();
    searches.push(`${kind}:${q}`);
    const results = (kind === "tv" ? SHOWS : MOVIES)[q] ?? [];
    return new Response(JSON.stringify({ results }), { status: 200 });
  };
  let hit = await T.resolveSnappedTitle("Breaking Bad - Ozymandias", "tv");
  check("TV banner: the full name misses, the head hits Breaking Bad", hit && [hit.kind, hit.id, hit.title], ["tv", 1396, "Breaking Bad"]);
  check("…named in the log", logs.some((l) => l.includes("[media-snap] episode title cut at the dash")), true);
  searches.length = 0;
  hit = await T.resolveSnappedTitle("Breaking Bad - Ozymandias", "any");
  check("unknown kind: the retry is TV only", searches.filter((s) => s.endsWith(":breaking bad")), ["tv:breaking bad"]);
  searches.length = 0;
  hit = await T.resolveSnappedTitle("Mission: Impossible - Dead Reckoning", "movie");
  check("a movie title with a dash is never cut", searches.every((s) => s.includes("dead reckoning")) && !searches.some((s) => s === "tv:mission"), true);
  searches.length = 0;
  hit = await T.resolveSnappedTitle("Breaking Bad", "tv");
  check("a hit on the full name: no retry", searches, ["tv:breaking bad"]);
  searches.length = 0;
  hit = await T.resolveSnappedTitle("Unknown Thing - Part Two", "tv");
  check("both miss → null (the vision path carries on)", hit, null);

  console.log("\n2. Sonnet 5.5 / Haiku 5.5 on the switch");
  const llm = load("src/lib/llm.ts");
  check("default still OpenAI on every step", llm.LLM_STEPS.map((s) => llm.resolveStep(s).provider), Array(5).fill("openai"));
  process.env.REKS_PROVIDER_LINES = "anthropic";
  process.env.REKS_MODEL_LINES = "claude-sonnet-5-5";
  process.env.REKS_PROVIDER_MOOD = "anthropic";
  process.env.REKS_MODEL_MOOD = "claude-haiku-5-5";
  check("per-step env: lines on Sonnet, mood on Haiku, the rest OpenAI", ["lines", "mood", "wine"].map((s) => `${llm.resolveStep(s).provider}:${llm.resolveStep(s).model}`), ["anthropic:claude-sonnet-5-5", "anthropic:claude-haiku-5-5", "openai:gpt-4o"]);
  await llm.llmCall({ step: "lines", temperature: 0.5, maxTokens: 900, system: "S", user: "U" });
  await llm.llmCall({ step: "mood", temperature: 0, maxTokens: 200, system: "S", user: "U" });
  const [son, hai] = calls.anthropic.slice(-2);
  check("Sonnet: no sampling params, effort low, server-side fallback", ["temperature" in son, son.output_config, son.fallbacks], [false, { effort: "low" }, "default"]);
  check("Haiku: no sampling params, effort low, NO fallback param (none exists for Haiku)", ["temperature" in hai, hai.output_config, "fallbacks" in hai, "betas" in hai], [false, { effort: "low" }, false, false]);
  const SCHEMA = { type: "object", properties: { picks: { type: "array" } }, required: ["picks"] };
  await llm.llmCall({ step: "lines", maxTokens: 900, system: "S", user: "U", schema: SCHEMA });
  check("a schema rides as Claude structured output", calls.anthropic.at(-1).output_config, { effort: "low", format: { type: "json_schema", schema: SCHEMA } });
  for (const k of Object.keys(process.env)) if (k.startsWith("REKS_")) delete process.env[k];
  await llm.llmCall({ step: "lines", maxTokens: 900, system: "S", user: "U", schema: SCHEMA });
  check("…and never reaches OpenAI (json_object mode as before)", [calls.openai.at(-1).response_format, "output_config" in calls.openai.at(-1)], [{ type: "json_object" }, false]);
  const mr = read("src/lib/mediaReks.ts");
  check("both chooser calls carry the chooser schema; prompt text untouched", (mr.match(/schema: CHOOSER_SCHEMA/g) || []).length === 2 && mr.includes('\'Return JSON only: { "picks": [ { "n": number, "line": string } ], "wildcard"'), true);

  console.log("\n3. The dev-only per-step header");
  const mk = (h) => new Request("http://x/api", { method: "POST", headers: h });
  calls.anthropic.length = 0;
  calls.openai.length = 0;
  const res = await llm.withLlmContext(mk({ "x-reks-steps": "wine=anthropic:claude-haiku-5-5", "x-reks-diag": "1" }), async () => {
    await llm.llmCall({ step: "wine", maxTokens: 10, system: "", user: "" });
    await llm.llmCall({ step: "shelf", maxTokens: 10, system: "", user: "" });
    return Response.json({});
  });
  const diag = JSON.parse(res.headers.get("x-reks-diag") || "[]");
  check("only the named step moves", diag.map((d) => `${d.step}:${d.model}`), ["wine:claude-haiku-5-5", "shelf:gpt-4o"]);
  check("Haiku priced at $0.10 / $0.50", Math.round(diag[0].usd * 1e6), 150);
  let junk = null;
  await llm.withLlmContext(mk({ "x-reks-steps": "nope=anthropic:x, wine=gemini:y" }), async () => {
    junk = llm.resolveStep("wine");
    return Response.json({});
  });
  check("junk in the header is ignored (wine stays gpt-4o)", junk, { provider: "openai", model: "gpt-4o" });
  process.env.VERCEL_ENV = "production";
  calls.anthropic.length = 0;
  await llm.withLlmContext(mk({ "x-reks-steps": "wine=anthropic:claude-haiku-5-5" }), async () => {
    await llm.llmCall({ step: "wine", maxTokens: 10, system: "", user: "" });
    return Response.json({});
  });
  check("production ignores x-reks-steps", calls.anthropic.length, 0);
  delete process.env.VERCEL_ENV;

  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  process.stderr.write("HARNESS CRASH: " + (err && err.stack) + String.fromCharCode(10));
  process.exit(1);
});
