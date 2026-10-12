// app/api/anchor/route.ts
// S3.0 — the typed lane's anchor (the "what's that show?" flow).
//
// Field case: Brad typed "Lioness" (TV) at dinner and got five similar
// shows instead of Lioness itself; then a friend asked where to watch it.
// When typed text NAMES a specific movie or show, it now lands as the
// anchor exactly like a snapped one: TMDb's overview as its description,
// Share from the first second (signed here, minted at /api/save as S2.3),
// Save, Trailer + Where to watch, and five reks below.
//
// Two actions, so the anchor shows before any model runs:
//   "resolve" — TMDb only (no model call, no cap): the detection rule in
//               src/lib/tmdbMedia.ts. Not a title → { anchor: null } and
//               the client runs today's search, unchanged.
//   "reks"    — the chooser (src/lib/mediaReks.ts): five of TMDb's
//               recommendations + similar, picked and explained for this
//               user. One OpenAI call → the reksnap-text daily cap.
// Wine-by-name lives in /api/reksnap (it reuses the snap prompt).

import { runEnvCheck } from "../../../src/lib/envCheck";
import { signAnchor } from "../../../src/lib/mintToken";
import {
  loadMediaBundle,
  mediaCategoryFor,
  mediaConfigured,
  resolveTypedTitle,
  type MediaKind,
} from "../../../src/lib/tmdbMedia";
import { chooseMediaReks, raceTaste } from "../../../src/lib/mediaReks";
import { NEW_TO_ME_NOTICE } from "../../../src/lib/snapTitleGuard";
import { capGate } from "../../../src/lib/apiUsage";
import {
  maybeSimulateOpenAIFailure,
  openAIFailureResponse,
} from "../../../src/lib/openaiFailure";

export const runtime = "nodejs";

runEnvCheck();

const cleanClientId = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return id.length >= 8 && id.length <= 64 ? id : null;
};

const laneKindFor = (category: unknown): MediaKind | null => {
  const c = typeof category === "string" ? category.trim().toLowerCase() : "";
  if (c === "movies" || c === "movie") return "movie";
  if (c === "tv shows" || c === "tv" || c === "tv show") return "tv";
  return null;
};

async function resolve(body: any): Promise<Response> {
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const laneKind = laneKindFor(body?.category);
  if (!text || !laneKind) return Response.json({ anchor: null }, { status: 200 });
  if (!mediaConfigured()) {
    // Loud, never quiet (S1.5 posture): the typed-title anchor is off.
    console.warn("[typed-anchor] disabled — TMDB_API_KEY missing");
    return Response.json({ anchor: null }, { status: 200 });
  }

  const started = Date.now();
  const hit = await resolveTypedTitle(text, laneKind);
  if (!hit) {
    console.info("[typed-anchor] not a title — search as before", { ms: Date.now() - started });
    return Response.json({ anchor: null }, { status: 200 });
  }
  const bundle = await loadMediaBundle(hit.kind, hit.id);
  if (!bundle) {
    // Resolved but the details call failed: the search runs as before,
    // and the log says why the anchor didn't show.
    console.warn("[typed-anchor] resolved but bundle failed — search as before", {
      title: hit.title,
      kind: hit.kind,
    });
    return Response.json({ anchor: null }, { status: 200 });
  }

  const category = mediaCategoryFor(bundle.kind);
  const clientId = cleanClientId(body?.clientId);
  const token = clientId
    ? signAnchor({
        name: bundle.title,
        category,
        short: bundle.overview,
        long: null,
        clientId,
      })
    : null;

  console.info("[typed-anchor] resolved", {
    title: bundle.title,
    kind: bundle.kind,
    year: bundle.year,
    pool: bundle.candidates.length,
    trailer: !!bundle.completion.trailerUrl,
    providers: bundle.completion.watch
      ? bundle.completion.watch.stream.length + bundle.completion.watch.rentBuy.length
      : 0,
    ms: Date.now() - started,
  });

  return Response.json(
    {
      anchor: {
        detected_item: {
          name: bundle.title,
          description: bundle.overview,
          category,
          year: bundle.year,
        },
        ...(token ? { detected_item_token: token } : {}),
        mode: "similar",
        results: { similar: [], uses: [], alternatives: [] },
        media: {
          kind: bundle.kind,
          id: bundle.id,
          trailerUrl: bundle.completion.trailerUrl,
          watch: bundle.completion.watch,
          availability: bundle.completion.availability,
        },
      },
    },
    { status: 200 }
  );
}

async function reks(body: any): Promise<Response> {
  const kind: MediaKind | null =
    body?.kind === "movie" || body?.kind === "tv" ? body.kind : null;
  const id = Number(body?.id);
  if (!kind || !Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const capped = await capGate(body?.clientId, "reksnap-text");
  if (capped) return capped;

  const clientId = cleanClientId(body?.clientId);
  const lane = typeof body?.lane === "string" ? body.lane.slice(0, 60) : null;
  const [bundle, taste] = await Promise.all([
    loadMediaBundle(kind, id),
    raceTaste(clientId, kind),
  ]);
  if (!bundle) {
    console.warn("[typed-anchor] reks: bundle failed", { kind, id });
    return Response.json({ error: "Lookup failed" }, { status: 502 });
  }
  const chosen = await chooseMediaReks({
    anchor: { title: bundle.title, year: bundle.year, kind, overview: bundle.overview },
    candidates: bundle.candidates,
    taste,
    lane,
    path: "typed",
  });
  // Honest-short (§2.4): nothing real to offer → say so, never pad.
  return Response.json(
    chosen.length > 0 ? { reks: chosen } : { reks: [], notice: NEW_TO_ME_NOTICE },
    { status: 200 }
  );
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.action === "resolve") return await resolve(body);
    if (body?.action === "reks") {
      maybeSimulateOpenAIFailure();
      return await reks(body);
    }
    return Response.json({ error: "Bad request" }, { status: 400 });
  } catch (err) {
    const failure = openAIFailureResponse("anchor", err);
    if (failure) return failure;
    console.error("[typed-anchor] route error:", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
