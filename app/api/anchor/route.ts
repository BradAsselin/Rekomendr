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
import { withRekTokens } from "../../../src/lib/rekTokens";
import {
  loadMediaBundle,
  mediaCategoryFor,
  mediaConfigured,
  resolveExactTitle,
  resolveSnappedTitle,
  resolveTypedTitleChecked,
  type MediaBundle,
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
    console.error("[typed-anchor] FALLBACK disabled — TMDB_API_KEY missing; search ran instead");
    return Response.json({ anchor: null, fallback: "disabled" }, { status: 200 });
  }

  const started = Date.now();
  const { hit, lookupError } = await resolveTypedTitleChecked(text, laneKind);
  if (!hit && lookupError) {
    // S3.1: a FAILED lookup is not "not a title". Error level, with the
    // reason, so a field miss can always be told apart in the logs.
    console.error("[typed-anchor] FALLBACK lookup failed — search ran instead", {
      reason: lookupError,
      lane: laneKind,
      chars: text.length,
      ms: Date.now() - started,
    });
    return Response.json({ anchor: null, fallback: "lookup_failed" }, { status: 200 });
  }
  if (!hit) {
    console.info("[typed-anchor] not a title — search as before", { ms: Date.now() - started });
    return Response.json({ anchor: null }, { status: 200 });
  }
  const bundle = await loadMediaBundle(hit.kind, hit.id);
  if (!bundle) {
    console.error("[typed-anchor] FALLBACK resolved but bundle failed — search ran instead", {
      title: hit.title,
      kind: hit.kind,
      ms: Date.now() - started,
    });
    return Response.json({ anchor: null, fallback: "bundle_failed" }, { status: 200 });
  }

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

  return Response.json({ anchor: anchorFrom(bundle, cleanClientId(body?.clientId)) }, { status: 200 });
}

// The anchor shape every media anchor lands in (typed, or a go-to opened).
function anchorFrom(bundle: MediaBundle, clientId: string | null) {
  const category = mediaCategoryFor(bundle.kind);
  const token = clientId
    ? signAnchor({
        name: bundle.title,
        category,
        short: bundle.overview,
        long: null,
        clientId,
      })
    : null;
  return {
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
  };
}

// S12 — "+ More like this" on a go-to tile: the go-to itself becomes the
// anchor (TMDb only, no model call — the reks follow through "reks", the
// chooser over its recommendation web). By TMDb id when the go-to has one,
// else by name with the snapped rule.
async function open(body: any): Promise<Response> {
  if (!mediaConfigured()) {
    console.error("[go-to-open] TMDB_API_KEY missing — go-to tiles cannot open");
    return Response.json({ anchor: null, fallback: "disabled" }, { status: 200 });
  }
  const kindIn: MediaKind | null = body?.kind === "movie" || body?.kind === "tv" ? body.kind : null;
  let id = Number(body?.id);
  let kind = kindIn;
  if (!kind || !Number.isInteger(id) || id <= 0) {
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 200) : "";
    const laneKind = laneKindFor(body?.category);
    if (!name) return Response.json({ error: "Bad request" }, { status: 400 });
    const hit = await resolveSnappedTitle(name, laneKind ?? "any");
    if (!hit) {
      console.warn("[go-to-open] no TMDb title for the go-to", { lane: laneKind });
      return Response.json({ anchor: null, fallback: "not_found" }, { status: 200 });
    }
    id = hit.id;
    kind = hit.kind;
  }
  const bundle = await loadMediaBundle(kind, id);
  if (!bundle) {
    console.error("[go-to-open] bundle failed", { kind, id });
    return Response.json({ anchor: null, fallback: "bundle_failed" }, { status: 200 });
  }
  return Response.json({ anchor: anchorFrom(bundle, cleanClientId(body?.clientId)) }, { status: 200 });
}

// S7 — Share on a search-lane card (Brad's call B, 2026-10-15): movies and
// TV only, and the card carries TMDb's OFFICIAL synopsis, never the rek's
// browser-parsed line. The search lane's reks are built client-side from
// raw model text, so the server signs only what it fetched itself: TMDb's
// title + overview for an exact title match (year ±1). /api/save then
// mints it like any anchor. Books and wine get no Share yet.
async function card(body: any): Promise<Response> {
  const lane = typeof body?.category === "string" ? body.category.trim() : "";
  const laneKind: MediaKind | null =
    lane === "Movies" ? "movie" : lane === "TV Shows" ? "tv" : null;
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 200) : "";
  const year = Number.isInteger(body?.year) ? (body.year as number) : null;
  const clientId = cleanClientId(body?.clientId);
  if (!laneKind || !title || !clientId) {
    return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  if (!mediaConfigured()) {
    console.error("[search-card] TMDB_API_KEY missing — search-lane Share is off");
    return Response.json({ ok: false, reason: "disabled" }, { status: 200 });
  }
  const capped = await capGate(clientId, "reksnap-text");
  if (capped) return capped;

  // The lane's kind first; a "TV Shows" lane that named a film (or the
  // reverse) still resolves to the real title.
  const other: MediaKind = laneKind === "movie" ? "tv" : "movie";
  const hit =
    (await resolveExactTitle(title, year, laneKind)) ??
    (await resolveExactTitle(title, year, other));
  if (!hit) {
    console.info("[search-card] no exact TMDb title — no card", { lane: laneKind, year });
    return Response.json({ ok: false, reason: "not_found" }, { status: 200 });
  }
  const short = (hit.overview ?? "").trim();
  if (!short) {
    console.info("[search-card] TMDb has no synopsis — no card", { id: hit.id, kind: hit.kind });
    return Response.json({ ok: false, reason: "no_synopsis" }, { status: 200 });
  }
  const category = mediaCategoryFor(hit.kind);
  const token = signAnchor({ name: hit.title, category, short, long: null, clientId });
  if (!token) return Response.json({ ok: false, reason: "disabled" }, { status: 200 });
  return Response.json(
    { ok: true, item: { name: hit.title, category, short, year: hit.year }, token },
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
    // S6 — every rek carries its own attestation (Share on every card).
    chosen.length > 0
      ? { reks: withRekTokens(chosen, clientId, mediaCategoryFor(kind)) }
      : { reks: [], notice: NEW_TO_ME_NOTICE },
    { status: 200 }
  );
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.action === "resolve") return await resolve(body);
    if (body?.action === "card") return await card(body);
    if (body?.action === "open") return await open(body);
    if (body?.action === "reks") {
      maybeSimulateOpenAIFailure();
      return await reks(body);
    }
    return Response.json({ error: "Bad request" }, { status: 400 });
  } catch (err) {
    const failure = openAIFailureResponse("anchor", err);
    if (failure) return failure;
    console.error("[typed-anchor] FALLBACK route error — search ran instead:", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
