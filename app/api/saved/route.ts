// app/api/saved/route.ts — S17c: the Saved page's two server-side lists
// (docs/s17-mood-first-plan.md). Favorites aren't here: go-tos already
// live in the client's mirror (synced from go_tos on load, S12) and wine's
// one go-to in wine_marks (S8), so the page reads those directly.
//
//   POST { clientId } → { ok, saved: Item[], watched: Item[] }
//   Item = { category: "Movies" | "TV Shows" | "Books" | "Wine", title, year, at }
//
// Read-only, service role, this client's user_likes rows only. Every
// category, grouped under the bar's labels; a row from any other category
// (health, food…) isn't a Saved-page item and is left out.
//
//   saved   = the newest 'save' per title, unless the title has since been
//             watched (it moved tabs) or marked Not for me after the save
//             (a reversal, the Shortlist rule).
//   watched = the newest 'watched' per title.

import type { SupabaseClient } from "@supabase/supabase-js";
import { runEnvCheck } from "../../../src/lib/envCheck";
import { buildSavedLists, type SavedRow } from "../../../src/lib/savedLists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

runEnvCheck();

// Same guarded dynamic import as /api/prefs: supabaseServer throws at
// import time on missing env, so it is never imported statically.
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

// Rows the shelf could ever hold, newest first. 1000 covers a heavy
// tester many times over; the lists are a render, not a guarantee.
const READ_LIMIT = 1000;

const cleanClientId = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return id.length >= 8 && id.length <= 64 ? id : null;
};

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { clientId?: unknown } | null;
  const clientId = cleanClientId(body?.clientId);
  if (!clientId) return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });

  const server = await getServerClient();
  if (!server) {
    console.warn("[saved] read failed", { reason: "supabase_unconfigured" });
    return Response.json({ ok: false, reason: "supabase_unconfigured" });
  }
  const { data, error } = await server
    .from("user_likes")
    .select("category, title, year, action, created_at")
    .eq("client_id", clientId)
    .in("action", ["save", "watched", "dislike"])
    .order("created_at", { ascending: false })
    .limit(READ_LIMIT);
  if (error || !data) {
    console.warn("[saved] read failed", { reason: "db_error", code: (error as { code?: string } | null)?.code ?? null });
    return Response.json({ ok: false, reason: "db_error" });
  }
  return Response.json({ ok: true, ...buildSavedLists(data as SavedRow[]) }, { headers: { "Cache-Control": "no-store" } });
}
