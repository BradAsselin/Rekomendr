// app/api/auth/merge/route.ts
// S2b identity merge: attach this device's anonymous client_id to the
// verified authenticated user. Service-role write to account_devices —
// the browser has no write path to that table at all.
//
// Trust ceiling, on the record: the JWT proves WHO the user is; nothing
// can prove the client_id is THEIRS (it was always a self-asserted
// localStorage string). ON CONFLICT (client_id) DO NOTHING bounds a
// hostile claim to first-writer-wins, and the uniform { ok: true }
// response never reveals whether an id was already claimed.

import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Boot-time sanity check (server log only, hostnames only — never keys or
// tokens): the browser's session tokens are minted by the project at
// NEXT_PUBLIC_SUPABASE_URL, but this route verifies them against
// SUPABASE_URL. If those name different projects, every getUser call fails
// signature verification and this route 401s uniformly.
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
      "[merge] SUPABASE_URL and NEXT_PUBLIC_SUPABASE_URL differ — token verification will fail:",
      safeHost(serverUrl),
      "vs",
      safeHost(publicUrl)
    );
  }
}

// Same guarded dynamic import as the shading reader (supabaseServer throws
// at import time on missing env, so it is never imported statically): a
// missing secret disables merging — it can never 500 sign-in.
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

// Mirrors cleanClientId in the reksnap route (and the with_check on the
// signal tables): junk means no merge, not an error page.
const cleanClientId = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return id.length >= 8 && id.length <= 64 ? id : null;
};

export async function POST(req: Request): Promise<Response> {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const clientId = cleanClientId((body as { clientId?: unknown })?.clientId);
  if (!clientId) {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) {
    // Reason logs are server-side only — the response body stays a bare
    // 401 in every case (no probe oracle, no leaked detail).
    console.warn("[merge] 401: no bearer token in request");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const server = await getServerClient();
  if (!server) {
    // Fail-soft: no secret on this deployment — sign-in proceeds unmerged;
    // the client retries on the next auth event or page load.
    return Response.json({ ok: false }, { status: 200 });
  }

  const { data: userData, error: userError } = await server.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userError || !userId) {
    console.warn(
      "[merge] 401: getUser rejected:",
      userError?.message ?? "(no error, but no user in response)",
      "status:",
      userError?.status ?? "(none)",
      "tokenLength:",
      token.length
    );
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await server.from("account_devices").upsert(
    { user_id: userId, client_id: clientId },
    { onConflict: "client_id", ignoreDuplicates: true }
  );

  if (error) {
    console.warn("[merge] insert failed:", error.message);
    return Response.json({ ok: false }, { status: 200 });
  }

  // Uniform success — deliberately identical whether a row was written,
  // this device was already merged, or another account owns the id.
  return Response.json({ ok: true }, { status: 200 });
}
