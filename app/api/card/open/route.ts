// app/api/card/open/route.ts
// S4b — open a shared card IN THE APP, as the anchor ("After saving: open
// the app with that title as the anchor and reks loading").
//
// Answers the same SnapResult shape a snap or a typed title does, so the
// app renders it with the existing anchor card. The text is the card's own
// stored text — never regenerated — and the anchor token is signed fresh
// for THIS client, because the S2 token binds text to a client id: with it
// the receiver can Save, Share (as their own card), open details and get
// reks, exactly as for a snap of their own.
//
// No generation here. Media (trailer, live providers, TMDb identity) comes
// from the card's own refresh clock (src/lib/cardMedia.ts).

import { runEnvCheck } from "../../../../src/lib/envCheck";
import { cleanClientId, cleanSnapshotId, loadPublicSnapshot } from "../../../../src/lib/anchorSnapshots";
import { cardMediaWithin } from "../../../../src/lib/cardMedia";
import { signAnchor } from "../../../../src/lib/mintToken";

export const runtime = "nodejs";

runEnvCheck();

const MEDIA_BUDGET_MS = 2500;

export async function POST(req: Request): Promise<Response> {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const clientId = cleanClientId(body?.clientId);
  const cardId = cleanSnapshotId(body?.card);
  if (!clientId || !cardId) return Response.json({ error: "bad_request" }, { status: 400 });

  const card = await loadPublicSnapshot(cardId);
  if (!card) {
    console.warn("[card-open] not public", { card: cardId });
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const media = await cardMediaWithin(card, MEDIA_BUDGET_MS);
  const token = signAnchor({
    name: card.item_name,
    category: card.item_category,
    short: card.short_description,
    long: null,
    clientId,
  });

  console.info("[card-open] opened in app", { card: cardId, media: !!media?.id });
  return Response.json({
    anchor: {
      detected_item: {
        name: card.item_name,
        description: card.short_description,
        category: card.item_category,
      },
      ...(token ? { detected_item_token: token } : {}),
      mode: "similar",
      results: { similar: [], uses: [], alternatives: [] },
      ...(media?.kind && media.id
        ? {
            media: {
              kind: media.kind,
              id: media.id,
              trailerUrl: media.trailerUrl,
              watch: media.watch,
              availability: media.availability,
            },
          }
        : {}),
    },
  });
}
