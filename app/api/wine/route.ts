// app/api/wine/route.ts — S8: the person's marks on wines (docs/s8-wine-shelf-plan.md).
//
// One service-role route over public.wine_marks (RLS on, zero client
// policies, anon/authenticated revoked — docs/sql/s8-wine-marks.sql):
//
//   state     → the live favorite (S8b), plus the Bought list and the one
//               follow-up question due on this open (S8c)
//   favorite  → star a wine as the go-to (clears the old star), or un-star
//   bought    → a confirmed haul: one row per bottle, one haul id, the rek
//               that led to each bottle when there was one; answers with a
//               signed "Our haul today" card the Share row can mint (S8c)
//   followup_shown → the question was put on screen: never asked again
//   followup  → the answer (like / dislike / favorite / skipped), once
//
// The client keeps a localStorage mirror for instant UI; this row is what
// survives a cleared browser on the same anonymous id. No OpenAI call
// here, so no api_usage cap: every write is one small bounded row.
// Fail-soft and named: a missing table answers { ok:false,
// reason:"migration_pending" } and logs it.

import type { SupabaseClient } from "@supabase/supabase-js";
import { runEnvCheck } from "../../../src/lib/envCheck";
import { cleanClientId, getSnapshotStore } from "../../../src/lib/anchorSnapshots";
import { signAnchor } from "../../../src/lib/mintToken";

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

// S8c — a bottle bought at least a day ago, never asked about, is due.
const FOLLOWUP_AFTER_MS = 24 * 60 * 60 * 1000;
const HAUL_MAX = 24;
const FOLLOWUPS = new Set(["like", "dislike", "favorite", "skipped"]);
const HAUL_TITLE = "Our haul today";

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
    const bought = await db
      .from("wine_marks")
      .select("id, name, created_at, followup, followup_at, from_rek")
      .eq("client_id", clientId)
      .eq("kind", "bought")
      .order("created_at", { ascending: false })
      .limit(60);
    if (bought.error) return failure("state bought", bought.error);
    const rows = bought.data ?? [];
    // One question per open, oldest first, never one already shown.
    const due = rows
      .filter(
        (r) =>
          r.followup == null &&
          r.followup_at == null &&
          Date.parse(r.created_at) <= Date.now() - FOLLOWUP_AFTER_MS
      )
      .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    const row = fav.data?.[0];
    const favorite: FavoriteRow | null = row
      ? {
          name: row.name,
          description: row.description ?? null,
          dry: row.dry_sweet ?? null,
          body: row.light_bold ?? null,
        }
      : null;
    return Response.json(
      {
        ok: true,
        favorite,
        bought: rows.map((r) => ({
          id: r.id,
          name: r.name,
          at: r.created_at,
          followup: r.followup ?? null,
        })),
        followup: due ? { id: due.id, name: due.name } : null,
      },
      { status: 200 }
    );
  }

  if (action === "bought") {
    const items = (Array.isArray(body?.items) ? body.items : [])
      .map((it: any) => ({
        name: text(it?.name, 120),
        fromRek: text(it?.fromRek, 120),
        fromAnchor: text(it?.fromAnchor, 120),
        price:
          typeof it?.price === "number" && it.price > 0 && it.price < 100000
            ? Math.round(it.price * 100) / 100
            : null,
      }))
      .filter((it: { name: string | null }) => !!it.name)
      .slice(0, HAUL_MAX);
    if (items.length === 0) {
      return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
    }
    const haulId = crypto.randomUUID();
    const ins = await db.from("wine_marks").insert(
      items.map((it: { name: string; fromRek: string | null; fromAnchor: string | null; price: number | null }) => ({
        client_id: clientId,
        kind: "bought",
        name: it.name,
        price: it.price,
        haul_id: haulId,
        from_rek: it.fromRek,
        from_anchor: it.fromRek ? it.fromAnchor : null,
      }))
    );
    if (ins.error) return failure("bought insert", ins.error);
    const conversions = items.filter((it: { fromRek: string | null }) => !!it.fromRek).length;
    console.info("[wine-marks] haul saved", { bottles: items.length, conversions });
    // The haul as a card: signed like any anchor, so Share mints it through
    // /api/save and moderates it at share time like every other card.
    const short = items.map((it: { name: string }) => it.name).join(" · ").slice(0, 600);
    const token = signAnchor({ name: HAUL_TITLE, category: "wine", short, long: null, clientId });
    return Response.json(
      {
        ok: true,
        haulId,
        conversions,
        card: token ? { name: HAUL_TITLE, category: "wine", short, token } : null,
      },
      { status: 200 }
    );
  }

  if (action === "followup_shown" || action === "followup") {
    const id = typeof body?.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null;
    const answer = action === "followup" ? body?.answer : null;
    if (!id || (action === "followup" && !FOLLOWUPS.has(answer))) {
      return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
    }
    // Scoped to this client's own bought row; an answer lands once.
    let q = db
      .from("wine_marks")
      .update(
        action === "followup"
          ? { followup: answer, followup_at: new Date().toISOString() }
          : { followup_at: new Date().toISOString() }
      )
      .eq("id", id)
      .eq("client_id", clientId)
      .eq("kind", "bought")
      .is("followup", null);
    if (action === "followup_shown") q = q.is("followup_at", null);
    const upd = await q;
    if (upd.error) return failure(action, upd.error);
    console.info("[wine-marks] follow-up", { action, answer: answer ?? null });
    return Response.json({ ok: true }, { status: 200 });
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
