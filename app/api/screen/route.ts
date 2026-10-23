// app/api/screen/route.ts — S15: the streaming-screen snap
// (docs/s15-screen-snap-plan.md, src/lib/screenSnap.ts).
//
// Two requests:
//   { clientId, image, goTos }                  a photo: read → guard → rank
//   { clientId, titles: [{kind,id}], service, goTos, steer }
//                                               a Steer by tap: re-rank the
//                                               titles already resolved
// Answer: { ok: true, screen: null } when the photo isn't a streaming
// screen of several real titles (the client's normal snap answers), or
// { ok: true, screen: { service, steer, order, titles, reks } }.
//
// Cards: TMDb's title and synopsis, the commitment ("2h 10m" or
// "3 seasons · 30 episodes"), "on Netflix" (the service in the photo, or
// TMDb's first streaming service), "vs. your <go-to>: …" when a go-to
// steers, and "Start with this one" on the best match.

import { runEnvCheck } from "../../../src/lib/envCheck";
import { withLlmContext } from "../../../src/lib/llm";
import { cleanClientId } from "../../../src/lib/anchorSnapshots";
import { capGate } from "../../../src/lib/apiUsage";
import { mediaConfigured, type MediaBundle, type MediaKind } from "../../../src/lib/tmdbMedia";
import { linesVsGoTo, raceTaste } from "../../../src/lib/mediaReks";
import { genreLine, leadLine, loadGoTos, shortSynopsis, type GoToIn } from "../../../src/lib/slotRecipe";
import {
  canonicalService,
  loadScreenTitles,
  rankScreen,
  readScreen,
  resolveScreen,
} from "../../../src/lib/screenSnap";
import { maybeSimulateOpenAIFailure, openAIFailureResponse } from "../../../src/lib/openaiFailure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

runEnvCheck();

// Approved wording (Brad, 2026-10-23).
const START_WITH = "Start with this one";

function goTosOf(raw: unknown): GoToIn[] {
  return (Array.isArray(raw) ? raw : [])
    .filter((g: any) => g && typeof g.name === "string" && g.name.trim())
    .slice(0, 50)
    .map((g: any) => ({
      name: g.name.trim().slice(0, 200),
      tmdbKind: g.tmdbKind === "movie" || g.tmdbKind === "tv" ? g.tmdbKind : null,
      tmdbId: Number.isInteger(g.tmdbId) && g.tmdbId > 0 ? g.tmdbId : null,
      at: typeof g.at === "string" ? g.at : null,
    }));
}

function titleIdsOf(raw: unknown): { kind: MediaKind; id: number }[] {
  return (Array.isArray(raw) ? raw : [])
    .filter((t: any) => (t?.kind === "movie" || t?.kind === "tv") && Number.isInteger(t?.id) && t.id > 0)
    .map((t: any) => ({ kind: t.kind as MediaKind, id: t.id as number }));
}

// A screen mixes films and shows, so the go-tos load in both kinds.
async function loadAllGoTos(goTos: GoToIn[]) {
  const [movies, shows] = await Promise.all([
    loadGoTos("movie", goTos.filter((g) => (g.tmdbKind ?? "movie") === "movie")),
    loadGoTos("tv", goTos.filter((g) => g.tmdbKind === "tv")),
  ]);
  return [...movies, ...shows];
}

const whereOf = (b: MediaBundle, service: string | null): string | null => {
  const name = service ?? b.completion.watch?.stream[0]?.name ?? null;
  return name ? `on ${name}` : null;
};

