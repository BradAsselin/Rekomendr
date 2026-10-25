// app/api/mood/route.ts — S13c: voice mood input v1, the parser
// (docs/s13-opus-voice-plan.md, B2).
//
// POST { clientId, transcript, barCategory, goTos: { movies, tv, wine } }
//   → { ok, moodId, category, lane, refiner, keywords, unresolved, goTo,
//       price, mapped, closest }
//
// One model call (step "mood", src/lib/llm.ts) maps the words onto the
// app's existing vocabulary; validateMood() keeps only what that
// vocabulary knows. A named title becomes a steer: a starred go-to as is,
// any other screen title looked up on TMDb so it can steer this one
// request (never stored as a go-to).
//
// Never an error for a mood that doesn't map: the answer says mapped:false
// with the closest lanes, and the page shows the words and those chips.
// The transcript TEXT is stored (voice_moods) — never audio. A missing
// table is named (migration_pending) and the parse still answers.
// Capped with the search route's key ("openai", 300/day): a voice search
// is a search.
//
// S16 — `source: "typed"`: a mood typed on the Movies/TV bar takes the
// same parse (docs/s16-watched-search-plan.md, Part B). It is not stored
// in voice_moods (the voice readout counts what people SAID), and the
// log names the source.
//
// S19a — `keywords`: the concrete ideas in the words as TMDb keyword ids,
// one OR group per concept (docs/s19-fast-moods-plan.md, Part A).
// `unresolved` names the tags TMDb doesn't know by that exact name; the
// client's gate sends such a mood to the AI search.

import { runEnvCheck } from "../../../src/lib/envCheck";
import { capGate } from "../../../src/lib/apiUsage";
import { cleanClientId, getSnapshotStore } from "../../../src/lib/anchorSnapshots";
import { logDbError } from "../../../src/lib/dbError";
import { llmJson, withLlmContext } from "../../../src/lib/llm";
import { openAIFailureResponse } from "../../../src/lib/openaiFailure";
import { mediaConfigured, resolveSnappedTitle } from "../../../src/lib/tmdbMedia";
import { normalizeTitle } from "../../../src/lib/tmdbVerify";
import { buildMoodPrompt, buildMoodUser, categoryFromWords, validateMood } from "../../../src/lib/voiceMood";
import { conceptOf, resolveConcepts, type ResolvedConcept, type ResolvedTags } from "../../../src/lib/tmdbKeywords";
import { tagEchoes } from "../../../src/lib/typedMoodGate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

runEnvCheck();

const names = (v: unknown, max = 40): string[] =>
  Array.isArray(v)
    ? v.filter((n): n is string => typeof n === "string" && !!n.trim()).map((n) => n.trim().slice(0, 120)).slice(0, max)
    : [];

const DB_CATEGORY: Record<string, string> = { Movies: "movies", "TV Shows": "tv", Books: "books", Wine: "wine" };

