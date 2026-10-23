import { runEnvCheck, isProductionRuntime } from "../../../src/lib/envCheck";
import {
  maybeSimulateOpenAIFailure,
  openAIFailureResponse,
} from "../../../src/lib/openaiFailure";
import { capGate } from "../../../src/lib/apiUsage";
import { jsonText, llmCall, withLlmContext } from "../../../src/lib/llm";

export const runtime = "nodejs";

// Boot-time env-pair check (logs once per process, hostnames only).
runEnvCheck();

// Permanent dev/preview-only prompt fingerprint. buildAIPrompt runs
// CLIENT-side, so the prompt that arrives here is the one the user's bundle
// built — these markers say which era of prompt that bundle carries.
// hasExpectLine is the RETIRED heading (d68cb6d): true means a stale bundle.
// Never logs prompt text, only markers and length. Silent on production.
function logPromptDiag(prompt: string, extra: Record<string, unknown>): void {
  if (isProductionRuntime()) return;
  console.log("[prompt-diag]", {
    hasSimulationClose: prompt.includes("THE SIMULATION CLOSE"),
    hasBannedRegister: prompt.includes("BANNED REGISTER"),
    hasExpectLine: prompt.includes("THE EXPECT LINE"),
    hasPrimeRule: prompt.includes("THE PRIME RULE"),
    promptChars: prompt.length,
    ...extra,
  });
}

type Candidate = {
  id: number;
  title: string;
  year: number;
  genre?: string;
  vibeTags?: string[];
  tier?: "T1" | "T2" | "T3";
  short?: string;
};

// S14 — the search step (src/lib/llm.ts): Claude by default, the dev
// comparison headers honored off production.
export async function POST(req: Request) {
  return withLlmContext(req, () => handle(req));
}

// The prompt mode had no max_tokens on OpenAI. Claude needs one: this sits
// above the ~4,800-token ceiling of a 12-item backfill ask
// (rekomendrEngine.ts sizing note).
const SEARCH_MAX_TOKENS = 6000;

async function handle(req: Request): Promise<Response> {
  try {
    // Dev/preview-only: REKOMENDR_SIMULATE_OPENAI_FAILURE throws the
    // matching OpenAI-shaped error so the honest copy can be seen.
    maybeSimulateOpenAIFailure();

    const body = await req.json();

    // S3.6: per-client daily cap (Ledger #19). 400 without a client id.
    const capped = await capGate(body?.clientId, "openai");
    if (capped) return capped;

    /* ------------------------------
       V1 MAGIC MODE (prompt based)
    ------------------------------ */
    if (typeof body?.prompt === "string" && body.prompt.trim()) {
      // Callers (e.g. backfill) may request a tighter, JSON-constrained
      // response. Defaults preserve the original behavior for everything else.
      const temperature =
        typeof body?.temperature === "number" ? body.temperature : 0.85;
      const useJson = body?.jsonResponse === true;

      logPromptDiag(body.prompt, { temperature, jsonResponse: useJson });

      // The reply goes back as text; the engine's extractJsonArray finds
      // the array in a bare reply, an object, prose or a code fence.
      const completion = await llmCall({
        step: "search",
        temperature,
        json: useJson,
        maxTokens: SEARCH_MAX_TOKENS,
        system: "You are a recommendation engine. Return only valid JSON.",
        user: body.prompt,
      });
      if (completion.refusal) {
        console.error("[search] model refused", { model: completion.model });
      }

      const text = completion.text;

      return new Response(text, {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    /* ------------------------------
       CANDIDATE PICKER MODE (old)
    ------------------------------ */
    const { kind, context, count, candidates } = body as {
      kind?: string;
      context?: string;
      count?: number;
      candidates?: Candidate[];
    };

    if (kind === "pick_from_candidates") {
      if (
        typeof context !== "string" ||
        !Array.isArray(candidates) ||
        typeof count !== "number" ||
        candidates.length < count
      ) {
        return Response.json({ ids: null }, { status: 200 });
      }

      const prompt = `
Pick exactly ${count} IDs from the candidate list that best match the context.

Return JSON ONLY in this format:
{ "ids": [1,2,3,4,5] }

Rules:
- ids must be unique
- ids must come only from the candidate list
- no commentary
- no markdown
- no extra keys

Context:
${context}

Candidates:
${JSON.stringify(candidates)}
`.trim();

      const completion = await llmCall({
        step: "search",
        temperature: 0.4,
        maxTokens: 300,
        system: "Return JSON only.",
        user: prompt,
      });

      const text = jsonText(completion.text);

      let parsed: any = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        return Response.json({ ids: null }, { status: 200 });
      }

      const ids = parsed?.ids;
      if (!Array.isArray(ids) || ids.length !== count) {
        return Response.json({ ids: null }, { status: 200 });
      }

      const idSet = new Set(candidates.map((c) => c.id));
      const uniq = new Set<number>();

      for (const id of ids) {
        if (typeof id !== "number") return Response.json({ ids: null }, { status: 200 });
        if (!idSet.has(id)) return Response.json({ ids: null }, { status: 200 });
        uniq.add(id);
      }

      if (uniq.size !== count) {
        return Response.json({ ids: null }, { status: 200 });
      }

      return Response.json({ ids }, { status: 200 });
    }

    return new Response("Invalid request", { status: 400 });
  } catch (err) {
    // Named service failures (out of credit, key refused, rate-limited,
    // unreachable) answer with honest copy + reason; the log line names
    // them. Everything else keeps the bare 500 it always had.
    const failure = openAIFailureResponse("openai", err);
    if (failure) return failure;
    console.error("OpenAI route error:", err);
    return new Response("Server error", { status: 500 });
  }
}
