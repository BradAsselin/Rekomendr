// app/api/slots/route.ts — S12b: the five behind a Movies/TV mood chip,
// and every Steer by re-run (docs/s12-gotos-steer-plan.md).
//
// The recipe (src/lib/slotRecipe.ts) picks the five from TMDb's pools and
// the person's go-tos. Text:
//   - steered by a go-to → ONE call to the existing chooser
//     (src/lib/mediaReks.ts, its prompt verbatim) for a comparison line per
//     card, against the go-to; the card leads "vs. your <go-to>: …";
//   - no go-to yet → TMDb's own synopsis, no model call.
// No prompt text changes anywhere.
//
// Request: { clientId, category: "Movies"|"TV Shows", lane, refiner,
//   goTos: [{ name, tmdbKind, tmdbId, at }], steer?: name, seen: [titles],
//   count?: 1 (a single replacement after a thumbs-down), slot?: kind }
// The client sends its own go-to mirror so a star tapped a second ago
// already steers (the server row may still be landing).
//
// Fail-loud: no TMDb key / TMDb down → { ok:false, reason } and the client
// runs the old AI chip search, saying so in the log ([slots] FALLBACK).

import { runEnvCheck } from "../../../src/lib/envCheck";
import { cleanClientId } from "../../../src/lib/anchorSnapshots";
import { capGate } from "../../../src/lib/apiUsage";
import { mediaConfigured, type MediaKind } from "../../../src/lib/tmdbMedia";
import { normalizeTitle } from "../../../src/lib/tmdbVerify";
import { linesVsGoTo, raceTaste } from "../../../src/lib/mediaReks";
import {
  assemble,
  laneGenres,
  floorFor,
  genreLine,
  leadLine,
  loadGoTos,
  loadPools,
  neighborPool,
  rankGoTos,
  recipeFor,
  shortSynopsis,
  type GoToIn,
  type Refiner,
  type SlotKind,
} from "../../../src/lib/slotRecipe";
import {
  maybeSimulateOpenAIFailure,
  openAIFailureResponse,
} from "../../../src/lib/openaiFailure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

runEnvCheck();

const SEEN_MAX = 600;
const SLOT_KINDS = new Set<SlotKind>([
  "touchstone",
  "popular",
  "neighbor",
  "wildcard",
  "fresh",
  "classic",
  "new",
]);

const kindFor = (c: unknown): MediaKind | null =>
  c === "Movies" ? "movie" : c === "TV Shows" ? "tv" : null;

function refinerOf(raw: any): Refiner {
  if (raw?.kind === "tone" && typeof raw.vibe === "string")
    return { kind: "tone", vibe: raw.vibe.slice(0, 60) };
  if (raw?.kind === "era" && (raw.era === "classic" || raw.era === "new"))
    return { kind: "era", era: raw.era };
  return null;
}

function goTosOf(raw: unknown): GoToIn[] {
  return (Array.isArray(raw) ? raw : [])
    .filter((g: any) => g && typeof g.name === "string" && g.name.trim())
    .slice(0, 50)
    .map((g: any) => ({
      name: g.name.trim().slice(0, 200),
      tmdbKind:
        g.tmdbKind === "movie" || g.tmdbKind === "tv" ? g.tmdbKind : null,
      tmdbId: Number.isInteger(g.tmdbId) && g.tmdbId > 0 ? g.tmdbId : null,
      at: typeof g.at === "string" ? g.at : null,
    }));
}

