// src/lib/llm.ts — server-only. S13a: the provider switch
// (docs/s13-opus-voice-plan.md, Part A).
//
// One door for the five model steps Brad named. The default is OpenAI
// with every argument exactly as the call sites passed it before S13 —
// the live app does not change until someone sets the env:
//
//   REKS_MODEL_PROVIDER=openai|anthropic   every step (unset = openai)
//   REKS_PROVIDER_<STEP>=openai|anthropic  one step  (e.g. REKS_PROVIDER_SHELF)
//   REKS_MODEL_<STEP>=<model id>           that step's model on its provider
//   REKS_ANTHROPIC_EFFORT=low|medium|high  Opus 5.5 can't turn thinking off;
//                                          effort is the latency lever (default low)
//   REKS_ANTHROPIC_FALLBACKS=off           drop the server-side refusal fallback
//
// Steps: vision (the snap read, the strip read, the typed-wine read),
// shelf (readShelf), wine (the wine picks), lines (the media chooser and
// the go-to lines), mood (the voice mood parser).
//
// Prompts pass through byte-identical. Anthropic has no json_object mode
// and no prefill; the prompts already say "Return JSON only", and
// jsonText() strips a code fence if one comes back. Any rewording for
// Claude is VOICE and ships in its own PR.
//
// Dev-only comparison hook: inside withLlmContext(), the request header
// `x-reks-provider` overrides the provider and `x-reks-diag: 1` returns
// every call's provider/model/ms/tokens/cost as the `x-reks-diag` response
// header. Both are ignored on production.

if (typeof window !== "undefined") {
  throw new Error("llm.ts was imported in a browser bundle.");
}

import { AsyncLocalStorage } from "node:async_hooks";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { isProductionRuntime } from "./envCheck";

export type LlmStep = "vision" | "shelf" | "wine" | "lines" | "mood";
export type LlmProvider = "openai" | "anthropic";
export const LLM_STEPS: LlmStep[] = ["vision", "shelf", "wine", "lines", "mood"];

// Today's OpenAI models, per step (the defaults before S13).
const OPENAI_DEFAULT: Record<LlmStep, string> = {
  vision: "gpt-4o",
  shelf: "gpt-4o",
  wine: "gpt-4o",
  lines: "gpt-4o-mini",
  mood: "gpt-4o-mini",
};
const ANTHROPIC_DEFAULT = "claude-opus-5-5";

export type LlmPart =
  | { type: "text"; text: string }
  | { type: "image"; url: string; detail?: "high" | "low" | "auto" };

export type LlmRequest = {
  step: LlmStep;
  system: string;
  user: string | LlmPart[];
  maxTokens: number;
  // OpenAI only — Opus 5.5 rejects sampling parameters.
  temperature?: number;
  signal?: AbortSignal;
  // S13d — Anthropic only: the reply's JSON schema (structured outputs).
  // OpenAI keeps its json_object mode; Claude has no JSON mode, and Sonnet
  // 5.5 at effort low dropped a quote in 4 of 6 chooser replies without it.
  schema?: Record<string, unknown>;
};

export type LlmResult = {
  text: string;
  // OpenAI's names, so existing usage logs read the same.
  usage: { prompt_tokens: number; completion_tokens: number } | null;
  finishReason: string | null;
  refusal: string;
  provider: LlmProvider;
  model: string;
  ms: number;
};

type DiagCall = {
  step: LlmStep;
  provider: LlmProvider;
  model: string;
  ms: number;
  firstTokenMs: number | null;
  in: number;
  out: number;
  usd: number;
  // A stream stopped on purpose (the media path, the wine cut) or failed:
  // tokens are what was known when it ended (out ≈ streamed chars / 4).
  aborted?: boolean;
};

type StepChoice = { provider: LlmProvider; model: string };
type LlmContext = {
  provider: LlmProvider | null;
  // S13d — dev-only per-step override (x-reks-steps), for comparing one
  // step on another model while the rest stay as configured.
  steps: Partial<Record<LlmStep, StepChoice>>;
  diag: DiagCall[] | null;
};
const ctx = new AsyncLocalStorage<LlmContext>();

const asProvider = (v: unknown): LlmProvider | null =>
  v === "openai" || v === "anthropic" ? v : null;

