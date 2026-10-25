// src/lib/cardEvents.ts — server-only. S4: the test's instrument.
//
// The test (docs/s4-s5-build-plan.md): snap → share → done, measured by
// receivers who go on to send a card of their own. Every event is one row
// in public.card_events (RLS on, zero client policies, service role only):
// anon ids and card ids, nothing personal.
//
//   sent        — the sender handed a card to the share sheet. Owner only.
//                 On a client's FIRST own share, `via_card` names the card
//                 that brought them in: the first card they opened that
//                 someone else sent. That row IS the primary metric.
//   open        — a person (not a link scraper: those don't run scripts)
//                 opened a card. `is_sender` (their own card), `first_open`
//                 (vs reopen), `since_send_s` (reopen-rate denominator).
//   tap_watch / tap_trailer / tap_buy — the one-tap actions.
//   save / standalone_launch — S4b (the bridge into the app).
//
// Failure never reaches the person: every refusal or write miss is a
// named `[card-event]` line (§2.4), and the caller always answers 204.
if (typeof window !== "undefined") {
  throw new Error("cardEvents.ts was imported in a browser bundle.");
}
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cleanClientId,
  cleanSnapshotId,
  getSnapshotStore,
  loadPublicSnapshot,
  reasonForDbError,
} from "./anchorSnapshots";

export const CARD_EVENT_KINDS = [
  "sent",
  "open",
  "tap_watch",
  "tap_trailer",
  "tap_buy",
  "save",
  "standalone_launch",
] as const;
export type CardEventKind = (typeof CARD_EVENT_KINDS)[number];

// Loop-bounding, not a quota: a person opening and tapping cards all day
// stays far under it; a scripted client stops inflating the readout.
export const EVENT_CAP_PER_DAY = 300;

export type CardEventResult =
  | { ok: true; kind: CardEventKind; detail: Record<string, unknown> }
  | { ok: false; reason: string };

const notRecorded = (kind: string, reason: string, detail?: Record<string, unknown>): CardEventResult => {
  console.warn("[card-event] not recorded", { kind, reason, ...detail });
  return { ok: false, reason };
};

export async function recordCardEvent(
  input: { kind: unknown; card?: unknown; clientId: unknown },
  opts: { store?: SupabaseClient | null; now?: number } = {}
): Promise<CardEventResult> {
  const kind = CARD_EVENT_KINDS.includes(input.kind as CardEventKind)
    ? (input.kind as CardEventKind)
    : null;
  const clientId = cleanClientId(input.clientId);
  if (!kind || !clientId) return notRecorded(String(input.kind), "bad_request");
  const cardId = kind === "standalone_launch" ? null : cleanSnapshotId(input.card);
  if (kind !== "standalone_launch" && !cardId) return notRecorded(kind, "bad_card");

  const store = opts.store !== undefined ? opts.store : await getSnapshotStore();
  if (!store) return notRecorded(kind, "supabase_unconfigured");
  const now = opts.now ?? Date.now();

  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const recent = await store
    .from("card_events")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .gte("created_at", dayAgo);
  if (recent.error) return notRecorded(kind, reasonForDbError(recent.error), { code: recent.error.code });
  if ((recent.count ?? 0) >= EVENT_CAP_PER_DAY) return notRecorded(kind, "cap", { cap: EVENT_CAP_PER_DAY });

  const row: Record<string, unknown> = { card_id: cardId, client_id: clientId, kind };

  if (cardId) {
    // Only a PUBLIC card can carry events (shared, not revoked, not
    // health) — the same single read the page itself uses.
    const card = await loadPublicSnapshot(cardId);
    if (!card) return notRecorded(kind, "card_not_public", { card: cardId });

    if (kind === "sent") {
      if (card.client_id !== clientId) return notRecorded(kind, "not_owner", { card: cardId });
      const prior = await store
        .from("card_events")
        .select("id")
        .eq("client_id", clientId)
        .eq("kind", "sent")
        .limit(1);
      if (prior.error) return notRecorded(kind, reasonForDbError(prior.error), { code: prior.error.code });
      if ((prior.data ?? []).length === 0) {
        const entry = await store
          .from("card_events")
          .select("card_id")
          .eq("client_id", clientId)
          .eq("kind", "open")
          .eq("is_sender", false)
          .order("created_at", { ascending: true })
          .limit(1);
        if (entry.error) return notRecorded(kind, reasonForDbError(entry.error), { code: entry.error.code });
        const via = (entry.data ?? [])[0]?.card_id ?? null;
        if (via) row.via_card = via;
      }
    }

    if (kind === "open") {
      const isSender = card.client_id === clientId;
      const seen = await store
        .from("card_events")
        .select("id")
        .eq("client_id", clientId)
        .eq("card_id", cardId)
        .eq("kind", "open")
        .limit(1);
      if (seen.error) return notRecorded(kind, reasonForDbError(seen.error), { code: seen.error.code });
      const sharedAt = card.shared_at ? Date.parse(card.shared_at) : NaN;
      row.is_sender = isSender;
      row.first_open = (seen.data ?? []).length === 0;
      row.since_send_s = Number.isFinite(sharedAt)
        ? Math.max(0, Math.min(2_000_000_000, Math.round((now - sharedAt) / 1000)))
        : null;
    }
  }

  const ins = await store.from("card_events").insert(row);
  if (ins.error) return notRecorded(kind, reasonForDbError(ins.error), { code: ins.error.code });

  const detail: Record<string, unknown> = { card: cardId };
  if (kind === "open") Object.assign(detail, { isSender: row.is_sender, firstOpen: row.first_open, sinceSendS: row.since_send_s });
  if (kind === "sent") Object.assign(detail, { firstOwnShareVia: row.via_card ?? null });
  console.info(`[card-event] ${kind}`, detail);
  return { ok: true, kind, detail };
}
