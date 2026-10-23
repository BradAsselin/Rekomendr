#!/usr/bin/env node
/* S14 — all Claude (docs/s14-all-claude-plan.md). Every model call goes
 * through llmCall; Claude is the default when ANTHROPIC_API_KEY is set,
 * OpenAI (pre-S13 models, exact arguments) when it is not; moderation stays
 * on OpenAI; prompts byte-identical. Stubs both SDKs — no keys, no network.
 * Run: node scripts/validate-s14.cjs */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const BASE = "9f8e522"; // main before S14

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
    this.chat = {
      completions: {
        create: async (req) => {
          calls.openai.push(req);
          return { choices: [{ message: { content: '[{"title":"A"}]' }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
        },
      },
    };
  }
}
class FakeAnthropic {
  constructor() {
    this.beta = {
      messages: {
        stream: (req) => {
          calls.anthropic.push(req);
          const it = (async function* () {
            yield { type: "content_block_delta", delta: { type: "text_delta", text: '```json\n[{"title":"A"}]\n```' } };
          })();
          it.finalMessage = async () => ({ model: req.model, stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } });
          return it;
        },
      },
    };
  }
}

function load(rel) {
  const out = ts.transpileModule(read(rel), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true },
  }).outputText;
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

for (const level of ["warn", "info", "error", "log"]) {
  if (level !== "log") console[level] = () => {};
}
const clearEnv = () => {
  for (const k of Object.keys(process.env)) if (k.startsWith("REKS_")) delete process.env[k];
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.VERCEL_ENV;
};