// "wine=anthropic:claude-sonnet-5-5,mood=openai:gpt-4o-mini"
function parseSteps(raw: string | null): Partial<Record<LlmStep, StepChoice>> {
  const out: Partial<Record<LlmStep, StepChoice>> = {};
  for (const part of (raw ?? "").split(",")) {
    const m = /^\s*(\w+)\s*=\s*(openai|anthropic):([a-z0-9.\-]{3,60})\s*$/i.exec(part);
    const step = m?.[1].toLowerCase() as LlmStep | undefined;
    if (m && step && LLM_STEPS.includes(step)) out[step] = { provider: m[2].toLowerCase() as LlmProvider, model: m[3] };
  }
  return out;
}

export function resolveStep(step: LlmStep): { provider: LlmProvider; model: string } {
  const forced = ctx.getStore()?.steps[step];
  if (forced) return forced;
  const env = process.env;
  const key = step.toUpperCase();
  const provider =
    ctx.getStore()?.provider ??
    asProvider(env[`REKS_PROVIDER_${key}`]?.trim()) ??
    asProvider(env.REKS_MODEL_PROVIDER?.trim()) ??
    "openai";
  const model =
    env[`REKS_MODEL_${key}`]?.trim() ||
    (provider === "anthropic" ? ANTHROPIC_DEFAULT : OPENAI_DEFAULT[step]);
  return { provider, model };
}

// For /api/health and the boot check.
export function providerSummary(): Record<LlmStep, string> {
  const out = {} as Record<LlmStep, string>;
  for (const s of LLM_STEPS) {
    const r = resolveStep(s);
    out[s] = `${r.provider}:${r.model}`;
  }
  return out;
}

export function anthropicStepsMissingKey(): LlmStep[] {
  if (process.env.ANTHROPIC_API_KEY?.trim()) return [];
  return LLM_STEPS.filter((s) => resolveStep(s).provider === "anthropic");
}

// ---------------------------------------------------------------------------
// Dev-only context: provider override + per-call diagnostics.
// ---------------------------------------------------------------------------
export async function withLlmContext(
  req: Request,
  fn: () => Promise<Response>
): Promise<Response> {
  const wantProvider = asProvider(req.headers.get("x-reks-provider"));
  const wantSteps = parseSteps(req.headers.get("x-reks-steps"));
  const anySteps = Object.keys(wantSteps).length > 0;
  const wantDiag = req.headers.get("x-reks-diag") === "1";
  if ((wantProvider || anySteps || wantDiag) && isProductionRuntime()) {
    console.warn("[llm] dev-only headers ignored on production");
    return fn();
  }
  if (!wantProvider && !anySteps && !wantDiag) return fn();
  const store: LlmContext = { provider: wantProvider, steps: wantSteps, diag: wantDiag ? [] : null };
  const res = await ctx.run(store, fn);
  if (!store.diag) return res;
  const headers = new Headers(res.headers);
  headers.set("x-reks-diag", JSON.stringify(store.diag));
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

// The calls recorded so far in this request (the NDJSON path writes them
// into its final line, after the headers have already gone).
export const currentDiag = (): DiagCall[] | null => ctx.getStore()?.diag ?? null;

// List prices, USD per million tokens (input, output). Diagnostics only.
const PRICES: Record<string, [number, number]> = {
  "gpt-4o": [2.5, 10],
  "gpt-4o-mini": [0.15, 0.6],
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  // Up to 100K-token prompts (every call here is far below that).
  "claude-haiku-5-5": [0.1, 0.5],
};

// S13d — the server-side refusal fallback ("default" form) is accepted on
// the Opus/Fable line and Sonnet 5.5 on the Claude API; Haiku 5.5 has no
// server-side fallback, so it is never sent there.
const FALLBACK_MODELS = /^claude-(opus-5|opus-5-5|fable-5|fable-5-1|sonnet-5-5)$/;

function record(
  step: LlmStep,
  r: { provider: LlmProvider; model: string; ms: number; firstTokenMs: number | null; aborted?: boolean },
  usage: LlmResult["usage"]
) {
  const diag = ctx.getStore()?.diag;
  if (!diag) return;
  const p = PRICES[r.model] ?? [0, 0];
  const inTok = usage?.prompt_tokens ?? 0;
  const outTok = usage?.completion_tokens ?? 0;
  diag.push({
    step,
    provider: r.provider,
    model: r.model,
    ms: r.ms,
    firstTokenMs: r.firstTokenMs,
    in: inTok,
    out: outTok,
    usd: (inTok * p[0] + outTok * p[1]) / 1e6,
    ...(r.aborted ? { aborted: true } : {}),
  });
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
// Built on first use: a route that never calls a model never needs a key.
let openaiClient: OpenAI | null = null;
function openai(): OpenAI {
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

let anthropicClient: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1 });
  }
  return anthropicClient;
}