async function handlePost(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const clientId = cleanClientId(body?.clientId);
  const capped = await capGate(clientId, "openai");
  if (capped) return capped;

  const transcript = typeof body?.transcript === "string" ? body.transcript.trim().slice(0, 300) : "";
  if (!transcript) return Response.json({ error: "Missing transcript" }, { status: 400 });
  const barCategory = typeof body?.barCategory === "string" ? body.barCategory : "Movies";
  const source: "voice" | "typed" = body?.source === "typed" ? "typed" : "voice";
  const goTos = {
    movies: names(body?.goTos?.movies),
    tv: names(body?.goTos?.tv),
    wine: typeof body?.goTos?.wine === "string" && body.goTos.wine.trim() ? body.goTos.wine.trim().slice(0, 120) : null,
  };

  let parsed: any = null;
  let provider: string | null = null;
  let model: string | null = null;
  const started = Date.now();
  // Words that name a category decide it ("a horror movie" on the Wine
  // bar is a movie); the model then picks lanes inside that category.
  const fromWords = categoryFromWords(transcript, barCategory);
  try {
    const r = await llmJson({
      step: "mood",
      temperature: 0,
      maxTokens: 350,
      system: buildMoodPrompt(),
      user: buildMoodUser({ transcript, barCategory: fromWords ?? barCategory, goTos }),
    });
    parsed = r.parsed;
    provider = r.result.provider;
    model = r.result.model;
  } catch (err) {
    const named = openAIFailureResponse("mood", err);
    if (named) return named;
    // Anything else: the words still show, with the bar's chips.
    console.error("[mood] parser failed — showing the words", {
      error: err instanceof Error ? err.message.slice(0, 200) : String(err),
    });
  }
  const ms = Date.now() - started;
  const mood = validateMood(parsed, barCategory, fromWords);
  const screen = mood.category === "Movies" || mood.category === "TV Shows";
  // S19a — the concepts → TMDb keyword ids, beside the go-to lookup below.
  const keywordsP: Promise<{ resolved: ResolvedTags[]; unresolved: string[] }> =
    screen && mood.keywords.length && mediaConfigured()
      ? resolveConcepts(mood.keywords)
      : Promise.resolve({ resolved: [], unresolved: mood.keywords.flatMap((c) => c.tags) });

  // A named title → a steer for screens. Starred: as is (the client has
  // its TMDb id). Not starred: TMDb, for this request only.
  let goTo: { name: string; starred: boolean; tmdbKind: "movie" | "tv" | null; tmdbId: number | null } | null = null;
  if (mood.goTo && screen) {
    const kind = mood.category === "Movies" ? "movie" : "tv";
    const starred = (kind === "movie" ? goTos.movies : goTos.tv).find(
      (n) => normalizeTitle(n) === normalizeTitle(mood.goTo!)
    );
    if (starred) {
      goTo = { name: starred, starred: true, tmdbKind: null, tmdbId: null };
    } else if (mediaConfigured()) {
      const hit = await resolveSnappedTitle(mood.goTo, "any").catch(() => null);
      if (hit) goTo = { name: hit.title, starred: false, tmdbKind: hit.kind, tmdbId: hit.id };
      else console.info("[mood] named title not on TMDb — no steer", { name: mood.goTo });
    }
  } else if (mood.goTo && mood.category === "Wine") {
    // v1: the wine go-to steers once the pick path takes moods (the VOICE
    // PR); logged so the readout shows how often people name one.
    goTo = { name: mood.goTo, starred: !!goTos.wine && normalizeTitle(goTos.wine) === normalizeTitle(mood.goTo), tmdbKind: null, tmdbId: null };
  }

  // S19a — which resolved tags may filter the pool: those that echo the
  // person's own words, never a synonym that widens past them ("caper"
  // for "heist"). A concept
  // with no echo is kept only as a named title's signature ("a show like
  // The Office" → mockumentary), and only when TMDb found the title.
  const raw = await keywordsP;
  const titleKnown = !!goTo && (goTo.starred || !!goTo.tmdbId);
  const unused: string[] = [];
  const concepts: ResolvedConcept[] = [];
  for (const c of raw.resolved) {
    const usable = c.tags;
    const echo = usable.filter((t) => tagEchoes(t.tag, transcript));
    // An exclusion that echoes the words keeps every tag the parse gave it:
    // keeping more out only narrows the pool ("gory" → gore, splatter).
    if (echo.length) concepts.push(conceptOf(c.exclude ? usable : echo, c.exclude, "words"));
    else if (titleKnown && !c.exclude && usable.length) concepts.push(conceptOf(usable, false, "title"));
    const kept = echo.length ? (c.exclude ? usable : echo) : titleKnown && !c.exclude ? usable : [];
    unused.push(...c.tags.filter((t) => !kept.includes(t)).map((t) => t.tag));
  }
  const keywords = { resolved: concepts, unresolved: raw.unresolved, unused };

  // The record: the words, what they mapped to. Fail-soft and named.
  let moodId: string | null = null;
  const store = clientId && source === "voice" ? await getSnapshotStore() : null;
  if (store && clientId) {
    const ins = await store
      .from("voice_moods")
      .insert({
        client_id: clientId,
        transcript,
        bar_category: DB_CATEGORY[barCategory] ?? null,
        category: DB_CATEGORY[mood.category] ?? null,
        chip: mood.lane?.label ?? null,
        refiner: mood.refiner,
        go_to: goTo?.name ?? null,
        price: mood.price,
        mapped: mood.mapped,
        provider,
        model,
        ms,
      })
      .select("id")
      .maybeSingle();
    if (ins.error) {
      logDbError("mood record", ins.error);
    } else {
      moodId = (ins.data as { id?: string } | null)?.id ?? null;
    }
  }

  console.info("[mood] parsed", {
    source,
    bar: barCategory,
    category: mood.category,
    lane: mood.lane?.label ?? null,
    refiner: mood.refiner,
    goTo: goTo ? (goTo.starred ? "starred" : goTo.tmdbId ? "tmdb" : "named") : null,
    keywords: keywords.resolved.map((c) => (c.exclude ? "-" : "") + (c.role === "title" ? "title:" : "") + c.tags.join("|")),
    unresolved: keywords.unresolved,
    unused: keywords.unused,
    price: mood.price,
    mapped: mood.mapped,
    provider,
    ms,
  });

  return Response.json({
    ok: true,
    moodId,
    transcript,
    category: mood.category,
    lane: mood.lane,
    refiner: mood.refiner,
    keywords: keywords.resolved,
    unresolved: keywords.unresolved,
    goTo,
    price: mood.price,
    mapped: mood.mapped,
    closest: mood.closest,
  });
}

export async function POST(req: Request) {
  return withLlmContext(req, () => handlePost(req));
}
