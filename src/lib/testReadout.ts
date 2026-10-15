// src/lib/testReadout.ts — server-only. S4: the test readout behind
// /api/stats. Same definitions as docs/sql/test-readout.sql (the
// reference); computed here from the raw events because the service-role
// client can read rows but not run SQL. At friends-and-family volume that
// is a few thousand rows (§12.5).
if (typeof window !== "undefined") {
  throw new Error("testReadout.ts was imported in a browser bundle.");
}
import type { SupabaseClient } from "@supabase/supabase-js";

export type EventRow = {
  card_id: string | null;
  client_id: string;
  kind: string;
  is_sender: boolean | null;
  since_send_s: number | null;
  via_card: string | null;
  created_at: string;
};

export type Readout = {
  since: string;
  cards_sent: number;
  sends: number;
  senders: number;
  unique_receivers: number;
  receiver_opens: number;
  late_opens: number;
  reopen_rate_pct: number | null;
  receivers_who_sent: number;
  receiver_to_sender_pct: number | null;
  watch_taps: number;
  trailer_taps: number;
  buy_taps: number;
  saves: number;
  installs: number;
};

const LATE_S = 2 * 86400;
const pct = (n: number, d: number) => (d === 0 ? null : Math.round((1000 * n) / d) / 10);
const isAgent = (id: string) => id.startsWith("anon_agent");

export function computeReadout(rows: EventRow[], since: string): Readout {
  const t0 = Date.parse(since);
  const ev = rows.filter((r) => Date.parse(r.created_at) >= t0 && !isAgent(r.client_id));
  const of = (k: string) => ev.filter((r) => r.kind === k);
  const sent = of("sent");
  const receiverOpens = of("open").filter((r) => r.is_sender === false);
  const receivers = new Set(receiverOpens.map((r) => r.client_id));
  const converted = new Set(sent.filter((r) => r.via_card).map((r) => r.client_id));
  const late = receiverOpens.filter((r) => (r.since_send_s ?? 0) > LATE_S).length;
  return {
    since,
    cards_sent: new Set(sent.map((r) => r.card_id)).size,
    sends: sent.length,
    senders: new Set(sent.map((r) => r.client_id)).size,
    unique_receivers: receivers.size,
    receiver_opens: receiverOpens.length,
    late_opens: late,
    reopen_rate_pct: pct(late, receiverOpens.length),
    receivers_who_sent: converted.size,
    receiver_to_sender_pct: pct(converted.size, receivers.size),
    watch_taps: of("tap_watch").length,
    trailer_taps: of("tap_trailer").length,
    buy_taps: of("tap_buy").length,
    saves: of("save").length,
    installs: new Set(of("standalone_launch").map((r) => r.client_id)).size,
  };
}

export async function loadEvents(store: SupabaseClient, since: string): Promise<EventRow[]> {
  const out: EventRow[] = [];
  const PAGE = 1000;
  for (let from = 0; from < 200_000; from += PAGE) {
    const { data, error } = await store
      .from("card_events")
      .select("card_id, client_id, kind, is_sender, since_send_s, via_card, created_at")
      .gte("created_at", since)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`card_events read failed: ${error.code}`);
    out.push(...((data ?? []) as EventRow[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}
