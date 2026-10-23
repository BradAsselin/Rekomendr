#!/usr/bin/env node
/* S13a — the provider switch (src/lib/llm.ts, docs/s13-opus-voice-plan.md).
 * Default = OpenAI with the exact pre-S13 arguments; Anthropic only when
 * the env says so; prompts byte-identical; dev-only hooks dead on
 * production. Stubs both SDKs — no keys, no network.
 * Run: node scripts/validate-s13a.cjs */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const BASE = "0a81a81"; // main before S13

let passed = 0;
let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)}, expected ${JSON.stringify(want)})`}`);
}

// ---- SDK stubs -------------------------------------------------------------
const calls = { openai: [], anthropic: [] };
let openaiReply = '{"ok":true}';
let anthropicReply = { text: '```json\n{"ok":true}\n```', stop: "end_turn", model: "claude-opus-5-5" };

class FakeOpenAI {
  static APIConnectionError = class extends Error {};
  constructor(opts) {
    this.opts = opts;
    this.chat = {
      completions: {
        create: async (req, o) => {
          calls.openai.push({ req, o });
          if (req.stream) {
            const parts = [openaiReply.slice(0, 5), openaiReply.slice(5)];
            return (async function* () {
              for (const p of parts) yield { choices: [{ delta: { content: p } }] };
              yield { choices: [{ delta: {}, finish_reason: "stop" }] };
              yield { choices: [], usage: { prompt_tokens: 10, completion_tokens: 3 } };
            })();
          }
          return {
            choices: [{ message: { content: openaiReply }, finish_reason: "stop" }],
            usage: { prompt_tokens: 10, completion_tokens: 3 },
          };
        },
      },
    };
  }
}
class FakeAnthropic {
  constructor(opts) {
    this.opts = opts;
    this.beta = {
      messages: {
        stream: (req, o) => {
          calls.anthropic.push({ req, o });
          const r = anthropicReply;
          const parts = [r.text.slice(0, 4), r.text.slice(4)];
          const it = (async function* () {
            yield { type: "content_block_start", content_block: { type: "thinking" } };
            for (const p of parts) yield { type: "content_block_delta", delta: { type: "text_delta", text: p } };
          })();
          it.finalMessage = async () => ({
            model: r.model,
            stop_reason: r.stop,
            stop_details: r.stop === "refusal" ? { category: "cyber", explanation: "no" } : null,
            usage: { input_tokens: 100, output_tokens: 40, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          });
          return it;
        },
      },
    };
  }
}

function load(rel, extra = {}) {
  const out = ts.transpileModule(read(rel), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true },
  }).outputText;
  const m = { exports: {} };
  const req = (id) => {
    if (id === "openai") return { __esModule: true, default: FakeOpenAI };
    if (id === "@anthropic-ai/sdk") return { __esModule: true, default: FakeAnthropic };
    if (extra[id]) return extra[id];
    if (id.startsWith(".")) return load(path.join(path.dirname(rel), id) + ".ts");
    return require(id);
  };
  new Function("module", "exports", "require", out)(m, m.exports, req);
  return m.exports;
}

const logs = [];
// The libs' log lines are captured for checks; the harness's own output
// goes through console.log, untouched.
for (const level of ["warn", "info", "error"]) {
  console[level] = (...a) => {
    logs.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
  };
}

const ENV_KEYS = ["REKS_MODEL_PROVIDER", "REKS_ANTHROPIC_EFFORT", "REKS_ANTHROPIC_FALLBACKS", "VERCEL_ENV", "NODE_ENV",
  ...["VISION", "SHELF", "WINE", "LINES", "MOOD"].flatMap((s) => [`REKS_PROVIDER_${s}`, `REKS_MODEL_${s}`])];
const resetEnv = () => { for (const k of ENV_KEYS) delete process.env[k]; process.env.ANTHROPIC_API_KEY = "stub"; };

