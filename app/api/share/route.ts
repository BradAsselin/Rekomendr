// app/api/share/route.ts
// S2 — the SHARE FLIP + the lazy long completion (build plan S3.4).
//
// Sharing creates no content. It flips shared_at on a row the same client
// already minted at save-tap, which makes exactly that row publicly
// resolvable at /a/{id}. Two actions, one route:
//
//   { action: "share", clientId, id }
//     1. load the row; not this client's, revoked, or nonexistent → one
//        UNIFORM { ok:false, reason:"not_found" } (no probe oracle: a
//        stranger can't tell "exists but not yours" from "never existed")
//     2. health wall, twin #3 → refused
//     3. already shared → ok (idempotent; no cap, no second moderation)
//     4. per-client flip cap, 20/day (decided call)
//     5. moderation (decided Call 2): flagged → refused and LOGGED, the row
//        stays private; moderation outage → refused and LOGGED. Sharing
//        degrades, saves never do. Never silently.
//     6. shared_at = now() WHERE shared_at IS NULL
//
//   { action: "complete", clientId, id }
//     The owner's client fires this right after a successful share when
//     the row has no long tier. It runs the generation inside its OWN
//     request — an un-awaited promise after a response can be frozen by
//     the serverless runtime, so "fire and forget" is done by the client,
//     not here. Generation only ever follows an owner's action.
//
// The client builds the URL itself (window.location.origin + /a/{id}), so
// a preview shares a preview link and production shares a production one.

import OpenAI from "openai";
import { runEnvCheck } from "../../../src/lib/envCheck";
import {
  FLIP_CAP_PER_DAY,
  cleanClientId,
  cleanSnapshotId,
  getSnapshotStore,
  isHealthCategory,
  reasonForDbError,
  type SnapshotRow,
} from "../../../src/lib/anchorSnapshots";
import { completeLongIfMissing } from "../../../src/lib/anchorCompletion";

export const runtime = "nodejs";

runEnvCheck();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const refuse = (
  action: string,
  reason: string,
  detail?: Record<string, unknown>
) => {
  console.warn(`[share] ${action} refused`, { reason, ...detail });
  return Response.json({ ok: false, reason }, { status: 200 });
};

type Row = Pick<
  SnapshotRow,
  | "id"
  | "client_id"
  | "item_name"
  | "item_category"
  | "short_description"
  | "long_description"
  | "shared_at"
  | "revoked_at"
>;

export async function POST(req: Request): Promise<Response> {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const action = body?.action === "complete" ? "complete" : "share";
  const clientId = cleanClientId(body?.clientId);
  const id = cleanSnapshotId(body?.id);
  // A malformed id answers exactly like a missing one.
  if (!clientId || !id) return refuse(action, "not_found", { malformed: true });

  const store = await getSnapshotStore();
  if (!store) return refuse(action, "unavailable", { detail: "supabase_unconfigured" });

  const loaded = await store
    .from("anchor_snapshots")
    .select(
      "id, client_id, item_name, item_category, short_description, long_description, shared_at, revoked_at"
    )
    .eq("id", id)
    .limit(1)
    .maybeSingle();
  if (loaded.error) {
    return refuse(action, "unavailable", {
      detail: reasonForDbError(loaded.error),
      code: loaded.error.code,
    });
  }
  const row = loaded.data as Row | null;
  // Ownership, revocation and existence collapse into ONE answer.
  if (!row || row.client_id !== clientId || row.revoked_at) {
    return refuse(action, "not_found");
  }

  // Health wall, twin #3 — checked on BOTH actions against today's list.
  if (isHealthCategory(row.item_category)) {
    return refuse(action, "health", { id });
  }

  if (action === "complete") {
    // Only a shared row is completed here (Q5(i): complete on share; S4's
    // reopen will be the second trigger).
    if (!row.shared_at) return refuse(action, "not_shared", { id });
    const outcome = await completeLongIfMissing(store, row);
    return Response.json({ ok: outcome === "completed" || outcome === "already_rich", outcome });
  }

  // Idempotent: a second Share tap on an already-public row just answers.
  if (row.shared_at) {
    return Response.json({
      ok: true,
      id,
      needsCompletion: !row.long_description,
    });
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const flips = await store
    .from("anchor_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .gte("shared_at", dayAgo);
  if (flips.error) {
    return refuse(action, "unavailable", {
      detail: reasonForDbError(flips.error),
      code: flips.error.code,
    });
  }
  if ((flips.count ?? 0) >= FLIP_CAP_PER_DAY) {
    return refuse(action, "cap", { cap: FLIP_CAP_PER_DAY });
  }

  // Moderation (decided Call 2) — on everything the public page could
  // render. Fails CLOSED to private, and never silently.
  try {
    const mod = await openai.moderations.create({
      model: "omni-moderation-latest",
      input: [row.item_name, row.short_description, row.long_description ?? ""]
        .filter(Boolean)
        .join("\n"),
    });
    if (mod.results?.some((r) => r.flagged)) {
      console.warn("[share] moderation blocked:", id);
      return refuse(action, "moderation", { id });
    }
  } catch (err) {
    return refuse(action, "unavailable", {
      detail: "moderation_unreachable",
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const flipped = await store
    .from("anchor_snapshots")
    .update({ shared_at: new Date().toISOString() })
    .eq("id", id)
    .eq("client_id", clientId)
    .is("shared_at", null);
  if (flipped.error) {
    return refuse(action, "unavailable", {
      detail: reasonForDbError(flipped.error),
      code: flipped.error.code,
    });
  }

  console.info("[share] flipped", { id, needsCompletion: !row.long_description });
  return Response.json({ ok: true, id, needsCompletion: !row.long_description });
}