const effort = (): "low" | "medium" | "high" => {
  const v = process.env.REKS_ANTHROPIC_EFFORT?.trim();
  return v === "medium" || v === "high" ? v : "low";
};

// Thinking tokens count against max_tokens on Opus 5.5; a cap sized for
// a non-thinking model would truncate the JSON.
const anthropicMaxTokens = (n: number) => n + 8000;

function dataUrlParts(url: string): { media: string; data: string } | null {
  const m = /^data:(image\/(?:jpeg|png|gif|webp));base64,([\s\S]+)$/.exec(url);
  return m ? { media: m[1], data: m[2] } : null;
}

function anthropicContent(user: LlmRequest["user"]): Anthropic.Beta.BetaContentBlockParam[] | string {
  if (typeof user === "string") return user;
  return user.map((p): Anthropic.Beta.BetaContentBlockParam => {
    if (p.type === "text") return { type: "text", text: p.text };
    const d = dataUrlParts(p.url);
    if (d) {
      return {
        type: "image",
        source: {
          type: "base64",
          media_type: d.media as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data: d.data,
        },
      };
    }
    return { type: "image", source: { type: "url", url: p.url } };
  });
}

function openaiContent(user: LlmRequest["user"]) {
  if (typeof user === "string") return user;
  return user.map((p) =>
    p.type === "text"
      ? { type: "text" as const, text: p.text }
      : {
          type: "image_url" as const,
          image_url: p.detail ? { url: p.url, detail: p.detail } : { url: p.url },
        }
  );
}

