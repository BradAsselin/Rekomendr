// app/api/gotos/route.ts — S12: go-tos for movies, shows and books
// (docs/s12-gotos-steer-plan.md). Wine's one go-to stays in wine_marks
// (/api/wine), exactly as S8 built it.
//
// One service-role route over public.go_tos and public.goto_events (RLS on,
// zero client policies, anon/authenticated revoked — docs/sql/s12-go-tos.sql):
//
//   state  → the live go-tos, newest first
//   star   → a new go-to (many per category). Screens are looked up on
//            TMDb — by id when the card knows it, else by name — so the
//            row carries TMDb's id and genres (the nearest-go-to match and
//            the recommendation web need them). A lookup miss still stars:
//            the go-to just has no web, and recency stands in for nearness.
//   unstar → clears the live row (kept: history, not trash)
//   event  → one count for /api/stats (no names, no text)
//
// The client keeps a localStorage mirror for instant UI (src/lib/goTos.ts);
// this table is what survives a cleared browser on the same anonymous id.
// No OpenAI call here, so no api_usage cap: every write is one bounded row.
// Fail-soft and named: a missing table answers { ok:false,
// reason:"migration_pending" } and logs it.

import { runEnvCheck } from "../../../src/lib/envCheck";
import { cleanClientId, getSnapshotStore } from "../../../src/lib/anchorSnapshots";
import { logDbError } from "../../../src/lib/dbError";
import {
  loadMediaBundle,
  mediaConfigured,
  resolveSnappedTitle,
  type MediaKind,
} from "../../../src/lib/tmdbMedia";
import { goToCategoryFor, GOTO_EVENT_KINDS, type GoToCategory } from "../../../src/lib/goToCategory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

runEnvCheck();

const MAX_LIVE = 200;

const text = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
const yearOf = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= 1870 && v <= 2100 ? v : null;

// S22 — "permission denied for table go_tos" names the table too, so the
// old name-in-message test called a missing GRANT migration_pending.
const failure = (where: string, error: { code?: string; message?: string }) => {
  const reason = logDbError(`go-tos ${where}`, error);
  return Response.json({ ok: false, reason }, { status: 200 });
};

type Row = {
  id: string;
  category: GoToCategory;
  name: string;
  year: number | null;
  tmdb_kind: MediaKind | null;
  tmdb_id: number | null;
  genre_ids: number[] | null;
  created_at: string;
};

const asGoTo = (r: Row) => ({
  id: r.id,
  category: r.category,
  name: r.name,
  year: r.year ?? null,
  tmdbKind: r.tmdb_kind ?? null,
  tmdbId: r.tmdb_id ?? null,
  genreIds: Array.isArray(r.genre_ids) ? r.genre_ids : [],
  at: r.created_at,
});

// Screens → TMDb's own title, year, id and genres. By id first (a card
// that came from TMDb knows it), else the snapped-name rule.
async function lookUp(
  category: GoToCategory,
  name: string,
  year: number | null,
  kindIn: unknown,
  idIn: unknown
): Promise<{ name: string; year: number | null; kind: MediaKind; id: number; genreIds: number[] } | null> {
  if (category === "books" || !mediaConfigured()) return null;
  const kind: MediaKind = category === "movies" ? "movie" : "tv";
  let id = Number(idIn);
  let k: MediaKind = kindIn === "movie" || kindIn === "tv" ? kindIn : kind;
  if (!Number.isInteger(id) || id <= 0) {
    const hit = await resolveSnappedTitle(year ? `${name} ${year}` : name, kind);
    if (!hit) return null;
    id = hit.id;
    k = hit.kind;
  }
  const b = await loadMediaBundle(k, id);
  return b ? { name: b.title, year: b.year, kind: b.kind, id: b.id, genreIds: b.genreIds } : null;
}

export async function POST(req: Request): Promise<Response> {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const clientId = cleanClientId(body?.clientId);
  const action = body?.action;
  if (!clientId || typeof action !== "string") {
    return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const db = await getSnapshotStore();
  if (!db) {
    console.warn("[go-tos] unavailable — supabase unconfigured");
    return Response.json({ ok: false, reason: "unavailable" }, { status: 200 });
  }

  if (action === "state") {
    const r = await db
      .from("go_tos")
      .select("id, category, name, year, tmdb_kind, tmdb_id, genre_ids, created_at")
      .eq("client_id", clientId)
      .is("cleared_at", null)
      .order("created_at", { ascending: false })
      .limit(MAX_LIVE);
    if (r.error) return failure("state", r.error);
    return Response.json({ ok: true, goTos: (r.data as Row[]).map(asGoTo) }, { status: 200 });
  }

  if (action === "event") {
    const kind = body?.kind;
    if (typeof kind !== "string" || !GOTO_EVENT_KINDS.has(kind)) {
      return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
    }
    const raw = typeof body?.category === "string" ? body.category.trim().toLowerCase() : "";
    const category = raw === "wine" ? "wine" : goToCategoryFor(raw);
    const repeats =
      typeof body?.repeats === "number" && Number.isInteger(body.repeats)
        ? Math.max(0, Math.min(50, body.repeats))
        : 0;
    const ins = await db.from("goto_events").insert({ client_id: clientId, kind, category, repeats });
    if (ins.error) return failure("event", ins.error);
    // A repeat reaching the screen breaks a guarantee: say so in the log.
    if (repeats > 0) console.warn("[go-tos] REPEAT shown", { category, repeats });
    return Response.json({ ok: true }, { status: 200 });
  }

  const category = goToCategoryFor(body?.item?.category ?? body?.category);
  const name = text(body?.item?.name ?? body?.name, 200);
  if (!category || !name) {
    return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  if (action === "unstar") {
    const upd = await db
      .from("go_tos")
      .update({ cleared_at: new Date().toISOString() })
      .eq("client_id", clientId)
      .eq("category", category)
      .ilike("name", name.replace(/([\\%_])/g, "\\$1"))
      .is("cleared_at", null);
    if (upd.error) return failure("unstar", upd.error);
    console.info("[go-tos] unstarred", { category });
    return Response.json({ ok: true }, { status: 200 });
  }

  if (action === "star") {
    const year = yearOf(body?.item?.year);
    let hit: Awaited<ReturnType<typeof lookUp>> = null;
    try {
      hit = await lookUp(category, name, year, body?.item?.tmdbKind, body?.item?.tmdbId);
    } catch (err) {
      console.warn("[go-tos] TMDb lookup threw — starred without a web", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (category !== "books" && !hit) {
      console.warn("[go-tos] TMDb lookup missed — starred without a web", { category });
    }
    // The card's own name is what the person starred; TMDb's year and
    // genres ride along. A second star on a live go-to is a no-op.
    const row = {
      client_id: clientId,
      category,
      name,
      year: year ?? hit?.year ?? null,
      tmdb_kind: hit?.kind ?? null,
      tmdb_id: hit?.id ?? null,
      genre_ids: hit?.genreIds ?? null,
    };
    const ins = await db
      .from("go_tos")
      .insert(row)
      .select("id, category, name, year, tmdb_kind, tmdb_id, genre_ids, created_at");
    if (ins.error && ins.error.code === "23505") {
      return Response.json({ ok: true, already: true }, { status: 200 });
    }
    if (ins.error) return failure("star", ins.error);
    console.info("[go-tos] starred", { category, tmdb: !!hit });
    return Response.json({ ok: true, goTo: asGoTo((ins.data as Row[])[0]) }, { status: 200 });
  }

  return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
}
