// app/api/card/event/route.ts
// S4 — one door for the test's events (src/lib/cardEvents.ts): opens and
// taps from the public card's /card.js (sendBeacon), "sent" from the app.
// Always 204: an event that didn't record is logged by name, never shown.

import { runEnvCheck } from "../../../../src/lib/envCheck";
import { recordCardEvent } from "../../../../src/lib/cardEvents";

export const runtime = "nodejs";

runEnvCheck();

export async function POST(req: Request): Promise<Response> {
  let body: any = null;
  try {
    // sendBeacon posts a Blob; read as text so any content type parses.
    body = JSON.parse(await req.text());
  } catch {
    console.warn("[card-event] not recorded", { reason: "bad_json" });
    return new Response(null, { status: 204 });
  }
  await recordCardEvent({ kind: body?.kind, card: body?.card, clientId: body?.clientId });
  return new Response(null, { status: 204 });
}
