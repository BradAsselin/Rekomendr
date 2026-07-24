// app/api/prefs/route.ts
// S2b user_likes residual (Option 2): the browser no longer reads
// user_likes directly — taste prefs come through this server route, so
// Block B can drop anon SELECT on user_likes without breaking search.
// Service-role read running exactly the query loadPrefsForCategory ran
// client-side; writes (recordLike) are untouched.

import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Boot-time sanity check (server log only, hostnames only — never keys or
// tokens): likes are WRITTEN by the browser to NEXT_PUBLIC_SUPABASE_URL's
// project, but this route READS via SUPABASE_URL. If those name different
// projects, prefs come back empty from the wrong project's table — the
// same silent split that hid dislike shading until 2026-07-19.
const safeHost = (u: string): string => {
  try {
    return new URL(u).host;
  } catch {
    return "(unparseable URL)";
  }
};
{
  const serverUrl = process.env.SUPABASE_URL;
  const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (
    serverUrl &&
    publicUrl &&
    serverUrl.replace(/\/+$/, "") !== publicUrl.replace(/\/+$/, "")
  ) {
    console.warn(
      "[prefs] SUPABASE_URL and NEXT_PUBLIC_SUPABASE_URL differ — reads will hit the wrong project:",
      safeHost(serverUrl),
      "vs",
      safeHost(publicUrl)
    );
  }
}

// Same guarded dynamic import as the merge route (supabaseServer throws
// at import time on missing env, so it is never imported statically): a
// missing secret means empty prefs — it can never 500 the search flow.
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

// Mirrors cleanClientId in the merge route: junk means no prefs, not an
// error page.
const cleanClientId = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return id.length >= 8 && id.length <= 64 ? id : null;
};

const EMPTY_PREFS = { likedTitles: [] as string[], dislikedTitles: [] as string[] };

export async function POST(req: Request): Promise<Response> {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const clientId = cleanClientId((body as { clientId?: unknown })?.clientId);
  const rawCategory = (body as { category?: unknown })?.category;
  const category = typeof rawCategory === "string" ? rawCategory.trim() : "";
  if (!clientId || !category || category.length > 100) {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  const server = await getServerClient();
  if (!server) {
    return Response.json(EMPTY_PREFS, { status: 200 });
  }

  const { data, error } = await server
    .from("user_likes")
    .select("title, action")
    .eq("client_id", clientId)
    .eq("category", category)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !data) {
    if (error) console.warn("[prefs] read failed:", error.message);
    return Response.json(EMPTY_PREFS, { status: 200 });
  }

  const liked = new Set<string>();
  const disliked = new Set<string>();

  for (const row of data) {
    if (row.action === "like" || row.action === "save" || row.action === "more_like_this") {
      liked.add(row.title);
    } else if (row.action === "dislike") {
      disliked.add(row.title);
    }
  }

  // Rows arrive newest-first (created_at DESC keeps the query on the
  // newest 100); reverse so both arrays read oldest→newest. Consumers
  // index recency from the TAIL — the prompt's "Recent likes" slice(-10),
  // the avoid-list tiering's newest-first reversal, ResultsV4 appending
  // session marks last — so the tail must be the newest.
  return Response.json(
    {
      likedTitles: Array.from(liked).reverse(),
      dislikedTitles: Array.from(disliked).reverse(),
    },
    { status: 200 }
  );
}
