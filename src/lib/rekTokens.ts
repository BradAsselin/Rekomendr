// src/lib/rekTokens.ts — server only.
// S6 — Share on every rek card. A card link can only be minted from text
// this server generated (Ledger #19), so every rek the server hands out
// carries its own attestation, exactly like the anchor's
// detected_item_token: name + category + short, long = null, for this
// client. /api/save verifies it and mints the rek short-only.
//
// The category is pinned here (the rek's own, the anchor's as the floor)
// and returned on the rek, so the client sends back exactly what was
// signed. Health is never signed (charter §2.2): a health-labelled rek, or
// one whose NAME reads as medication, gets no token — no token, no Share.

import { signAnchor, type MintToken } from "./mintToken";
import { healthLabelFromName, isHealthMedical } from "./categoryGates";

type RekLike = { name: string; description: string; category?: string };

export function withRekTokens<T extends RekLike>(
  reks: T[],
  clientId: string | null | undefined,
  fallbackCategory: string
): Array<T & { category: string; token?: MintToken }> {
  return reks.map((r) => {
    const category = (r.category ?? "").trim() || fallbackCategory;
    const out = { ...r, category };
    // No client, or no category at all (/api/save requires one): no token.
    if (!clientId || !category) return out;
    if (isHealthMedical(category.toLowerCase()) || healthLabelFromName(r.name)) return out;
    const token = signAnchor({
      name: r.name,
      category,
      short: r.description,
      long: null,
      clientId,
    });
    return token ? { ...out, token } : out;
  });
}
