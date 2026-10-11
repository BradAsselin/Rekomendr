// app/api/prefs/route.ts
// S2b user_likes residual (Option 2): the browser no longer reads
// user_likes directly — taste prefs come through this server route, so
// Block B can drop anon SELECT on user_likes without breaking search.
// Service-role read running exactly the query loadPrefsForCategory ran
// client-side; writes (recordLike) are untouched.
//
// S1 (staleness): this route is also the Shortlist strip's only data
// source — the charter's "no new schema; reads through the existing
// /api/prefs route". It now returns, alongside the two title arrays it
// always returned:
//   - watchedTitles: the new 'watched' signal (permanent frontier
//     exclusion, and the one thing a liked title can never come back
//     from). Empty until the migration in docs/sql/s1-watched-signal.sql
//     runs — the route reads whatever rows exist and never assumes.
//   - shortlist:     liked-but-not-watched, newest first, WITH the like's
//     timestamp, because the resurfacing marker ("You liked this in
//     July.") cannot be written without it.

import type { SupabaseClient } from "@supabase/supabase-js";
import { runEnvCheck } from "../../../src/lib/envCheck";

export const runtime = "nodejs";

// Boot-time sanity check (server log only, hostnames only — never keys or
// tokens): likes are WRITTEN by the browser to NEXT_PUBLIC_SUPABASE_URL's
// project, but this route READS via SUPABASE_URL. If those name different
// projects, prefs come back empty from the wrong project's table — the
// same silent split that hid dislike shading until 2026-07-19. The check
// itself now lives in src/lib/envCheck.ts and covers every pair.
runEnvCheck();

// Same guarded dynamic import as the merge route (supabaseServer throws
// at import time on missing env, so it is never imported statically): a
// missing secret means empty prefs — it can never 500 the search flow.
let serverClientPromise: Promise<SupabaseClient | null> | null = null;
const getServerClient = (): Promise<SupabaseClient | null> => {
  if (!serverClientPromise) {
    serverClientPromise =
      process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
        ? import("../../../src/lib/supabaseServer")
            .then((m) => m.supabaseServer)
            .catch(() => null)
        : Promise.resolve(null);
  }
  return serverClientPromise;
};

// Mirrors cleanClientId in the merge route: junk means no prefs, not an
// error page.
const cleanClientId = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return id.length >= 8 && id.length <= 64 ? id : null;
};

// CATEGORY CASING (S1). Rows have been written under more than one casing
// for the same category — the UI label ("Movies") that ResultsV4's
// recordLike sends, and the lowercase vertical key ("movies") other
// surfaces carry. An `.eq()` match silently returns only one casing's
// worth of a user's taste memory, and the Shortlist strip is the first
// surface where that shows up as a visibly empty band instead of an
// invisible gap in the avoid-list. The read is now case-insensitive.
//
// `ilike` with no wildcards IS an exact case-insensitive match in
// Postgres — but `%` and `_` inside the VALUE would be wildcards, and the
// category value arrives from the request body, so escape them (and the
// escape character itself) before it goes into the pattern. Without this,
// a category of "%" would match every row for that client.
const likePattern = (category: string): string =>
  category.replace(/([\\%_])/g, "\\$1");

type PrefsRow = {
  title: string;
  action: string;
  year: number | null;
  created_at: string | null;
};

export type ShortlistEntry = {
  title: string;
  year: number | null;
  // ISO timestamp of the like this entry came from — the marker copy
  // ("You liked this in July.") is rendered from it client-side.
  likedAt: string | null;
};

const EMPTY_PREFS = {
  likedTitles: [] as string[],
  dislikedTitles: [] as string[],
  watchedTitles: [] as string[],
  shortlist: [] as ShortlistEntry[],
};

// The read window. Was 100. The 'watched' rows S1 adds land in the SAME
// window as likes and dislikes, so at 100 a heavy user's oldest
// exclusions would start falling out of the drop-set that charter §2.12
// calls a guarantee — and a guarantee that truncates is not one. 300
// keeps the response small (titles, years, timestamps) while giving the
// new signal type room to grow. The prompt's avoid-list cap (100, in
// buildAIPrompt) is unchanged: that one is pressure, and it is supposed
// to be bounded.
const READ_LIMIT = 300;

const LIKE_ACTIONS = new Set(["like", "save", "more_like_this"]);

export async function POST(req: Request): Promise<Response> {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const clientId = cleanClientId((body as { clientId?: unknown })?.clientId);
  const rawCategory = (body as { category?: unknown })?.category;
  const category = typeof rawCategory === "string" ? rawCategory.trim() : "";
  if (!clientId || !category || category.length > 100) {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  const server = await getServerClient();
  if (!server) {
    return Response.json(EMPTY_PREFS, { status: 200 });
  }

  const { data, error } = await server
    .from("user_likes")
    .select("title, action, year, created_at")
    .eq("client_id", clientId)
    .ilike("category", likePattern(category))
    .order("created_at", { ascending: false })
    .limit(READ_LIMIT);

  if (error || !data) {
    if (error) console.warn("[prefs] read failed:", error.message);
    return Response.json(EMPTY_PREFS, { status: 200 });
  }

  const rows = data as PrefsRow[];

  const liked = new Set<string>();
  const disliked = new Set<string>();
  const watched = new Set<string>();

  // Rows arrive newest-first, so the FIRST row seen for a title is its
  // newest like — the one the marker should quote ("You liked this in
  // July", not the first time it was ever liked).
  const newestLike = new Map<string, ShortlistEntry>();

  for (const row of rows) {
    if (!row?.title) continue;
    const key = row.title.trim().toLowerCase();

    if (LIKE_ACTIONS.has(row.action)) {
      liked.add(row.title);
      if (!newestLike.has(key)) {
        newestLike.set(key, {
          title: row.title,
          year: typeof row.year === "number" ? row.year : null,
          likedAt: row.created_at ?? null,
        });
      }
    } else if (row.action === "dislike") {
      disliked.add(row.title);
    } else if (row.action === "watched") {
      watched.add(row.title);
    }
  }

  // THE SHORTLIST: liked, and not since watched, and not since disliked.
  // Newest first — the charter's order, and the order the strip renders
  // in, so the client never re-sorts. A title thumbed down after being
  // liked is a reversal, not a shortlist entry; a watched title has left
  // the strip permanently (that is the whole point of the signal).
  const watchedKeys = new Set(
    Array.from(watched).map((t) => t.trim().toLowerCase())
  );
  const dislikedKeys = new Set(
    Array.from(disliked).map((t) => t.trim().toLowerCase())
  );
  const shortlist = Array.from(newestLike.entries())
    .filter(([key]) => !watchedKeys.has(key) && !dislikedKeys.has(key))
    .map(([, entry]) => entry);

  // The TITLE arrays are reversed so they read oldest→newest. Consumers
  // index recency from the TAIL — the prompt's "Recent likes" slice(-10),
  // the avoid-list tiering's newest-first reversal, ResultsV4 appending
  // session marks last — so the tail must be the newest. `shortlist` is
  // the deliberate exception and stays newest-FIRST: it is a render
  // order, not an avoid-list, and the charter specifies it.
  return Response.json(
    {
      likedTitles: Array.from(liked).reverse(),
      dislikedTitles: Array.from(disliked).reverse(),
      watchedTitles: Array.from(watched).reverse(),
      shortlist,
    },
    { status: 200 }
  );
}
