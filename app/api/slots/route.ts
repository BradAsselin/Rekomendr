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
//
// S16 — every card carries S15's facts (commitment, "on <service>"), and
// `stream: "ndjson"` paints early: { type:"cards" } as soon as the picks
// and their bundles exist, then { type:"lines" } when the writer answers
// (docs/s16-watched-search-plan.md, Part B). The one-card backfill stays
// plain JSON.
//
// S24a — steering is OFF by default (docs/s22-compare-to-plan.md): the
// client's `goTos` are exclusions only (a starred title never comes back
// as a pick). Only `refs` steer: up to 3 titles chosen in "Compare to…",
// or one the person named in their words. With refs, the neighbors are
// every ref's web, interleaved; each card belongs to its closest ref (the
// web it came from, else the best genre overlap), and its line is written
// against that ref — one chooser call per ref, prompt verbatim.
// `action: "lines"` writes those lines for a set already on screen (an AI
// search's five), without re-picking.
//
// S19a — a typed or spoken mood's `keywords` (TMDb keyword ids, one OR
// group per concept) and/or a named `reference` build a MOOD POOL instead
// of the lane's (src/lib/slotRecipe.ts loadMoodPools / webPools). The
// relevance gate: a five-card mood pool with fewer than MIN_STRONG_POOL
// titles left after this visit's exclusions answers { ok:false,
// reason:"weak_pool" } and the client runs the AI search on the words
// (docs/s19-fast-moods-plan.md, Part A). Never a thin set dressed as an
// answer.

