// src/lib/senderName.ts — S4, browser side.
// The optional sender name: asked once, on the first Share tap ("Your
// name, so friends know it's from you."), skippable, remembered locally
// and on the server (/api/profile → client_profiles, keyed by the anon
// id), changeable later from the small link beside Share.
import { getAnonymousClientId } from "./clientId";

const NAME_KEY = "rekomendr.sender_name";
const ASKED_KEY = "rekomendr.sender_name_asked";

const read = (k: string): string | null => {
  try {
    return typeof window === "undefined" ? null : localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    // private mode: the prompt may come back next visit — acceptable
  }
};

export const storedSenderName = (): string | null => read(NAME_KEY);

// True once the person has answered the prompt either way (name or Skip):
// the first-share question is never asked twice.
export const senderNameAsked = (): boolean => read(ASKED_KEY) === "1" || !!read(NAME_KEY);

export const markSenderNameAsked = () => write(ASKED_KEY, "1");

// Saves locally at once (the name shows immediately) and on the server.
// Resolves to whether the SERVER accepted it — a refused name (moderation,
// network) means cards go out unnamed; the server log says why.
export async function saveSenderName(raw: string): Promise<boolean> {
  const name = raw.replace(/\s+/g, " ").trim().slice(0, 40);
  markSenderNameAsked();
  if (!name) return false;
  write(NAME_KEY, name);
  try {
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: getAnonymousClientId(), name }),
    });
    const data = await res.json().catch(() => null);
    if (!data?.ok) console.warn("[profile] name not saved", { reason: data?.reason ?? res.status });
    return !!data?.ok;
  } catch (err) {
    console.warn("[profile] name request failed", err);
    return false;
  }
}

// S4 instrumentation — "card sent" (sender anon id, card id), fired after
// the share sheet / clipboard actually took the link.
export function recordCardSent(cardId: string) {
  try {
    void fetch("/api/card/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "sent", card: cardId, clientId: getAnonymousClientId() }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // never let measurement break a share
  }
}