export async function POST(req: Request): Promise<Response> {
  const started = Date.now();
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const clientId = cleanClientId(body?.clientId);
  const kind = kindFor(body?.category);
  if (!clientId || !kind)
    return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  if (!mediaConfigured()) {
    console.error(
      "[slots] FALLBACK disabled — TMDB_API_KEY missing; the AI chip search runs",
    );
    return Response.json({ ok: false, reason: "disabled" }, { status: 200 });
  }

  try {
    maybeSimulateOpenAIFailure();
    const lane =
      typeof body?.lane === "string"
        ? body.lane.trim().slice(0, 40) || null
        : null;
    const refiner = refinerOf(body?.refiner);
    const goTos = goTosOf(body?.goTos);
    const count = body?.count === 1 ? 1 : 5;
    const only: SlotKind | undefined = SLOT_KINDS.has(body?.slot)
      ? body.slot
      : undefined;
    const seen = (Array.isArray(body?.seen) ? body.seen : [])
      .filter((t: unknown): t is string => typeof t === "string")
      .slice(-SEEN_MAX);

    const [pools, loaded, taste] = await Promise.all([
      loadPools(kind, lane, refiner),
      loadGoTos(kind, goTos),
      raceTaste(clientId, kind),
    ]);
    if (!pools) {
      console.error(
        "[slots] FALLBACK TMDb discover failed; the AI chip search runs",
        { kind, lane },
      );
      return Response.json(
        { ok: false, reason: "tmdb_failed" },
        { status: 200 },
      );
    }

    const laneIds = laneGenres(kind, lane);
    const { order, scores } = rankGoTos(loaded, laneIds, pools);
    const asked =
      typeof body?.steer === "string" ? normalizeTitle(body.steer) : null;
    const steer = asked
      ? (order.find((g) => normalizeTitle(g.name) === asked) ??
        order[0] ??
        null)
      : (order[0] ?? null);
    const recipe = recipeFor(goTos.length);

    // THE GUARANTEE: shown this visit, starred, watched, disliked — and
    // every go-to's own TMDb title — never ship.
    const excluded = new Set(
      [
        ...seen,
        ...goTos.map((g) => g.name),
        ...loaded.map((g) => g.bundle?.title ?? ""),
        ...taste.watched,
        ...taste.disliked,
      ]
        .map(normalizeTitle)
        .filter(Boolean),
    );

    const picks = assemble({
      recipe,
      pools,
      neighbors: neighborPool(steer, laneIds, floorFor(lane), pools),
      excluded,
      count,
      only:
        count === 1
          ? (only ?? (recipe === "none" ? "popular" : "neighbor"))
          : undefined,
    });

    // Lines against the steering go-to: one model call, capped like every
    // chooser call. A refused cap or a failed call ships the synopsis.
    let lines = new Map<number, string>();
    if (steer?.bundle && picks.length > 0) {
      const capped = await capGate(clientId, "reksnap-text");
      if (capped) {
        console.warn("[slots] over cap — synopses instead of go-to lines");
      } else {
        try {
          lines = await linesVsGoTo({
            goTo: {
              title: steer.bundle.title,
              year: steer.bundle.year,
              kind: steer.bundle.kind,
              overview: steer.bundle.overview,
            },
            candidates: picks,
            taste: {
              liked: taste.liked,
              disliked: taste.disliked,
              watched: [],
            },
            lane,
          });
        } catch (err) {
          // Named, never silent: the five are real either way; they ship
          // with TMDb's synopses instead of go-to lines.
          console.error("[slots] go-to lines failed — synopses shipped", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    const reks = picks.map((p) => {
      const line = lines.get(p.id);
      return {
        title: p.title,
        year: p.year,
        tmdbId: p.id,
        kind: p.kind,
        genreIds: p.genreIds ?? [],
        genre: genreLine(p.genreIds ?? []),
        slot: p.slot,
        short: line ? leadLine(line) : shortSynopsis(p.overview),
        long: p.overview,
        vsGoTo: line ? steer!.name : null,
      };
    });

    console.info("[slots]", {
      kind,
      lane,
      refiner: refiner
        ? refiner.kind === "tone"
          ? refiner.vibe
          : refiner.era
        : null,
      recipe,
      goTos: goTos.length,
      steer: steer?.name ? "yes" : "no",
      nearestScore: scores[0] ?? null,
      excluded: excluded.size,
      shipped: reks.length,
      slots: reks.map((r) => r.slot),
      lines: lines.size,
      ms: Date.now() - started,
    });
    if (reks.length < count) {
      console.warn("[slots] short set — pools ran dry after exclusions", {
        kind,
        lane,
        shipped: reks.length,
        count,
      });
    }

    return Response.json(
      {
        ok: true,
        recipe,
        reks,
        steer: steer ? steer.name : null,
        order: order.map((g) => g.name),
      },
      { status: 200 },
    );
  } catch (err) {
    const failure = openAIFailureResponse("slots", err);
    if (failure) return failure;
    console.error("[slots] FALLBACK route error; the AI chip search runs", {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ ok: false, reason: "error" }, { status: 200 });
  }
}