// ---------------------------------------------------------------------------
// THE CALL. onDelta (optional) receives the text as it streams; the
// result carries the full text either way.
// ---------------------------------------------------------------------------
export async function llmCall(
  req: LlmRequest,
  onDelta?: (text: string) => void
): Promise<LlmResult> {
  const { provider, model } = resolveStep(req.step);
  const started = Date.now();
  let firstTokenMs: number | null = null;
  let streamedChars = 0;
  let knownInput = 0;
  const delta = (t: string) => {
    if (!t) return;
    if (firstTokenMs == null) firstTokenMs = Date.now() - started;
    streamedChars += t.length;
    onDelta?.(t);
  };
  // Diagnostics for a call that ended early (aborted or failed); rethrows.
  const recordEnded = (err: unknown, provider: LlmProvider): never => {
    record(
      req.step,
      { provider, model, ms: Date.now() - started, firstTokenMs, aborted: true },
      { prompt_tokens: knownInput, completion_tokens: Math.ceil(streamedChars / 4) }
    );
    throw err;
  };

  if (provider === "anthropic") {
    const fallbacksOn =
      process.env.REKS_ANTHROPIC_FALLBACKS?.trim() !== "off" && FALLBACK_MODELS.test(model);
    const stream = anthropic().beta.messages.stream(
      {
        model,
        max_tokens: anthropicMaxTokens(req.maxTokens),
        system: req.system,
        messages: [{ role: "user", content: anthropicContent(req.user) }],
        output_config: {
          effort: effort(),
          ...(req.schema ? { format: { type: "json_schema" as const, schema: req.schema } } : {}),
        },
        ...(fallbacksOn
          ? { fallbacks: "default" as const, betas: ["server-side-fallback-2026-07-01"] }
          : {}),
      },
      { signal: req.signal }
    );
    let text = "";
    let msg: Awaited<ReturnType<typeof stream.finalMessage>>;
    try {
      for await (const ev of stream) {
        if (ev.type === "message_start") knownInput = ev.message.usage?.input_tokens ?? 0;
        if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
          text += ev.delta.text;
          delta(ev.delta.text);
        }
      }
      msg = await stream.finalMessage();
    } catch (err) {
      return recordEnded(err, provider);
    }
    const u = msg.usage;
    const usage = {
      prompt_tokens:
        (u.input_tokens ?? 0) +
        (u.cache_read_input_tokens ?? 0) +
        (u.cache_creation_input_tokens ?? 0),
      completion_tokens: u.output_tokens ?? 0,
    };
    let refusal = "";
    if (msg.stop_reason === "refusal") {
      const details = (msg as { stop_details?: { category?: string | null; explanation?: string | null } })
        .stop_details;
      refusal = details?.explanation || "refused";
      console.error("[llm] refusal", { step: req.step, model: msg.model, category: details?.category ?? null });
    }
    if (msg.model && msg.model !== model) {
      console.warn("[llm] served by fallback model", { step: req.step, asked: model, served: msg.model });
    }
    const finishReason =
      msg.stop_reason === "end_turn" ? "stop" : msg.stop_reason === "max_tokens" ? "length" : msg.stop_reason ?? null;
    const ms = Date.now() - started;
    record(req.step, { provider, model: msg.model || model, ms, firstTokenMs }, usage);
    return { text, usage, finishReason, refusal, provider, model: msg.model || model, ms };
  }

  // OpenAI — the exact pre-S13 arguments.
  const messages = [
    { role: "system" as const, content: req.system },
    { role: "user" as const, content: openaiContent(req.user) },
  ];
  if (onDelta) {
    const stream = await openai().chat.completions.create(
      {
        model,
        ...(req.temperature != null ? { temperature: req.temperature } : {}),
        max_tokens: req.maxTokens,
        response_format: { type: "json_object" },
        stream: true,
        stream_options: { include_usage: true },
        messages: messages as never,
      },
      { signal: req.signal }
    );
    let text = "";
    let refusal = "";
    let finishReason: string | null = null;
    let usage: LlmResult["usage"] = null;
    try {
      for await (const chunk of stream) {
        const choice = chunk.choices?.[0];
        const t = choice?.delta?.content ?? "";
        text += t;
        delta(t);
        const r = (choice?.delta as { refusal?: string | null } | undefined)?.refusal;
        if (typeof r === "string") refusal += r;
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        if (chunk.usage) {
          usage = {
            prompt_tokens: chunk.usage.prompt_tokens ?? 0,
            completion_tokens: chunk.usage.completion_tokens ?? 0,
          };
        }
      }
    } catch (err) {
      return recordEnded(err, provider);
    }
    const ms = Date.now() - started;
    record(req.step, { provider, model, ms, firstTokenMs }, usage);
    return { text, usage, finishReason, refusal, provider, model, ms };
  }

  const completion = await openai().chat.completions.create(
    {
      model,
      ...(req.temperature != null ? { temperature: req.temperature } : {}),
      max_tokens: req.maxTokens,
      response_format: { type: "json_object" },
      messages: messages as never,
    },
    { signal: req.signal }
  );
  const choice = completion.choices?.[0];
  const usage = completion.usage
    ? {
        prompt_tokens: completion.usage.prompt_tokens ?? 0,
        completion_tokens: completion.usage.completion_tokens ?? 0,
      }
    : null;
  const ms = Date.now() - started;
  record(req.step, { provider, model, ms, firstTokenMs: ms }, usage);
  return {
    text: choice?.message?.content ?? "",
    usage,
    finishReason: choice?.finish_reason ?? null,
    refusal: (choice?.message as { refusal?: string | null } | undefined)?.refusal ?? "",
    provider,
    model,
    ms,
  };
}

// The model's JSON as text: a code fence (Claude sometimes adds one) is
// stripped; anything else passes through for the caller's JSON.parse.
export function jsonText(raw: string): string {
  const t = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t);
  if (fence) return fence[1];
  if (t.startsWith("{")) return t;
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  return a >= 0 && b > a ? t.slice(a, b + 1) : t;
}

// Convenience: one call, parsed. Null (and a named log line) on non-JSON.
export async function llmJson<T = any>(
  req: LlmRequest
): Promise<{ parsed: T | null; result: LlmResult }> {
  const result = await llmCall(req);
  try {
    return { parsed: JSON.parse(jsonText(result.text)) as T, result };
  } catch {
    console.warn("[llm] non-JSON", {
      step: req.step,
      provider: result.provider,
      model: result.model,
      finishReason: result.finishReason,
      head: result.text.slice(0, 160),
    });
    return { parsed: null, result };
  }
}
