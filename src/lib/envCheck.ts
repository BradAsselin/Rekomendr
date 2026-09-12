// src/lib/envCheck.ts — server-only.
//
// One boot-time check for every Supabase / OpenAI env pair. On Vercel a
// serverless function's module load IS boot, so every server route calls
// runEnvCheck() at module level; a global flag makes it log exactly once
// per process. It replaces the two hand-copied URL-mismatch blocks that
// used to live in /api/prefs and /api/auth/merge (same output, more pairs).
//
// Logs hostnames and project refs only — never a key, never a token.
// The two-project split this catches hid dislike shading until 2026-07-19.

declare global {
  // eslint-disable-next-line no-var
  var __rekomendrEnvProblems: string[] | undefined;
}

// Preview deployments build with NODE_ENV=production, so "production" here
// means the production deployment specifically; locally it falls back to
// NODE_ENV. Dev-only diagnostics (prompt-diag, failure simulation) key off
// this so Brad's preview shows them and production never does.
export function isProductionRuntime(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv) return vercelEnv === "production";
  return process.env.NODE_ENV === "production";
}

export const safeHost = (u: string | undefined): string | null => {
  if (!u) return null;
  try {
    return new URL(u).host;
  } catch {
    return "(unparseable URL)";
  }
};

// Supabase project ref from a hostname: `<ref>.supabase.co`.
const refFromHost = (host: string | null): string | null =>
  host && host.endsWith(".supabase.co") ? host.split(".")[0] : null;

// Supabase's legacy anon/service keys are JWTs whose payload carries the
// project ref. The newer `sb_publishable_…` / `sb_secret_…` keys are not
// JWTs — for those the ref check is skipped, never failed.
const refFromJwt = (key: string | undefined): string | null => {
  if (!key) return null;
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(
      parts[1].replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("utf8");
    const payload = JSON.parse(json);
    return typeof payload?.ref === "string" ? payload.ref : null;
  } catch {
    return null;
  }
};

const stripSlash = (u: string) => u.replace(/\/+$/, "");

function collectProblems(): string[] {
  const problems: string[] = [];

  const serverUrl = process.env.SUPABASE_URL;
  const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!serverUrl)
    problems.push(
      "SUPABASE_URL missing — service-role routes (prefs, merge, shading, health) run unconfigured"
    );
  if (!serviceKey)
    problems.push(
      "SUPABASE_SERVICE_ROLE_KEY missing — service-role routes run unconfigured"
    );
  if (!publicUrl)
    problems.push(
      "NEXT_PUBLIC_SUPABASE_URL missing — browser writes (likes, signals) have no project"
    );
  if (!anonKey)
    problems.push(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY missing — browser writes (likes, signals) have no key"
    );
  if (!openaiKey)
    problems.push(
      "OPENAI_API_KEY missing — every generation route will fail with auth"
    );

  if (serverUrl && publicUrl && stripSlash(serverUrl) !== stripSlash(publicUrl)) {
    problems.push(
      `SUPABASE_URL and NEXT_PUBLIC_SUPABASE_URL differ (${safeHost(
        serverUrl
      )} vs ${safeHost(
        publicUrl
      )}) — server reads, token verification, and shading hit the wrong project`
    );
  }

  const serverRef = refFromHost(safeHost(serverUrl));
  const publicRef = refFromHost(safeHost(publicUrl));
  const serviceRef = refFromJwt(serviceKey);
  const anonRef = refFromJwt(anonKey);

  if (serverRef && serviceRef && serverRef !== serviceRef) {
    problems.push(
      `SUPABASE_SERVICE_ROLE_KEY belongs to project ${serviceRef} but SUPABASE_URL is ${serverRef} — service-role calls will be refused`
    );
  }
  if (publicRef && anonRef && publicRef !== anonRef) {
    problems.push(
      `NEXT_PUBLIC_SUPABASE_ANON_KEY belongs to project ${anonRef} but NEXT_PUBLIC_SUPABASE_URL is ${publicRef} — browser writes will be refused`
    );
  }

  if (process.env.REKOMENDR_SIMULATE_OPENAI_FAILURE && isProductionRuntime()) {
    problems.push(
      "REKOMENDR_SIMULATE_OPENAI_FAILURE is set on the production deployment — it is ignored there, unset it"
    );
  }

  return problems;
}

// Runs once per server process; returns the same problem list every call.
export function runEnvCheck(): string[] {
  if (globalThis.__rekomendrEnvProblems) return globalThis.__rekomendrEnvProblems;
  const problems = collectProblems();
  globalThis.__rekomendrEnvProblems = problems;

  if (problems.length === 0) {
    console.log("[env-check] ok", {
      supabase: safeHost(process.env.SUPABASE_URL),
      openaiKey: process.env.OPENAI_API_KEY ? "present" : "missing",
      runtime: isProductionRuntime() ? "production" : "non-production",
    });
  } else {
    for (const p of problems) console.warn("[env-check]", p);
  }
  return problems;
}
