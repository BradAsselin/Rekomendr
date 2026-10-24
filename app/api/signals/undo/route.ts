// app/api/signals/undo/route.ts — S17: the Undo in "Not for me · Undo"
// and "Saved · Undo", and the Saved page's remove.
//
// Scope, deliberately as narrow as S16's watched route:
//   - action is FIXED to 'dislike' or 'save' — nothing else can be undone
//     here (watched has its own route; likes have no undo);
//   - only THIS client's rows;
//   - an Undo deletes the client's NEWEST row of that action for that
//     title, and only if it is under ten minutes old (a toast lives four
//     seconds; ten minutes is slack for a slow write, never a way to edit
//     history);
//   - remove: true (save only — the Saved page) deletes every save row of
//     that title for this client: it leaves the list for good.
//
// Why server-side: the browser can only INSERT into user_likes (S2a: anon
// SELECT dropped, no anon DELETE). The service role does the delete, keyed
// to the client id the browser already sends with every signal.

import type { SupabaseClient } from "@supabase/supabase-js";
import { runEnvCheck } from "../../../../src/lib/envCheck";

export const runtime = "nodejs";

runEnvCheck();

// Same guarded dynamic import as /api/signals/watched: supabaseServer
// throws at import time on missing env, so it is never imported statically.
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

const ACTIONS = new Set(["dislike", "save"]);
const UNDO_WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const clientId = cleanClientId(body?.clientId);
  const category = cleanText(body?.category, 100);
  const title = cleanText(body?.title, 300);
  const action = typeof body?.action === "string" && ACTIONS.has(body.action) ? body.action : null;
  const remove = body?.remove === true;
  if (!clientId || !category || !title || !action || (remove && action !== "save")) {
    return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  const server = await getServerClient();
  if (!server) {
    console.warn("[signal-undo] failed", { reason: "supabase_unconfigured" });
    return Response.json({ ok: false, reason: "supabase_unconfigured" });
  }

  // Category is matched case-insensitively (the Movies/movies gap,
  // watch-bank): the same title saved under either spelling is one item.
  let q = server
    .from("user_likes")
    .select("id, created_at")
    .eq("client_id", clientId)
    .ilike("category", category)
    .eq("title", title)
    .eq("action", action)
    .order("created_at", { ascending: false });
  if (!remove) q = q.gte("created_at", new Date(Date.now() - UNDO_WINDOW_MS).toISOString());
  const found = await q.limit(remove ? 200 : 1);
  if (found.error) {
    console.warn("[signal-undo] read failed", { action, code: (found.error as { code?: string }).code });
    return Response.json({ ok: false, reason: "read_error" });
  }
  const ids = (found.data ?? []).map((r: { id: unknown }) => r.id).filter((x) => x != null);
  if (ids.length === 0) {
    // Named, not an error: the mark never landed (or is too old to undo).
    console.info("[signal-undo] nothing to undo", { action, remove });
    return Response.json({ ok: true, removed: 0 });
  }
  const del = await server.from("user_likes").delete().eq("client_id", clientId).in("id", ids).select("id");
  if (del.error) {
    console.warn("[signal-undo] delete failed", { action, code: (del.error as { code?: string }).code });
    return Response.json({ ok: false, reason: "delete_error" });
  }
  const removed = Array.isArray(del.data) ? del.data.length : 0;
  console.info("[signal-undo] ok", { action, remove, removed });
  return Response.json({ ok: true, removed });
}
