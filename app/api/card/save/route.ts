// app/api/card/save/route.ts
// S4b — Save, the bridge: a receiver keeps someone's card with one tap, no
// sign-in, under their anonymous id. The card's text is already the
// server's own (it was attested when the sender minted it), so the save is
// a server-side COPY of that public row into a private row of the
// receiver's — the same "the snapshot is the save" shape as /api/save, and
// the row the app then opens as the anchor (and can share as their own).
//
//   1. the card must be public (shared, not revoked, not health)
//   2. the sender saving their own card → nothing to copy, ok
//   3. dedupe: this client already holds this title → that row
//   4. the per-client mint cap (30/day, shared with /api/save)
//   5. insert the private copy; record the 'save' event
// Returns { ok, id, claim } — `claim` is the signed hand-off the iOS
// home-screen app redeems on first launch (src/lib/claimToken.ts).

import { runEnvCheck } from "../../../../src/lib/envCheck";
import {
  MINT_CAP_PER_DAY,
  cleanClientId,
  cleanSnapshotId,
  getSnapshotStore,
  loadPublicSnapshot,
  reasonForDbError,
} from "../../../../src/lib/anchorSnapshots";
import { recordCardEvent } from "../../../../src/lib/cardEvents";
import { signClaim } from "../../../../src/lib/claimToken";

export const runtime = "nodejs";

runEnvCheck();

const refuse = (reason: string, detail?: Record<string, unknown>) => {
  console.warn("[card-save] refused", { reason, ...detail });
  return Response.json({ ok: false, reason }, { status: 200 });
};

export async function POST(req: Request): Promise<Response> {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const clientId = cleanClientId(body?.clientId);
  const cardId = cleanSnapshotId(body?.card);
  if (!clientId || !cardId) return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });

  const card = await loadPublicSnapshot(cardId);
  if (!card) return refuse("card_not_public", { card: cardId });
  const store = await getSnapshotStore();
  if (!store) return refuse("supabase_unconfigured");
  const claim = signClaim(clientId, cardId);

  if (card.client_id === clientId) {
    return Response.json({ ok: true, id: card.id, own: true, claim });
  }

  const existing = await store
    .from("anchor_snapshots")
    .select("id")
    .eq("client_id", clientId)
    .eq("item_name", card.item_name)
    .eq("item_category", card.item_category)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) return refuse(reasonForDbError(existing.error), { code: existing.error.code });
  if (existing.data) {
    return Response.json({ ok: true, id: (existing.data as { id: string }).id, already: true, claim });
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const count = await store
    .from("anchor_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .gte("created_at", dayAgo);
  if (count.error) return refuse(reasonForDbError(count.error), { code: count.error.code });
  if ((count.count ?? 0) >= MINT_CAP_PER_DAY) return refuse("cap", { cap: MINT_CAP_PER_DAY });

  const inserted = await store
    .from("anchor_snapshots")
    .insert({
      client_id: clientId,
      item_name: card.item_name,
      item_category: card.item_category,
      short_description: card.short_description,
      long_description: card.long_description,
      mode: card.mode,
      media_kind: card.media_kind ?? null,
      media_id: card.media_id ?? null,
      poster_path: card.poster_path ?? null,
      trailer_url: card.trailer_url ?? null,
      providers: card.providers ?? null,
      providers_at: card.providers_at ?? null,
    })
    .select("id")
    .single();
  if (inserted.error || !inserted.data) {
    return refuse(reasonForDbError(inserted.error), { code: inserted.error?.code });
  }

  await recordCardEvent({ kind: "save", card: cardId, clientId });
  console.info("[card-save] saved", { card: cardId });
  return Response.json({ ok: true, id: (inserted.data as { id: string }).id, claim });
}
