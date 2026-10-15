// app/api/card/claim/route.ts
// S4b — redeem the iOS hand-off (src/lib/claimToken.ts). The home-screen
// app, on its first launch, posts the claim from its start URL and gets
// back the anonymous id that saved the card in Safari, plus the card. The
// app then adopts that id — so the person's save, name and history are
// already there — and opens the card. A bad or expired claim is a named
// log line and a plain { ok:false }; the app just opens normally.

import { runEnvCheck } from "../../../../src/lib/envCheck";
import { verifyClaim } from "../../../../src/lib/claimToken";

export const runtime = "nodejs";

runEnvCheck();

export async function POST(req: Request): Promise<Response> {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const claim = verifyClaim(body?.claim);
  if (!claim) {
    console.warn("[card-claim] refused", { reason: "invalid_or_expired" });
    return Response.json({ ok: false, reason: "invalid_or_expired" });
  }
  console.info("[card-claim] redeemed", { card: claim.cardId });
  return Response.json({ ok: true, clientId: claim.clientId, card: claim.cardId });
}
