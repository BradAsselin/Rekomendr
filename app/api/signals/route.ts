// app/api/signals/route.ts
// S23 — the browser's like and snap-signal writes, moved server-side so
// anon and authenticated can lose every privilege on user_likes and
// reksnap_signals (docs/sql/s23-grants-tighten.sql). Until S23, recordLike
// and recordSnapSignal inserted straight from the browser with the anon
// key; the RLS insert policies were the only fence.
//
// Same gates as every other client route: capGate (client-id check + the
// daily cap, key "signals") and fixed allow-lists that mirror the tables'
// CHECK constraints. 'watched' keeps its own route (/api/signals/watched)
// and its undo; undo of like/dislike/save stays /api/signals/undo.
//
// Body: { clientId, kind: "like", category, title, year?, action }
//    or { clientId, kind: "snap", itemName, itemCategory, action,
//         flipToMode?, chainDepth?, chainOrigin? }

import { runEnvCheck } from "../../../src/lib/envCheck";
import { capGate } from "../../../src/lib/apiUsage";
import { cleanClientId, getSnapshotStore } from "../../../src/lib/anchorSnapshots";
import { logDbError } from "../../../src/lib/dbError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

runEnvCheck();

// user_likes_action_check minus 'watched' (its own route).
const LIKE_ACTIONS = new Set(["like", "dislike", "save", "more_like_this"]);
// reksnap_signals_action_check.
const SNAP_ACTIONS = new Set(["like", "dislike", "save", "context_flip", "detail_expand", "chain", "anchor_reroll"]);
const SNAP_MODES = new Set(["similar", "uses", "alternatives"]);
const CHAIN_ORIGINS = new Set(["frontier", "trail"]);

const text = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() && v.trim().length <= max ? v.trim() : null;

const bad = () => Response.json({ ok: false, reason: "bad_request" }, { status: 400 });

export async function POST(req: Request): Promise<Response> {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return bad();
  }

  const capped = await capGate(body?.clientId, "signals");
  if (capped) return capped;
  const clientId = cleanClientId(body?.clientId);
  if (!clientId) return bad();

  let table: "user_likes" | "reksnap_signals";
  let row: Record<string, unknown>;
  if (body?.kind === "like") {
    const category = text(body.category, 100);
    const title = text(body.title, 300);
    const action = typeof body.action === "string" && LIKE_ACTIONS.has(body.action) ? body.action : null;
    if (!category || !title || !action) return bad();
    const y = body.year;
    const year = typeof y === "number" && Number.isInteger(y) && y >= 1870 && y <= 2100 ? y : null;
    table = "user_likes";
    row = { client_id: clientId, category, title, year, action };
  } else if (body?.kind === "snap") {
    const itemName = text(body.itemName, 300);
    const itemCategory = text(body.itemCategory, 100);
    const action = typeof body.action === "string" && SNAP_ACTIONS.has(body.action) ? body.action : null;
    if (!itemName || !itemCategory || !action) return bad();
    // Nullable columns: NULL except for the action that owns each.
    const flip = action === "context_flip" && SNAP_MODES.has(body.flipToMode) ? body.flipToMode : null;
    const d = body.chainDepth;
    const chainDepth = action === "chain" && Number.isInteger(d) && d >= 1 && d <= 1000 ? d : null;
    const chainOrigin = action === "chain" && CHAIN_ORIGINS.has(body.chainOrigin) ? body.chainOrigin : null;
    table = "reksnap_signals";
    row = {
      client_id: clientId,
      item_name: itemName,
      item_category: itemCategory,
      source: "reksnap",
      action,
      flip_to_mode: flip,
      chain_depth: chainDepth,
      chain_origin: chainOrigin,
    };
  } else {
    return bad();
  }

  const store = await getSnapshotStore();
  if (!store) {
    console.warn("[signals] write refused", { reason: "supabase_unconfigured" });
    return Response.json({ ok: false, reason: "supabase_unconfigured" }, { status: 200 });
  }
  const { error } = await store.from(table).insert(row);
  if (error) {
    const reason = logDbError(`signals ${body.kind} insert`, error, { action: row.action });
    return Response.json({ ok: false, reason }, { status: 200 });
  }
  console.info("[signals] ok", { kind: body.kind, action: row.action });
  return Response.json({ ok: true }, { status: 200 });
}
