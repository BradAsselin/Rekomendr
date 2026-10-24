// app/api/facts/route.ts — S17: a card's commitment and where-to-watch
// ("1h 43m", "on Netflix") and its poster, for search-lane cards that
// arrived without them (the AI search's five; slot and screen cards
// carry them already). Read-only TMDb, through the same cached bundle the
// slot recipe uses, so a title any card has shown costs nothing.
//
//   POST { items: [{ kind: "movie" | "tv", id } | { kind, title, year? }] }   (at most 12)
//   → { ok: true, facts: [{ kind, id, title?, facts: string[], posterPath }] }
//
// S18b — snap-lane cards carry a name, not an id: those are matched by
// the real-title check's own lookup (verifyTitles: same matcher, same
// cache), and an unmatched title is simply absent — never a near miss.
//
// A title whose bundle doesn't arrive in time is simply absent from the
// answer: its card keeps no line rather than a guess, and the miss is
// named in the log.

import { runEnvCheck } from "../../../src/lib/envCheck";
import { loadMediaBundle, mediaConfigured, whereOf, type MediaKind } from "../../../src/lib/tmdbMedia";
import { verifyTitles } from "../../../src/lib/tmdbVerify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

runEnvCheck();

const MAX_ITEMS = 12;
// Hang protection (charter §2.11): a bundle is one TMDb call, ~150-400 ms;
// the slot route waits 4 s for the same read.
const BUNDLE_WAIT_MS = 4000;

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  type Item = { kind: MediaKind; id: number | null; title: string | null; year: number | null };
  const items: Item[] = (Array.isArray(body?.items) ? body.items : [])
    .filter(
      (t: any) =>
        (t?.kind === "movie" || t?.kind === "tv") &&
        ((Number.isInteger(t?.id) && t.id > 0) || (typeof t?.title === "string" && t.title.trim() && t.title.length <= 300))
    )
    .slice(0, MAX_ITEMS)
    .map((t: any) => ({
      kind: t.kind as MediaKind,
      id: Number.isInteger(t.id) && t.id > 0 ? (t.id as number) : null,
      title: Number.isInteger(t.id) && t.id > 0 ? null : (t.title as string).trim(),
      year: Number.isInteger(t.year) ? (t.year as number) : null,
    }));
  if (items.length === 0) return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  if (!mediaConfigured()) {
    console.warn("[facts] TMDB_API_KEY missing — no facts");
    return Response.json({ ok: true, facts: [] });
  }

  // Names → ids, through the title check's lookup (resolved matches only).
  const byName = items.filter((t) => t.id == null);
  if (byName.length > 0) {
    const out = await Promise.race([
      verifyTitles(byName.map((t) => ({ title: t.title!, year: t.year ?? undefined, kind: t.kind }))).catch(() => null),
      new Promise<null>((r) => setTimeout(() => r(null), BUNDLE_WAIT_MS)),
    ]);
    byName.forEach((t, i) => {
      const v = out?.verdicts[i];
      if (v?.resolved && Number.isInteger(v.tmdbId)) t.id = v.tmdbId!;
    });
  }

  let missed = 0;
  const facts = (
    await Promise.all(
      items.map(async ({ kind, id, title }) => {
        if (id == null) {
          missed++;
          return null;
        }
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
          ...(title ? { title } : {}),
          facts: [b.commitment, whereOf(b)].filter((f): f is string => !!f),
          posterPath: b.posterPath ?? null,
        };
      })
    )
  ).filter(Boolean);
  if (missed > 0) console.warn("[facts] bundles missing — those cards ship without a line", { asked: items.length, missed });
  return Response.json({ ok: true, facts }, { headers: { "Cache-Control": "no-store" } });
}
