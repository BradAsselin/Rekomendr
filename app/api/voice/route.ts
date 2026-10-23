// app/api/voice/route.ts — S13c: what happened to the five cards a spoken
// mood produced (docs/s13-opus-voice-plan.md, B4).
//
// POST { clientId, moodId, events: [{ kind, title, position }] }
//   kind: shown | tap | play | share | save | star
//
// One service-role write per call (up to 10 events). The mood row must
// exist and belong to this client, so nobody can write events onto
// someone else's mood. No model call, so no api_usage cap: every write is
// a bounded batch. Fail-soft and named; always 204 to the page.

import { runEnvCheck } from "../../../src/lib/envCheck";
import { cleanClientId, getSnapshotStore } from "../../../src/lib/anchorSnapshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

runEnvCheck();

const KINDS = new Set(["shown", "tap", "play", "share", "save", "star"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const done = () => new Response(null, { status: 204 });

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const clientId = cleanClientId(body?.clientId);
  const moodId = typeof body?.moodId === "string" && UUID.test(body.moodId) ? body.moodId : null;
  const events = (Array.isArray(body?.events) ? body.events : [])
    .filter((e: any) => KINDS.has(e?.kind) && typeof e?.title === "string" && e.title.trim())
    .slice(0, 10)
    .map((e: any) => ({
      kind: e.kind as string,
      title: String(e.title).trim().slice(0, 200),
      position: Number.isInteger(e.position) && e.position >= 0 && e.position <= 9 ? e.position : null,
    }));
  if (!clientId || !moodId || events.length === 0) {
    console.warn("[voice] event refused — bad request", { clientId: !!clientId, moodId: !!moodId, events: events.length });
    return done();
  }
  const store = await getSnapshotStore();
  if (!store) {
    console.warn("[voice] event dropped — supabase unconfigured");
    return done();
  }
  // Ownership: the mood is this client's.
  const own = await store.from("voice_moods").select("id").eq("id", moodId).eq("client_id", clientId).maybeSingle();
  if (own.error || !own.data) {
    const missing = own.error && (own.error.code === "42P01" || own.error.code === "PGRST205" || /voice_moods/.test(own.error.message ?? ""));
    console.warn("[voice] event refused", { reason: missing ? "migration_pending" : own.error ? "db_error" : "not_owner" });
    return done();
  }
  const ins = await store
    .from("voice_events")
    .insert(events.map((e: { kind: string; title: string; position: number | null }) => ({ mood_id: moodId, client_id: clientId, ...e })));
  if (ins.error) console.warn("[voice] event write failed", { code: ins.error.code ?? null });
  return done();
}
