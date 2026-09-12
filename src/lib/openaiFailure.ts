// src/lib/openaiFailure.ts — server-only.
//
// Turns an OpenAI SDK error into (a) a server log line that names the
// failure and (b) an honest, PLAIN-VOICE user message with the HTTP status
// the route should answer. Plain voice is deliberate: Reks Ray speaks for
// the AI's own work; a failure of the machinery around it speaks plainly.
//
// The body: a two-week silent outage ending 2026-09-11. The OpenAI account
// ran dry, every route collapsed the SDK's `insufficient_quota` into a bare
// 500, and the UI said "give it another go" for fourteen days.

import OpenAI from "openai";
import { isProductionRuntime } from "./envCheck";

export type OpenAIFailureKind =
  | "quota" // 429 + code insufficient_quota — account out of credit
  | "auth" // 401 — key missing, revoked, or for another project
  | "rate_limit" // 429 without insufficient_quota — too many requests
  | "unreachable" // connection / timeout — never got an answer
  | "unknown"; // anything else: the route keeps its existing behavior

export type OpenAIFailure = {
  kind: OpenAIFailureKind;
  status: number; // HTTP status the route should return
  userMessage: string; // plain voice, rendered as-is
  code?: string;
  upstreamStatus?: number;
};

const USER_COPY: Record<Exclude<OpenAIFailureKind, "unknown">, string> = {
  quota:
    "Rekomendr’s AI account is out of credit. Not your doing — try again later.",
  auth:
    "Rekomendr can’t sign in to its AI service right now. Not your doing — try again later.",
  rate_limit:
    "The AI service is busy right now. Give it a minute and try again.",
  unreachable:
    "Rekomendr couldn’t reach its AI service. Not your doing — try again in a minute.",
};

export function classifyOpenAIError(err: unknown): OpenAIFailure {
  const e = err as
    | { status?: unknown; code?: unknown; name?: unknown }
    | null
    | undefined;
  const upstreamStatus = typeof e?.status === "number" ? e.status : undefined;
  const code = typeof e?.code === "string" ? e.code : undefined;
  const name = typeof e?.name === "string" ? e.name : "";

  const make = (
    kind: Exclude<OpenAIFailureKind, "unknown">,
    status: number
  ): OpenAIFailure => ({
    kind,
    status,
    userMessage: USER_COPY[kind],
    code,
    upstreamStatus,
  });

  if (code === "insufficient_quota") return make("quota", 503);
  if (upstreamStatus === 401) return make("auth", 503);
  if (upstreamStatus === 429) return make("rate_limit", 429);
  if (
    err instanceof OpenAI.APIConnectionError ||
    name === "APIConnectionError" ||
    name === "APIConnectionTimeoutError"
  ) {
    return make("unreachable", 503);
  }
  return { kind: "unknown", status: 500, userMessage: "", code, upstreamStatus };
}

// Tripwire: names the failure server-side. Message is truncated and never
// includes the key (the SDK's messages don't either, but be sure).
export function logOpenAIFailure(
  route: string,
  failure: OpenAIFailure,
  err: unknown
): void {
  const message =
    err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200);
  console.error("[openai-failure]", {
    route,
    kind: failure.kind,
    upstreamStatus: failure.upstreamStatus,
    code: failure.code,
    message,
  });
}

// For a route's outer catch: a Response carrying the honest copy when the
// error is a named service failure, null when it is not (the route then
// keeps its existing "Server error" behavior). `reason` is what the
// clients key on; `error` is what they show.
export function openAIFailureResponse(
  route: string,
  err: unknown
): Response | null {
  const failure = classifyOpenAIError(err);
  if (failure.kind === "unknown") return null;
  logOpenAIFailure(route, failure, err);
  return Response.json(
    { error: failure.userMessage, reason: failure.kind },
    { status: failure.status }
  );
}

// Dev/preview-only simulation so the honest copy can be seen without
// draining an account: REKOMENDR_SIMULATE_OPENAI_FAILURE =
// insufficient_quota | 401 | 429 | unreachable. Ignored on production
// (and the env check names it if it is set there).
export function maybeSimulateOpenAIFailure(): void {
  const raw = process.env.REKOMENDR_SIMULATE_OPENAI_FAILURE;
  if (!raw || isProductionRuntime()) return;
  const v = raw.trim();
  const err = new Error(`simulated OpenAI failure (${v})`) as Error & {
    status?: number;
    code?: string;
  };
  if (v === "insufficient_quota") {
    err.status = 429;
    err.code = "insufficient_quota";
  } else if (v === "401") {
    err.status = 401;
  } else if (v === "429") {
    err.status = 429;
  } else if (v === "unreachable") {
    err.name = "APIConnectionError";
  } else {
    return;
  }
  throw err;
}
