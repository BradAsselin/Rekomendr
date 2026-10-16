// src/lib/claimToken.ts — server-only. S4b: the iOS separate-storage catch.
//
// Safari and a home-screen web app do not share storage on iOS, so a card
// saved in Safari would be missing from the app the person just added to
// their home screen. The fix: after Save, the URL the installed app opens
// with carries a short-lived claim — "this anonymous id saved this card" —
// signed by the server. On the first standalone launch the app redeems it
// (/api/card/claim): it adopts that anonymous id (so the save, the name and
// the receiver → sender attribution all carry over) and opens the card.
//
// HMAC-SHA256 under MINT_SIGNING_SECRET with its own domain prefix, so a
// claim can never verify as an anchor token or vice versa. 7 days: long
// enough to add the icon tonight and open it on the weekend; a leaked URL
// dies on its own.
if (typeof window !== "undefined") {
  throw new Error("claimToken.ts was imported in a browser bundle.");
}
import { createHmac, timingSafeEqual } from "crypto";
import { cleanClientId, cleanSnapshotId } from "./anchorSnapshots";

export const CLAIM_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const PREFIX = "rekomendr-claim-v1|";

const secret = () => process.env.MINT_SIGNING_SECRET?.trim() || null;
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const mac = (key: string, body: string) => createHmac("sha256", key).update(PREFIX + body).digest("base64url");

export function signClaim(clientId: string, cardId: string, now: number = Date.now()): string | null {
  const key = secret();
  if (!key) return null;
  const body = b64(JSON.stringify({ c: clientId, k: cardId, t: now }));
  return `${body}.${mac(key, body)}`;
}

export function verifyClaim(
  token: unknown,
  now: number = Date.now()
): { clientId: string; cardId: string } | null {
  const key = secret();
  if (!key || typeof token !== "string" || token.length > 600) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(mac(key, body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    const clientId = cleanClientId(p?.c);
    const cardId = cleanSnapshotId(p?.k);
    const t = Number(p?.t);
    if (!clientId || !cardId || !Number.isFinite(t) || now - t > CLAIM_WINDOW_MS || t - now > 60_000) return null;
    return { clientId, cardId };
  } catch {
    return null;
  }
}
