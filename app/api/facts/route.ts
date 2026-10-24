// app/api/facts/route.ts — S17: a card's commitment and where-to-watch
// ("1h 43m", "on Netflix") and its poster, for search-lane cards that
// arrived without them (the AI search's five; slot and screen cards
// carry them already). Read-only TMDb, through the same cached bundle the
// slot recipe uses, so a title any card has shown costs nothing.
//
//   POST { items: [{ kind: "movie" | "tv", id }] }   (at most 12)
//   → { ok: true, facts: [{ kind, id, facts: string[], posterPath }] }
//
// A title whose bundle doesn't arrive in time is simply absent from the
// answer: its card keeps no line rather than a guess, and the miss is
// named in the log.

import { runEnvCheck } from "../../../src/lib/envCheck";
import { loadMediaBundle, mediaConfigured, whereOf, type MediaKind } from "../../../src/lib/tmdbMedia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

runEnvCheck();

const MAX_ITEMS = 12;
// Hang protection (charter §2.11): a bundle is one TMDb call, ~150-400 ms;
// the slot route waits 4 s for the same read.
const BUNDLE_WAIT_MS = 4000;

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  const items = (Array.isArray(body?.items) ? body.items : [])
    .filter((t: any) => (t?.kind === "movie" || t?.kind === "tv") && Number.isInteger(t?.id) && t.id > 0)
    .slice(0, MAX_ITEMS)
    .map((t: any) => ({ kind: t.kind as MediaKind, id: t.id as number }));
  if (items.length === 0) return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  if (!mediaConfigured()) {
    console.warn("[facts] TMDB_API_KEY missing — no facts");
    return Response.json({ ok: true, facts: [] });
  }

  let missed = 0;
  const facts = (
    await Promise.all(
      items.map(async ({ kind, id }: { kind: MediaKind; id: number }) => {
        const b = await Promise.race([
          loadMediaBundle(kind, id).catch(() => null),
          new Promise<null>((r) => setTimeout(() => r(null), BUNDLE_WAIT_MS)),
        ]);
        if (!b) {
          missed++;
          return null;
        }
        return {
          kind,
          id,
          facts: [b.commitment, whereOf(b)].filter((f): f is string => !!f),
          posterPath: b.posterPath ?? null,
        };
      })
    )
  ).filter(Boolean);
  if (missed > 0) console.warn("[facts] bundles missing — those cards ship without a line", { asked: items.length, missed });
  return Response.json({ ok: true, facts }, { headers: { "Cache-Control": "no-store" } });
}