(async () => {
  clearEnv();
  const llm = load("src/lib/llm.ts");
  const STEPS = ["vision", "shelf", "wine", "lines", "mood", "search", "snap", "detail", "recipe", "classify"];
  check("ten steps on the switch", llm.LLM_STEPS, STEPS);

  console.log("1. No Anthropic key → every step on its pre-S13 OpenAI model");
  const OLD = ["gpt-4o", "gpt-4o", "gpt-4o", "gpt-4o-mini", "gpt-4o-mini", "gpt-4o-mini", "gpt-4o", "gpt-4o", "gpt-4o", "gpt-4o-mini"];
  check("providerSummary", STEPS.map((s) => llm.providerSummary()[s]), OLD.map((m) => `openai:${m}`));

  console.log("\n2. Key present → Claude per step");
  process.env.ANTHROPIC_API_KEY = "stub";
  const CLAUDE = ["claude-sonnet-5-5", "claude-opus-5-5", "claude-sonnet-5-5", "claude-sonnet-5-5", "claude-haiku-5-5",
    "claude-sonnet-5-5", "claude-sonnet-5-5", "claude-sonnet-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"];
  check("providerSummary", STEPS.map((s) => llm.providerSummary()[s]), CLAUDE.map((m) => `anthropic:${m}`));
  process.env.REKS_MODEL_PROVIDER = "openai";
  check("REKS_MODEL_PROVIDER=openai rolls every step back", STEPS.map((s) => llm.resolveStep(s).model), OLD);
  process.env.REKS_PROVIDER_SEARCH = "anthropic";
  check("…and one step can stay on Claude", llm.resolveStep("search"), { provider: "anthropic", model: "claude-sonnet-5-5" });
  delete process.env.REKS_MODEL_PROVIDER;
  delete process.env.REKS_PROVIDER_SEARCH;
  process.env.REKS_MODEL_SEARCH = "claude-haiku-5-5";
  check("REKS_MODEL_<STEP> picks the Claude model", llm.resolveStep("search").model, "claude-haiku-5-5");
  delete process.env.REKS_MODEL_SEARCH;

  console.log("\n3. The json flag (search prompt mode)");
  process.env.REKS_MODEL_PROVIDER = "openai";
  await llm.llmCall({ step: "search", json: false, temperature: 0.85, maxTokens: 6000, system: "S", user: "U" });
  check("json:false → no response_format on OpenAI", "response_format" in calls.openai.at(-1), false);
  await llm.llmCall({ step: "search", json: true, temperature: 0.5, maxTokens: 6000, system: "S", user: "U" });
  check("json:true → json_object", calls.openai.at(-1).response_format, { type: "json_object" });
  await llm.llmCall({ step: "snap", maxTokens: 300, system: "S", user: "U" });
  check("json unset → json_object (every other site, as before)", calls.openai.at(-1).response_format, { type: "json_object" });
  delete process.env.REKS_MODEL_PROVIDER;
  const r = await llm.llmCall({ step: "search", json: false, maxTokens: 6000, system: "S", user: "U" });
  check("Claude search call: Sonnet, no temperature, +8000 thinking headroom", [calls.anthropic.at(-1).model, "temperature" in calls.anthropic.at(-1), calls.anthropic.at(-1).max_tokens], ["claude-sonnet-5-5", false, 14000]);
  check("a fenced array reply still holds the array (extractJsonArray finds it)", /\[[\s\S]*\]/.exec(r.text)[0], '[{"title":"A"}]');

  console.log("\n4. Every generation site goes through llmCall");
  const sites = {
    "app/api/openai/route.ts": ['step: "search"'],
    "app/api/recipe/route.ts": ['step: "recipe"'],
    "src/lib/anchorCompletion.ts": ['step: "detail"'],
    "app/api/reksnap/route.ts": ['step: "snap"', 'step: "detail"', 'step: "classify"'],
  };
  for (const [f, steps] of Object.entries(sites)) {
    const src = read(f);
    check(`${f}: ${steps.join(", ")}`, steps.map((s) => src.includes(s)), steps.map(() => true));
    check(`${f}: no raw SDK left`, /chat\.completions|new OpenAI|from "openai"/.test(src), false);
  }
  const route = read("app/api/reksnap/route.ts");
  check("reksnap: two snap calls (backfill + chain)", (route.match(/step: "snap"/g) || []).length, 2);
  const grep = execSync('git grep -l -E "chat\\.completions|new OpenAI\\(" -- app src', { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/).sort();
  check("raw OpenAI clients left: llm.ts, the two moderation routes, the dead openaiClient.ts", grep,
    ["app/api/profile/route.ts", "app/api/share/route.ts", "src/lib/llm.ts", "src/lib/openaiClient.ts"]);
  check("profile + share: moderation only", ["app/api/profile/route.ts", "app/api/share/route.ts"].map((f) => /chat\.completions/.test(read(f))), [false, false]);
  check("detail: Show details and the share-time completion share step + schema",
    [route.includes("schema: ANCHOR_DETAIL_SCHEMA"), read("src/lib/anchorCompletion.ts").includes("schema: ANCHOR_DETAIL_SCHEMA")], [true, true]);
  check("schemas on recipe + classifier", [read("app/api/recipe/route.ts").includes("schema: RECIPE_SCHEMA"), route.includes("schema: TYPED_WINE_SCHEMA")], [true, true]);
  check("openai + recipe routes wrapped for the dev hook", ["app/api/openai/route.ts", "app/api/recipe/route.ts"].map((f) =>
    /export async function POST\(req: Request\) \{\s*return withLlmContext\(req, \(\) => handle\(req\)\);/.test(read(f))), [true, true]);

  console.log("\n5. Prompts byte-identical to main before S14 (no VOICE in this PR)");
  for (const f of ["app/api/reksnap/route.ts", "app/api/openai/route.ts", "app/api/recipe/route.ts", "src/lib/anchorCompletion.ts", "src/lib/anchorDetailPrompt.ts"]) {
    const d = execSync(`git diff ${BASE} -- ${f}`, { cwd: root, encoding: "utf8" });
    const lines = d.split("\n");
    const added = new Set(lines.filter((l) => /^\+(?!\+\+)/.test(l)).map((l) => l.slice(1).trim()));
    const changed = lines
      .filter((l) => /^-\s*["'`]/.test(l) && !/^---/.test(l))
      .filter((l) => !added.has(l.slice(1).trim()));
    check(`${f}: no prompt string line removed or changed`, changed, []);
  }
  const { ANCHOR_DETAIL_PROMPT } = load("src/lib/anchorDetailPrompt.ts");
  const sha = require("crypto").createHash("sha256").update(ANCHOR_DETAIL_PROMPT, "utf8").digest("hex").slice(0, 12);
  check("ANCHOR_DETAIL_PROMPT sha unchanged (d500c0cf5cf5…)", sha.startsWith("d500c0cf5cf5"), true);
  check("search system line unchanged", read("app/api/openai/route.ts").includes('system: "You are a recommendation engine. Return only valid JSON."'), true);

  console.log("\n6. Boot check names the state");
  const env = read("src/lib/envCheck.ts");
  check("no Anthropic key is named", env.includes("ANTHROPIC_API_KEY missing — every model step runs on the pre-S14 OpenAI models"), true);
  check("OpenAI key missing with Claude on: moderation named", env.includes("OPENAI_API_KEY missing — moderation fails closed"), true);
  check("every step's provider var is watched", ["SEARCH", "SNAP", "DETAIL", "RECIPE", "CLASSIFY"].every((s) => env.includes(`"${s}"`)), true);

  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  process.stderr.write("HARNESS CRASH: " + (err && err.stack) + String.fromCharCode(10));
  process.exit(1);
});