import { runEnvCheck } from "../../../src/lib/envCheck";
import { withLlmContext } from "../../../src/lib/llm";
import { cleanClientId } from "../../../src/lib/anchorSnapshots";
import { capGate } from "../../../src/lib/apiUsage";
import { loadMediaBundle, mediaConfigured, whereOf, type MediaKind } from "../../../src/lib/tmdbMedia";
import { normalizeTitle, verifyTitles } from "../../../src/lib/tmdbVerify";
import type { TmdbCandidate } from "../../../src/lib/tmdbMedia";
import { linesVsGoTo, raceTaste } from "../../../src/lib/mediaReks";
import {
  assemble,
  laneGenres,
  floorFor,
  genreLine,
  leadLine,
  loadGoTos,
  loadMoodPools,
  loadPools,
  MIN_STRONG_POOL,
  neighborPool,
  webPools,
  type MoodConcept,
  type LoadedGoTo,
  closestRef,
  refNeighbors,
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
// S16 — the wait for a pick's TMDb bundle (its facts). Hang protection,
// well above TMDb's usual ~0.3–0.8 s; a miss ships the card without facts.
const BUNDLE_WAIT_MS = 4000;
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
  if (raw?.kind === "short") return { kind: "short" };
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

function conceptsOf(raw: unknown): MoodConcept[] {
  return (Array.isArray(raw) ? raw : [])
    .slice(0, 3)
    .map((c: any) => ({
      ids: (Array.isArray(c?.ids) ? c.ids : [])
        .filter((n: unknown): n is number => Number.isInteger(n) && (n as number) > 0)
        .slice(0, 16),
      exclude: c?.exclude === true,
    }))
    .filter((c) => c.ids.length > 0);
}

// S24a — the lines against each card's ref: one chooser call per ref that
// has cards, in parallel, each capped like every chooser call. A refused
// cap or a failed call ships that group's synopses, named in the log.
async function linesByRef(args: {
  clientId: string;
  groups: { ref: LoadedGoTo; cards: TmdbCandidate[] }[];
  taste: { liked: string[]; disliked: string[] };
  lane: string | null;
}): Promise<Map<number, { line: string; ref: string }>> {
  const out = new Map<number, { line: string; ref: string }>();
  await Promise.all(
    args.groups.map(async ({ ref, cards }) => {
      if (!ref.bundle || cards.length === 0) return;
      const capped = await capGate(args.clientId, "reksnap-text");
      if (capped) {
        console.warn("[slots] over cap — synopses instead of compare lines", { ref: ref.name });
        return;
      }
      try {
        const lines = await linesVsGoTo({
          goTo: {
            title: ref.bundle.title,
            year: ref.bundle.year,
            kind: ref.bundle.kind,
            overview: ref.bundle.overview,
          },
          candidates: cards,
          taste: { liked: args.taste.liked, disliked: args.taste.disliked, watched: [] },
          lane: args.lane,
        });
        lines.forEach((line, id) => out.set(id, { line, ref: ref.name }));
      } catch (err) {
        // Named, never silent: the cards are real either way; this group
        // ships with TMDb's synopses instead of compare lines.
        console.error("[slots] compare lines failed — synopses shipped", {
          ref: ref.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );
  return out;
}

// S24a — { action: "lines" }: compare lines for five already on screen.
// The five are found on TMDb by the title check's own matcher (cached from
// the check that let them ship); an unmatched title keeps its synopsis.
async function handleLines(body: any, clientId: string, kind: MediaKind): Promise<Response> {
  const started = Date.now();
  const refs = goTosOf(body?.refs).slice(0, 3);
  const items: { title: string; year: number | null }[] = (Array.isArray(body?.items) ? body.items : [])
    .filter((t: any) => typeof t?.title === "string" && t.title.trim() && t.title.length <= 300)
    .slice(0, 5)
    .map((t: any) => ({ title: t.title.trim(), year: Number.isInteger(t.year) ? t.year : null }));
  if (!refs.length || !items.length)
    return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  const [loadedRefs, verdicts, taste] = await Promise.all([
    loadGoTos(kind, refs),
    Promise.race([
      verifyTitles(items.map((t) => ({ title: t.title, year: t.year ?? undefined, kind }))).catch(() => null),
      new Promise<null>((r) => setTimeout(() => r(null), BUNDLE_WAIT_MS)),
    ]),
    raceTaste(clientId, kind),
  ]);
  const bundles = await Promise.all(
    items.map((_, i) => {
      const v = verdicts?.verdicts[i];
      const id = v?.resolved && Number.isInteger(v.tmdbId) ? (v.tmdbId as number) : null;
      return id == null
        ? Promise.resolve(null)
        : Promise.race([
            loadMediaBundle(kind, id).catch(() => null),
            new Promise<null>((r) => setTimeout(() => r(null), BUNDLE_WAIT_MS)),
          ]);
    }),
  );
  const cards: TmdbCandidate[] = [];
  const asShown = new Map<number, string>(); // TMDb id → the card's own title
  bundles.forEach((b, i) => {
    if (!b || asShown.has(b.id)) return;
    asShown.set(b.id, items[i].title);
    cards.push({ id: b.id, kind, title: b.title, year: b.year, overview: b.overview, genreIds: b.genreIds });
  });
  const usable = loadedRefs.filter((r) => r.bundle);
  const lines = await linesByRef({
    clientId,
    groups: usable.map((ref) => ({ ref, cards: cards.filter((c) => closestRef(c, usable, null) === ref) })),
    taste,
    lane: null,
  });
  const out = cards
    .filter((c) => lines.has(c.id))
    .map((c) => ({ title: asShown.get(c.id)!, short: leadLine(lines.get(c.id)!.line), vsGoTo: lines.get(c.id)!.ref }));
  console.info("[slots] lines for a set on screen", {
    kind,
    refs: refs.length,
    usable: usable.length,
    asked: items.length,
    matched: cards.length,
    lines: out.length,
    ms: Date.now() - started,
  });
  if (out.length < items.length) {
    console.warn("[slots] some cards keep their synopsis", {
      unmatched: items.length - cards.length,
      unwritten: cards.length - out.length,
    });
  }
  return Response.json({ ok: true, lines: out }, { status: 200 });
}

// S25 — { action: "lines", category: "Books" }: compare lines for a Books
// five against the first reference (the seed the five came from). No
// TMDb for books: each card's own text stands in for its synopsis, and
// the reference is named by its title. Same writer, same cap, same
// named failure; a card without a line keeps its text.
async function handleBookLines(body: any, clientId: string): Promise<Response> {
  const started = Date.now();
  const ref = goTosOf(body?.refs)[0];
  const items: { title: string; year: number | null; overview: string }[] = (Array.isArray(body?.items) ? body.items : [])
    .filter((t: any) => typeof t?.title === "string" && t.title.trim() && t.title.length <= 300)
    .slice(0, 5)
    .map((t: any) => ({
      title: t.title.trim(),
      year: Number.isInteger(t.year) ? t.year : null,
      overview: typeof t.overview === "string" ? t.overview.slice(0, 600) : "",
    }));
  if (!ref || !items.length) return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  if (await capGate(clientId, "reksnap-text")) {
    console.warn("[slots] over cap — synopses instead of compare lines", { ref: ref.name, kind: "book" });
    return Response.json({ ok: true, lines: [] }, { status: 200 });
  }
  const cards = items.map((t, i) => ({ id: i + 1, title: t.title, year: t.year, overview: t.overview }));
  let lines = new Map<number, string>();
  try {
    lines = await linesVsGoTo({
      goTo: { title: ref.name, year: null, kind: "book", overview: "" },
      candidates: cards,
      taste: { liked: [], disliked: [], watched: [] },
      lane: null,
    });
  } catch (err) {
    console.error("[slots] compare lines failed — synopses shipped", {
      ref: ref.name,
      kind: "book",
      error: err instanceof Error ? err.message : String(err),
    });
  }
  const out = cards
    .filter((c) => lines.has(c.id))
    .map((c) => ({ title: c.title, short: leadLine(lines.get(c.id)!), vsGoTo: ref.name }));
  console.info("[slots] book lines for a set on screen", { asked: items.length, lines: out.length, ms: Date.now() - started });
  return Response.json({ ok: true, lines: out }, { status: 200 });
}

async function handlePost(req: Request): Promise<Response> {
  const started = Date.now();
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const clientId = cleanClientId(body?.clientId);
  if (clientId && body?.action === "lines" && body?.category === "Books") {
    try {
      return await handleBookLines(body, clientId);
    } catch (err) {
      console.error("[slots] book lines failed", { error: err instanceof Error ? err.message : String(err) });
      return Response.json({ ok: false, reason: "error" }, { status: 500 });
    }
  }
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
    if (body?.action === "lines") return await handleLines(body, clientId, kind);
    const lane =
      typeof body?.lane === "string"
        ? body.lane.trim().slice(0, 40) || null
        : null;
    const refiner = refinerOf(body?.refiner);
    const goTos = goTosOf(body?.goTos);
    const refs = goTosOf(body?.refs).slice(0, 3);
    const count = body?.count === 1 ? 1 : 5;
    const only: SlotKind | undefined = SLOT_KINDS.has(body?.slot)
      ? body.slot
      : undefined;
    const seen = (Array.isArray(body?.seen) ? body.seen : [])
      .filter((t: unknown): t is string => typeof t === "string")
      .slice(-SEEN_MAX);

    // S19a — a mood pool when the words carried keywords or a reference.
    const concepts = conceptsOf(body?.keywords);
    const reference =
      typeof body?.reference === "string" && body.reference.trim()
        ? normalizeTitle(body.reference.slice(0, 200))
        : null;
    const mood = concepts.length > 0 || !!reference;
    const [lanePools, loaded, loadedRefs, taste] = await Promise.all([
      concepts.length
        ? loadMoodPools(kind, lane, refiner, concepts)
        : mood
          ? Promise.resolve(null)
          : loadPools(kind, lane, refiner),
      loadGoTos(kind, goTos),
      loadGoTos(kind, refs),
      raceTaste(clientId, kind),
    ]);
    const referenceGoTo = reference
      ? (loadedRefs.find((g) => normalizeTitle(g.name) === reference) ?? null)
      : null;
    const pools =
      mood && !concepts.length
        ? webPools(kind, lane, refiner, referenceGoTo?.bundle ?? null)
        : lanePools;
    if (!pools && mood) {
      console.warn("[slots] weak pool — the AI search runs", {
        kind,
        lane,
        concepts: concepts.length,
        reference: !!reference,
        why: concepts.length ? "tmdb_failed" : "reference_unavailable",
      });
      return Response.json({ ok: false, reason: "weak_pool" }, { status: 200 });
    }
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
    const { order, scores } = rankGoTos(loadedRefs, laneIds, pools);
    const asked =
      typeof body?.steer === "string" ? normalizeTitle(body.steer) : null;
    const steer = asked
      ? (order.find((g) => normalizeTitle(g.name) === asked) ??
        order[0] ??
        null)
      : (order[0] ?? null);
    // S24a — the refs that can steer (TMDb found them), the asked/nearest
    // one first: the neighbors interleave their webs in this order. A ref
    // TMDb can't place steers nothing (said in the set's log line).
    const steering = [
      ...(steer?.bundle ? [steer] : []),
      ...order.filter((g) => g !== steer && g.bundle),
    ];
    const recipe = recipeFor(steering.length);

    // THE GUARANTEE: shown this visit, starred, watched, disliked — and
    // every go-to's own TMDb title — never ship.
    const excluded = new Set(
      [
        ...seen,
        ...goTos.map((g) => g.name),
        ...loaded.map((g) => g.bundle?.title ?? ""),
        ...refs.map((g) => g.name),
        ...loadedRefs.map((g) => g.bundle?.title ?? ""),
        ...taste.watched,
        ...taste.disliked,
      ]
        .map(normalizeTitle)
        .filter(Boolean),
    );

    // S19a — THE RELEVANCE GATE: a mood pool too thin to answer the words
    // sends them to the AI search (a backfill never gates: its set is
    // already on screen).
    const poolLeft = pools.all
      ? pools.all.filter((c) => !excluded.has(normalizeTitle(c.title))).length
      : null;
    if (mood && count === 5 && (poolLeft ?? 0) < MIN_STRONG_POOL) {
      console.warn("[slots] weak pool — the AI search runs", {
        kind,
        lane,
        concepts: concepts.length,
        reference: !!reference,
        pool: pools.all?.length ?? 0,
        left: poolLeft,
        min: MIN_STRONG_POOL,
      });
      return Response.json({ ok: false, reason: "weak_pool" }, { status: 200 });
    }

    const near = refNeighbors(steering, (ref) => neighborPool(ref, laneIds, floorFor(lane), pools));
    const picks = assemble({
      recipe,
      pools,
      neighbors: near.list,
      excluded,
      count,
      only:
        count === 1
          ? (only ?? (recipe === "none" ? "popular" : "neighbor"))
          : undefined,
    });

    // S24a — each pick's ref: the web it came from, else the closest by
    // genre. Lines: one call per ref, started the moment the picks exist,
    // beside the bundle reads (S16), so the set completes in parse + pools
    // + writer, not their sum.
    const refOf = new Map<number, LoadedGoTo>();
    for (const p of picks) {
      const r = closestRef(p, steering, near.from.get(p.id) ?? null);
      if (r) refOf.set(p.id, r);
    }
    // S36 (charter §2.14) — `lines: false`: a title the person named
    // steers these picks, but the comparison starts off, so no writer runs
    // and every card keeps its TMDb synopsis. Compare to adds the lines.
    const writeLines = body?.lines !== false;
    const linesP = writeLines
      ? linesByRef({
          clientId,
          groups: steering.map((ref) => ({ ref, cards: picks.filter((p) => refOf.get(p.id) === ref) })),
          taste,
          lane,
        })
      : Promise.resolve(new Map<number, { line: string; ref: string }>());

    // S16 — each pick's TMDb bundle, for the card's facts (S15's
    // "2h 10m • on Netflix"). Hang protection only: a pick whose bundle
    // hasn't answered by then ships without facts, named in the log.
    let factsMissed = 0;
    const bundles = await Promise.all(
      picks.map((p) =>
        Promise.race([
          loadMediaBundle(p.kind, p.id).catch(() => null),
          new Promise<null>((r) => setTimeout(() => r(null), BUNDLE_WAIT_MS)),
        ]).then((b) => {
          if (!b) factsMissed++;
          return b;
        }),
      ),
    );
    if (factsMissed > 0) {
      console.warn("[slots] facts missing — cards ship without them", {
        kind,
        missed: factsMissed,
      });
    }
    const cardsMs = Date.now() - started;

    const cardFor = (p: (typeof picks)[number], i: number, line?: { line: string; ref: string }) => {
      const b = bundles[i];
      return {
        title: p.title,
        year: p.year,
        tmdbId: p.id,
        kind: p.kind,
        genreIds: p.genreIds ?? [],
        genre: genreLine(p.genreIds ?? []),
        slot: p.slot,
        short: line ? leadLine(line.line) : shortSynopsis(p.overview),
        long: p.overview,
        vsGoTo: line ? line.ref : null,
        facts: b ? [b.commitment, whereOf(b)].filter((f): f is string => !!f) : [],
        // S17 — the poster thumbnail: the bundle's, else the pool row's.
        posterPath: b?.posterPath ?? p.posterPath ?? null,
      };
    };
    const cards = picks.map((p, i) => cardFor(p, i));
    const head = {
      ok: true,
      recipe,
      steer: steer ? steer.name : null,
      order: order.map((g) => g.name),
    };

    const logSet = (lines: Map<number, { line: string; ref: string }>) => {
      console.info("[slots]", {
        kind,
        lane,
        refiner: refiner
          ? refiner.kind === "tone"
            ? refiner.vibe
            : refiner.kind === "era"
              ? refiner.era
              : "short"
          : null,
        recipe,
        mood: mood ? { concepts: concepts.length, reference: !!reference, pool: pools.all?.length ?? 0, left: poolLeft } : null,
        goTos: goTos.length,
        refs: refs.length,
        steering: steering.length,
        steer: steer?.name ? "yes" : "no",
        standalone: !writeLines,
        nearestScore: scores[0] ?? null,
        excluded: excluded.size,
        shipped: cards.length,
        slots: cards.map((r) => r.slot),
        lines: lines.size,
        cardsMs,
        ms: Date.now() - started,
      });
      if (cards.length < count) {
        console.warn("[slots] short set — pools ran dry after exclusions", {
          kind,
          lane,
          shipped: cards.length,
          count,
        });
      }
    };

    // S16 — early paint: the cards as soon as they exist, then the
    // lines. One NDJSON line each: { type: "cards" }, { type: "lines" }.
    if (body?.stream === "ndjson") {
      const enc = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(ctrl) {
          const send = (o: unknown) => ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
          send({ type: "cards", ...head, reks: cards, linesPending: writeLines && steering.length > 0 && cards.length > 0 });
          const lines = await linesP;
          send({
            type: "lines",
            lines: picks
              .map((p) => ({ tmdbId: p.id, line: lines.get(p.id) }))
              .filter((l): l is { tmdbId: number; line: { line: string; ref: string } } => !!l.line)
              .map((l) => ({ tmdbId: l.tmdbId, short: leadLine(l.line.line), vsGoTo: l.line.ref })),
          });
          logSet(lines);
          ctrl.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    const lines = await linesP;
    logSet(lines);
    return Response.json(
      { ...head, reks: picks.map((p, i) => cardFor(p, i, lines.get(p.id))) },
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

// S13a — the dev-only provider override and diagnostics (src/lib/llm.ts);
// a pass-through on production.
export async function POST(req: Request) {
  return withLlmContext(req, () => handlePost(req));
}
