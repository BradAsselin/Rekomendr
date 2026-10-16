// app/api/wine/route.ts — S8: the person's marks on wines (docs/s8-wine-shelf-plan.md).
//
// One service-role route over public.wine_marks (RLS on, zero client
// policies, anon/authenticated revoked — docs/sql/s8-wine-marks.sql):
//
//   state     → the live favorite (S8b), plus the Bought list and the one
//               follow-up question due on this open (S8c)
//   favorite  → star a wine as the go-to (clears the old star), or un-star
//
// The client keeps a localStorage mirror for instant UI; this row is what
// survives a cleared browser on the same anonymous id. No OpenAI call
// here, so no api_usage cap: every write is one small bounded row.
// Fail-soft and named: a missing table answers { ok:false,
// reason:"migration_pending" } and logs it.

import type { SupabaseClient } from "@supabase/supabase-js";
import { runEnvCheck } from "../../../src/lib/envCheck";
import { cleanClientId, getSnapshotStore } from "../../../src/lib/anchorSnapshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

runEnvCheck();

const text = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
const taste = (v: unknown): number | null =>
  typeof v === "number" && v >= 1 && v <= 5 ? Math.round(v) : null;

type FavoriteRow = {
  name: string;
  description: string | null;
  dry: number | null;
  body: number | null;
};

const failure = (where: string, error: { code?: string; message?: string }) => {
  const missing =
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /wine_marks/.test(error.message ?? "");
  console.warn(`[wine-marks] ${where} failed`, {
    reason: missing ? "migration_pending" : "db_error",
    code: error.code ?? null,
  });
  return Response.json(
    { ok: false, reason: missing ? "migration_pending" : "db_error" },
    { status: 200 }
  );
};

async function readFavorite(db: SupabaseClient, clientId: string) {
  return db
    .from("wine_marks")
    .select("name, description, dry_sweet, light_bold")
    .eq("client_id", clientId)
    .eq("kind", "favorite")
    .is("cleared_at", null)
    .limit(1);
}

export async function POST(req: Request): Promise<Response> {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const clientId = cleanClientId(body?.clientId);
  const action = body?.action;
  if (!clientId || typeof action !== "string") {
    return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const db = await getSnapshotStore();
  if (!db) {
    console.warn("[wine-marks] unavailable — supabase unconfigured");
    return Response.json({ ok: false, reason: "unavailable" }, { status: 200 });
  }

  if (action === "state") {
    const fav = await readFavorite(db, clientId);
    if (fav.error) return failure("state", fav.error);
    const row = fav.data?.[0];
    const favorite: FavoriteRow | null = row
      ? {
          name: row.name,
          description: row.description ?? null,
          dry: row.dry_sweet ?? null,
          body: row.light_bold ?? null,
        }
      : null;
    return Response.json({ ok: true, favorite }, { status: 200 });
  }

  if (action === "favorite") {
    // Un-star whatever is live first (the unique index allows one live
    // favorite per client); the old row stays, cleared — history, not trash.
    const cleared = await db
      .from("wine_marks")
      .update({ cleared_at: new Date().toISOString() })
      .eq("client_id", clientId)
      .eq("kind", "favorite")
      .is("cleared_at", null);
    if (cleared.error) return failure("favorite clear", cleared.error);
    const name = text(body?.item?.name, 120);
    if (!name) {
      console.info("[wine-marks] favorite cleared");
      return Response.json({ ok: true, favorite: null }, { status: 200 });
    }
    const item = {
      client_id: clientId,
      kind: "favorite",
      name,
      description: text(body?.item?.description, 600),
      dry_sweet: taste(body?.item?.dry),
      light_bold: taste(body?.item?.body),
      price:
        typeof body?.item?.price === "number" && body.item.price > 0 && body.item.price < 100000
          ? Math.round(body.item.price * 100) / 100
          : null,
    };
    const ins = await db.from("wine_marks").insert(item);
    if (ins.error) return failure("favorite insert", ins.error);
    console.info("[wine-marks] favorite set");
    return Response.json(
      {
        ok: true,
        favorite: { name, description: item.description, dry: item.dry_sweet, body: item.light_bold },
      },
      { status: 200 }
    );
  }

  return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
}
