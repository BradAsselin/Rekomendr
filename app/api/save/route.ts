// app/api/save/route.ts
// S2 — the MINT (build plan S3.3, Decision Ledger #18/#19).
//
// Fired fire-and-forget by the snap lane when the user saves the ANCHOR.
// It writes one PRIVATE row to anchor_snapshots (shared_at NULL) holding
// exactly what the user was shown: name, category, short, the long tier
// if they opened it, and the mode. "The saved thing must be rich on
// return — that is the product."
//
// The order is the design:
//   1. shapes + lengths (the schema's own caps, refused before Postgres)
//   2. feature off (no MINT_SIGNING_SECRET) → { ok:false, reason:"disabled" }
//   3. the token — REQUIRED, no tokenless grace. Only text this server
//      generated for this client can be minted, never arbitrary text.
//   4. health wall (twin #2) on the token-attested category → 403
//   5. per-client cap, 30/day (decided call)
//   6. 24h dedupe on (client, name, category) — save → unsave → save
//      returns the same row instead of minting a second one
//   7. insert, private
// A failure is never an error the user sees: the save gesture already
// happened client-side and stands. Every refusal is a named log line.

import { runEnvCheck } from "../../../src/lib/envCheck";
import { tokensEnabled, verifyAnchor } from "../../../src/lib/mintToken";
import {
  LIMITS,
  MINT_CAP_PER_DAY,
  SNAPSHOT_MODES,
  cleanClientId,
  getSnapshotStore,
  isHealthCategory,
  reasonForDbError,
  type SnapshotMode,
} from "../../../src/lib/anchorSnapshots";

export const runtime = "nodejs";

runEnvCheck();

const refuse = (reason: string, status = 200, detail?: Record<string, unknown>) => {
  console.warn("[snapshot] mint refused", { reason, ...detail });
  return Response.json({ ok: false, reason }, { status });
};

const text = (raw: unknown, max: number, allowEmpty = false): string | null => {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!allowEmpty && v.length === 0) return null;
  return v.length <= max ? v : null;
};

export async function POST(req: Request): Promise<Response> {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  const clientId = cleanClientId(body?.clientId);
  const p = body?.payload ?? {};
  const name = text(p.name, LIMITS.name);
  const category = text(p.category, LIMITS.category);
  // The vision model may return an empty description; the column allows
  // it, and the token covers the empty string exactly as shipped.
  const short = text(p.short, LIMITS.short, true);
  const long = p.long == null ? null : text(p.long, LIMITS.long);
  const mode = SNAPSHOT_MODES.includes(p.mode) ? (p.mode as SnapshotMode) : null;

  if (!clientId || !name || !category || short === null || !mode || (p.long != null && !long)) {
    return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  if (!tokensEnabled()) {
    // Feature off. The client doesn't call without a token, so reaching
    // here means a stale bundle or a probe — worth one quiet line.
    return refuse("disabled");
  }

  // The token must cover EXACTLY what is being minted: a short-only token
  // mints short-only, and the long rides only with the extended token the
  // anchor-detail response signed over it.
  // Verified over the RAW strings exactly as the server signed them (a
  // model-generated name can carry stray whitespace); stored trimmed.
  const attested = verifyAnchor(
    {
      name: p.name,
      category: p.category,
      short: p.short,
      long: p.long == null ? null : p.long,
      clientId,
    },
    body?.token
  );
  if (!attested) {
    return refuse("token_invalid", 400, { hasToken: !!body?.token, withLong: !!long });
  }

  // Health wall, twin #2. The category is MAC-verified above, so this is a
  // server-attested fact, not client input.
  if (isHealthCategory(category)) {
    return refuse("health", 403);
  }

  const store = await getSnapshotStore();
  if (!store) return refuse("supabase_unconfigured");

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const categoryKey = category.toLowerCase();

  // Dedupe BEFORE the cap: re-saving the same anchor is not a new mint and
  // must never be the thing that trips the cap.
  const existing = await store
    .from("anchor_snapshots")
    .select("id, long_description")
    .eq("client_id", clientId)
    .eq("item_name", name)
    .eq("item_category", categoryKey)
    .gte("created_at", dayAgo)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) {
    return refuse(reasonForDbError(existing.error), 200, { code: existing.error.code });
  }
  if (existing.data) {
    // The user opened the long tier between two saves: the row gets richer,
    // never poorer. Idempotent on the IS NULL guard.
    if (long && !existing.data.long_description) {
      await store
        .from("anchor_snapshots")
        .update({ long_description: long })
        .eq("id", existing.data.id)
        .is("long_description", null);
    }
    return Response.json({ ok: true, id: existing.data.id }, { status: 200 });
  }

  const count = await store
    .from("anchor_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .gte("created_at", dayAgo);
  if (count.error) {
    return refuse(reasonForDbError(count.error), 200, { code: count.error.code });
  }
  if ((count.count ?? 0) >= MINT_CAP_PER_DAY) {
    return refuse("cap", 200, { cap: MINT_CAP_PER_DAY });
  }

  const inserted = await store
    .from("anchor_snapshots")
    .insert({
      client_id: clientId,
      item_name: name,
      item_category: categoryKey,
      short_description: short,
      long_description: long,
      mode,
    })
    .select("id")
    .single();
  if (inserted.error || !inserted.data) {
    return refuse(reasonForDbError(inserted.error), 200, { code: inserted.error?.code });
  }

  console.info("[snapshot] minted", { withLong: !!long, mode });
  return Response.json({ ok: true, id: inserted.data.id }, { status: 200 });
}
