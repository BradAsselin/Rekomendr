// app/api/signals/watched/route.ts
// S1 — the 'watched' signal's one write site.
//
// Why a route at all, when every other user_likes write is a browser-side
// anon insert (recordLike)? Because this is the session's one NEW
// fail-soft path, and charter §2.4 requires a server-side tripwire that
// NAMES the failure. The failure that matters here is specific and
// expected: user_likes.action carries a CHECK constraint, so every
// 'watched' insert is rejected until Brad runs
// docs/sql/s1-watched-signal.sql. A browser-side insert would swallow
// that (recordLike ignores its error), and "Watched it" would look like
// it worked while nothing persisted. This route recognises the
// constraint violation by its Postgres code and logs it as
// `migration_pending` — so the pre-migration window is a named log line
// and an honest "not saved yet" on screen, never a silent lie.
//
// Scope: the action is FIXED to 'watched'. This is not a general signal
// endpoint and must not grow into one — every other action keeps its
// existing browser write path.

import type { SupabaseClient } from "@supabase/supabase-js";
import { runEnvCheck } from "../../../../src/lib/envCheck";

export const runtime = "nodejs";

runEnvCheck();

// Same guarded dynamic import as /api/prefs and the merge route:
// supabaseServer throws at import time on missing env, so it is never
// imported statically — a missing secret is a named, non-OK answer, never
// a 500.
let serverClientPromise: Promise<SupabaseClient | null> | null = null;
const getServerClient = (): Promise<SupabaseClient | null> => {
  if (!serverClientPromise) {
    serverClientPromise =
      process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
        ? import("../../../../src/lib/supabaseServer")
            .then((m) => m.supabaseServer)
            .catch(() => null)
        : Promise.resolve(null);
  }
  return serverClientPromise;
};

const cleanClientId = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return id.length >= 8 && id.length <= 64 ? id : null;
};

const cleanText = (raw: unknown, max: number): string | null => {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  return v.length >= 1 && v.length <= max ? v : null;
};

// Postgres check_violation. This is the pre-migration signature, and the
// whole reason this write is server-side.
const CHECK_VIOLATION = "23514";

const fail = (reason: string, status = 200) => {
  console.warn("[watched-signal] write failed", { reason });
  return Response.json({ ok: false, reason }, { status });
};

export async function POST(req: Request): Promise<Response> {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  const clientId = cleanClientId((body as { clientId?: unknown })?.clientId);
  const category = cleanText((body as { category?: unknown })?.category, 100);
  const title = cleanText((body as { title?: unknown })?.title, 300);
  const rawYear = (body as { year?: unknown })?.year;
  const year =
    typeof rawYear === "number" && Number.isFinite(rawYear) && rawYear >= 1900 && rawYear <= 2100
      ? Math.round(rawYear)
      : null;

  if (!clientId || !category || !title) {
    return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  const server = await getServerClient();
  if (!server) return fail("supabase_unconfigured");

  const { error } = await server.from("user_likes").insert({
    client_id: clientId,
    category,
    title,
    year,
    action: "watched",
  });

  if (error) {
    // The one failure we can name precisely: the CHECK constraint has not
    // been widened yet. Everything else is reported with its own message
    // so the log says what actually went wrong.
    if ((error as { code?: string }).code === CHECK_VIOLATION) {
      console.warn("[watched-signal] write failed", {
        reason: "migration_pending",
        detail:
          "user_likes.action rejects 'watched' — run docs/sql/s1-watched-signal.sql",
      });
      return Response.json(
        { ok: false, reason: "migration_pending" },
        { status: 200 }
      );
    }
    console.warn("[watched-signal] write failed", {
      reason: "insert_error",
      code: (error as { code?: string }).code,
      message: error.message,
    });
    return Response.json({ ok: false, reason: "insert_error" }, { status: 200 });
  }

  console.info("[watched-signal] ok", { category });
  return Response.json({ ok: true }, { status: 200 });
}