(async () => {
  resetEnv();
  const llm = load("src/lib/llm.ts");

  console.log("1. Default (no env): every step is OpenAI with today's model");
  const want = { vision: "gpt-4o", shelf: "gpt-4o", wine: "gpt-4o", lines: "gpt-4o-mini", mood: "gpt-4o-mini" };
  for (const s of llm.LLM_STEPS) check(`${s} → openai:${want[s]}`, llm.resolveStep(s), { provider: "openai", model: want[s] });

  console.log("\n2. Default call shape = the pre-S13 OpenAI arguments");
  calls.openai.length = 0;
  await llm.llmCall({ step: "wine", temperature: 0.7, maxTokens: 1234, system: "SYS", user: "USER" });
  const w = calls.openai[0].req;
  check("model/temperature/max_tokens/json mode", [w.model, w.temperature, w.max_tokens, w.response_format], ["gpt-4o", 0.7, 1234, { type: "json_object" }]);
  check("system then user, text as-is", w.messages, [{ role: "system", content: "SYS" }, { role: "user", content: "USER" }]);
  check("not streamed without onDelta", !!w.stream, false);
  calls.openai.length = 0;
  const deltas = [];
  const sres = await llm.llmCall(
    { step: "vision", temperature: 0.7, maxTokens: 4000, system: "S", user: [{ type: "image", url: "data:image/jpeg;base64,QUJD", detail: "high" }, { type: "text", text: "T" }] },
    (t) => deltas.push(t)
  );
  const v = calls.openai[0].req;
  check("vision streams with usage", [v.stream, v.stream_options], [true, { include_usage: true }]);
  check("image part → image_url with detail high", v.messages[1].content, [{ type: "image_url", image_url: { url: "data:image/jpeg;base64,QUJD", detail: "high" } }, { type: "text", text: "T" }]);
  check("deltas reach the caller", deltas.join(""), openaiReply);
  check("usage in OpenAI names", sres.usage, { prompt_tokens: 10, completion_tokens: 3 });
  check("temperature 0 survives (shelf read)", (await llm.llmCall({ step: "shelf", temperature: 0, maxTokens: 9, system: "", user: "" }), calls.openai.at(-1).req.temperature), 0);
  check("no Anthropic call on the default path", calls.anthropic.length, 0);

  console.log("\n3. The switch");
  process.env.REKS_MODEL_PROVIDER = "anthropic";
  check("global flag → every step on claude-opus-5-5", llm.LLM_STEPS.map((s) => llm.resolveStep(s).model), Array(5).fill("claude-opus-5-5"));
  process.env.REKS_PROVIDER_LINES = "openai";
  check("per-step override wins", llm.resolveStep("lines"), { provider: "openai", model: "gpt-4o-mini" });
  process.env.REKS_MODEL_SHELF = "claude-sonnet-5-5";
  check("per-step model name", llm.resolveStep("shelf"), { provider: "anthropic", model: "claude-sonnet-5-5" });
  resetEnv();
  process.env.REKS_PROVIDER_SHELF = "anthropic";
  check("one step flipped, the rest stay", [llm.resolveStep("shelf").provider, llm.resolveStep("wine").provider], ["anthropic", "openai"]);
  process.env.REKS_PROVIDER_SHELF = "Anthropic ";
  check("junk value → default openai", llm.resolveStep("shelf").provider, "openai");
  resetEnv();

  console.log("\n4. Anthropic call shape");
  process.env.REKS_MODEL_PROVIDER = "anthropic";
  calls.anthropic.length = 0;
  const ad = [];
  const ares = await llm.llmCall(
    { step: "vision", temperature: 0.7, maxTokens: 4000, system: "SYS", user: [{ type: "image", url: "data:image/png;base64,QUJD", detail: "high" }, { type: "text", text: "T" }] },
    (t) => ad.push(t)
  );
  const a = calls.anthropic[0].req;
  check("model claude-opus-5-5, streamed", a.model, "claude-opus-5-5");
  check("no temperature (Opus 5.5 rejects sampling)", "temperature" in a, false);
  check("effort low by default", a.output_config, { effort: "low" });
  check("thinking headroom on max_tokens", a.max_tokens, 12000);
  check("server-side fallback on (skill default)", [a.fallbacks, a.betas], ["default", ["server-side-fallback-2026-07-01"]]);
  check("system prompt byte-identical", a.system, "SYS");
  check("data URL → base64 image block", a.messages[0].content[0], { type: "image", source: { type: "base64", media_type: "image/png", data: "QUJD" } });
  check("text deltas stream (thinking ignored)", ad.join(""), anthropicReply.text);
  check("usage mapped to OpenAI names", ares.usage, { prompt_tokens: 100, completion_tokens: 40 });
  check("end_turn → stop", ares.finishReason, "stop");
  const pj = await llm.llmJson({ step: "mood", maxTokens: 100, system: "", user: "" });
  check("a fenced reply parses", pj.parsed, { ok: true });
  process.env.REKS_ANTHROPIC_EFFORT = "medium";
  process.env.REKS_ANTHROPIC_FALLBACKS = "off";
  await llm.llmCall({ step: "wine", maxTokens: 10, system: "", user: "" });
  check("effort env + fallbacks off", [calls.anthropic.at(-1).req.output_config.effort, "fallbacks" in calls.anthropic.at(-1).req], ["medium", false]);
  anthropicReply = { text: "", stop: "refusal", model: "claude-opus-5-5" };
  const rr = await llm.llmCall({ step: "vision", maxTokens: 10, system: "", user: "" });
  check("refusal surfaces + is logged by name", [!!rr.refusal, logs.some((l) => l.startsWith("[llm] refusal"))], [true, true]);
  anthropicReply = { text: '{"a":1}', stop: "end_turn", model: "claude-opus-4-8" };
  await llm.llmCall({ step: "vision", maxTokens: 10, system: "", user: "" });
  check("a fallback-served answer is named", logs.some((l) => l.startsWith("[llm] served by fallback model")), true);
  anthropicReply = { text: '```json\n{"ok":true}\n```', stop: "end_turn", model: "claude-opus-5-5" };
  check("jsonText strips a fence / prose", [llm.jsonText('```\n{"x":1}\n```'), llm.jsonText('Here: {"x":1} done')], ['{"x":1}', '{"x":1}']);
  resetEnv();

  console.log("\n5. Dev-only hooks");
  process.env.NODE_ENV = "development";
  calls.anthropic.length = 0;
  const mkReq = (h) => new Request("http://x/api", { method: "POST", headers: h });
  let res = await llm.withLlmContext(mkReq({ "x-reks-provider": "anthropic", "x-reks-diag": "1" }), async () => {
    await llm.llmCall({ step: "shelf", temperature: 0, maxTokens: 10, system: "", user: "" });
    return Response.json({ ok: 1 });
  });
  const diag = JSON.parse(res.headers.get("x-reks-diag") || "[]");
  check("header override → anthropic for this request only", [calls.anthropic.length, diag[0]?.provider], [1, "anthropic"]);
  check("diag carries tokens and cost", [diag[0]?.in, diag[0]?.out, Math.round((diag[0]?.usd ?? 0) * 1e6)], [100, 40, 1200]);
  check("outside the request: default again", llm.resolveStep("shelf").provider, "openai");
  process.env.VERCEL_ENV = "production";
  calls.anthropic.length = 0;
  res = await llm.withLlmContext(mkReq({ "x-reks-provider": "anthropic", "x-reks-diag": "1" }), async () => {
    await llm.llmCall({ step: "shelf", temperature: 0, maxTokens: 10, system: "", user: "" });
    return Response.json({ ok: 1 });
  });
  check("production ignores both headers", [calls.anthropic.length, res.headers.get("x-reks-diag")], [0, null]);
  resetEnv();

  console.log("\n6. Failures: Anthropic errors → the same honest kinds");
  const { classifyOpenAIError } = load("src/lib/openaiFailure.ts");
  const e = (status, message, name) => Object.assign(new Error(message), { status, ...(name ? { name } : {}) });
  check("401 → auth", classifyOpenAIError(e(401, "invalid x-api-key")).kind, "auth");
  check("429 → rate_limit", classifyOpenAIError(e(429, "rate")).kind, "rate_limit");
  check("529 overloaded → rate_limit", classifyOpenAIError(e(529, "Overloaded")).kind, "rate_limit");
  check("400 credit balance → quota", classifyOpenAIError(e(400, "Your credit balance is too low to access the Anthropic API.")).kind, "quota");
  check("other 400 stays unknown", classifyOpenAIError(e(400, "bad")).kind, "unknown");
  check("connection → unreachable", classifyOpenAIError(e(undefined, "x", "APIConnectionError")).kind, "unreachable");

  console.log("\n7. Boot check");
  const envSrc = read("src/lib/envCheck.ts");
  check("names the anthropic steps without a key", /ANTHROPIC_API_KEY missing but \$\{onAnthropic\.join/.test(envSrc), true);
  check("health reports provider per step", read("app/api/health/route.ts").includes("providerSummary()"), true);

  console.log("\n8. Prompts byte-identical to main before S13 (no VOICE in this PR)");
  for (const f of ["app/api/reksnap/route.ts", "src/lib/wineReks.ts", "src/lib/mediaReks.ts", "src/lib/slotRecipe.ts"]) {
    const d = execSync(`git diff ${BASE} -- ${f}`, { cwd: root, encoding: "utf8" });
    // A string line may move (re-indent) but never change: every removed
    // literal line must come back, trimmed, among the added lines.
    const lines = d.split("\n");
    const added = new Set(lines.filter((l) => /^\+(?!\+\+)/.test(l)).map((l) => l.slice(1).trim()));
    const changed = lines
      .filter((l) => /^-\s*["'`]/.test(l) && !/^---/.test(l))
      .filter((l) => !added.has(l.slice(1).trim()));
    check(`${f}: no prompt string line removed or changed`, changed, []);
  }
  const route = read("app/api/reksnap/route.ts");
  check("the three snap reads still use SYSTEM_PROMPT", (route.match(/system: SYSTEM_PROMPT/g) || []).length, 3);
  check("no vision/shelf/wine/lines call left on the raw SDK", [
    /model: "gpt-4o",\s*temperature: 0\.7,\s*\/\/ Three lists/.test(route),
    /openai\.chat/.test(read("src/lib/wineReks.ts")),
    /openai\.chat/.test(read("src/lib/mediaReks.ts")),
  ], [false, false, false]);
  check("routes wrapped for the dev hook", ["app/api/reksnap/route.ts", "app/api/anchor/route.ts", "app/api/slots/route.ts"].map((f) => read(f).includes("withLlmContext(req, () => handlePost(req))")), [true, true, true]);

  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  process.stderr.write("HARNESS CRASH: " + (err && err.stack) + String.fromCharCode(10));
  process.exit(1);
});
