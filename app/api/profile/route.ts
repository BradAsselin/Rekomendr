// app/api/profile/route.ts
// S4 — the optional sender name ("Your name, so friends know it's from
// you."), one per anonymous client, in public.client_profiles (RLS on,
// zero client policies, service role only). The app keeps a local copy;
// this row is what the share flip reads, so the name travels with every
// card even when the card is sent from another browser of the same id.
//
// The name is going onto public link previews, so it gets the same
// moderation the card text gets at share time — fail CLOSED: a flagged or
// unchecked name is refused (and logged), and the card goes without one.

import OpenAI from "openai";
import { runEnvCheck } from "../../../src/lib/envCheck";
import {
  cleanClientId,
  cleanSenderName,
  getSnapshotStore,
} from "../../../src/lib/anchorSnapshots";

export const runtime = "nodejs";

runEnvCheck();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const refuse = (reason: string, detail?: Record<string, unknown>) => {
  console.warn("[profile] name refused", { reason, ...detail });
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
  const name = cleanSenderName(body?.name);
  if (!clientId || !name) return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });

  try {
    const mod = await openai.moderations.create({ model: "omni-moderation-latest", input: name });
    if (mod.results?.some((r) => r.flagged)) return refuse("moderation");
  } catch (err) {
    return refuse("moderation_unreachable", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const store = await getSnapshotStore();
  if (!store) return refuse("supabase_unconfigured");
  const { error } = await store
    .from("client_profiles")
    .upsert({ client_id: clientId, display_name: name, updated_at: new Date().toISOString() });
  if (error) return refuse("db_error", { code: error.code });

  console.info("[profile] name set", { chars: name.length });
  return Response.json({ ok: true, name });
}