async function handlePost(req: Request): Promise<Response> {
  const started = Date.now();
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const clientId = cleanClientId(body?.clientId);
  if (!clientId) return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  if (!mediaConfigured()) {
    // Without TMDb nothing can be checked, so nothing ships: the normal
    // snap answers, and the log says why.
    console.error("[screen] TMDB_API_KEY missing — screen snaps take the normal snap path");
    return Response.json({ ok: true, screen: null, reason: "disabled" }, { status: 200 });
  }

  try {
    maybeSimulateOpenAIFailure();
    const image = typeof body?.image === "string" && body.image.startsWith("data:image/") ? body.image : null;
    const ids = titleIdsOf(body?.titles);
    if (!image && ids.length < 2) return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });

    let service: string | null = null;
    let titles: MediaBundle[];
    if (image) {
      const capped = await capGate(clientId, "reksnap-vision");
      if (capped) return capped;
      const read = await readScreen(image);
      if (!read) return Response.json({ ok: true, screen: null }, { status: 200 });
      service = read.service;
      titles = await resolveScreen(read);
      if (titles.length < 2) {
        console.info("[screen] fewer than two real titles — normal snap path", { read: read.titles.length, real: titles.length });
        return Response.json({ ok: true, screen: null }, { status: 200 });
      }
    } else {
      service = canonicalService(body?.service);
      titles = await loadScreenTitles(ids);
      if (titles.length < 2) return Response.json({ ok: false, reason: "tmdb_failed" }, { status: 200 });
    }

    const goTos = goTosOf(body?.goTos);
    const loaded = await loadAllGoTos(goTos);
    const steerName = typeof body?.steer === "string" ? body.steer : null;
    const ranked = rankScreen(titles, loaded, steerName);
    const steer = ranked.steer;

    // "vs. your <go-to>" lines: one call, capped like every line call. A
    // refused cap or a failed call ships TMDb's synopses, named in the log.
    let lines = new Map<number, string>();
    if (steer?.bundle) {
      const capped = await capGate(clientId, "reksnap-text");
      if (capped) {
        console.warn("[screen] over cap — synopses instead of go-to lines");
      } else {
        try {
          const taste = await raceTaste(clientId, steer.bundle.kind);
          lines = await linesVsGoTo({
            goTo: {
              title: steer.bundle.title,
              year: steer.bundle.year,
              kind: steer.bundle.kind,
              overview: steer.bundle.overview,
            },
            candidates: ranked.titles.map((b) => ({
              id: b.id,
              kind: b.kind,
              title: b.title,
              year: b.year,
              overview: b.overview,
              genreIds: b.genreIds,
            })),
            taste: { liked: taste.liked, disliked: taste.disliked, watched: [] },
          });
        } catch (err) {
          console.error("[screen] go-to lines failed — synopses shipped", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    const reks = ranked.titles.map((b, i) => {
      const line = lines.get(b.id);
      return {
        title: b.title,
        year: b.year,
        tmdbId: b.id,
        kind: b.kind,
        genreIds: b.genreIds,
        genre: genreLine(b.genreIds),
        slot: "screen",
        short: line ? leadLine(line) : shortSynopsis(b.overview),
        long: b.overview,
        vsGoTo: line ? steer!.name : null,
        trailerUrl: b.completion.trailerUrl,
        facts: [b.commitment, whereOf(b, service)].filter((f): f is string => !!f),
        screenNote: i === 0 ? START_WITH : null,
      };
    });

    console.info("[screen]", {
      mode: image ? "photo" : "steer",
      service,
      titles: reks.length,
      goTos: goTos.length,
      steer: steer?.name ? "yes" : "no",
      lines: lines.size,
      ms: Date.now() - started,
    });

    return Response.json(
      {
        ok: true,
        screen: {
          service,
          steer: steer ? steer.name : null,
          order: ranked.order.map((g) => g.name),
          titles: ranked.titles.map((b) => ({ kind: b.kind, id: b.id })),
          reks,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    const failure = openAIFailureResponse("screen", err);
    if (failure) return failure;
    console.error("[screen] route error — normal snap path", {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ ok: true, screen: null, reason: "error" }, { status: 200 });
  }
}

// The dev-only provider override and diagnostics (src/lib/llm.ts).
export async function POST(req: Request) {
  return withLlmContext(req, () => handlePost(req));
}
