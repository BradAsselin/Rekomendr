// app/api/health/route.ts
// Supabase keep-warm + liveness readout. Free-tier Supabase pauses a
// project after a stretch of inactivity; one cheap read a day defuses it.
// vercel.json schedules this route (production deployments only — Vercel
// cron never fires on previews) and an external ping may hit it too.
//
// Open by design: one service-role read of one row, nothing returned but
// status and timing. Never a crash — a missing secret is a named 503.

import type { SupabaseClient } from "@supabase/supabase-js";
import { runEnvCheck } from "../../../src/lib/envCheck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const envProblems = runEnvCheck();

// Same guarded dynamic import as the other server routes (supabaseServer
// throws at import time on missing env, so it is never imported statically).
let serverClientPromise: Promise<SupabaseClient | null> | null = null;
const getServerClient = (): Promise<SupabaseClient | null> => {
  if (!serverClientPromise) {
    serverClientPromise =
      process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
        ? import("../../../src/lib/supabaseServer")
            .then((m) => m.supabaseServer)
            .catch(() => null)
        : Promise.resolve(null);
  }
  return serverClientPromise;
};

const json = (body: Record<string, unknown>, status: number) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

export async function GET() {
  const at = new Date().toISOString();
  const env = envProblems.length ? "warn" : "ok";
  const started = Date.now();

  const client = await getServerClient();
  if (!client) {
    console.error(
      "[health] db unconfigured — SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing or client failed to load"
    );
    return json({ ok: false, db: "unconfigured", env, envProblems, at }, 503);
  }

  const { error } = await client
    .from("user_likes")
    .select("client_id")
    .limit(1);
  const latencyMs = Date.now() - started;

  if (error) {
    console.error("[health] db error", {
      code: error.code,
      message: error.message,
      latencyMs,
    });
    return json(
      {
        ok: false,
        db: "error",
        error: error.message,
        latencyMs,
        env,
        envProblems,
        at,
      },
      503
    );
  }

  return json({ ok: true, db: "ok", latencyMs, env, envProblems, at }, 200);
}
