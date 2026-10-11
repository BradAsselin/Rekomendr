// app/api/verify/titles/route.ts
// S1.5 — the real-title guard's door for the SEARCH lane.
//
// Why a route: buildAIPrompt and generateAIReks run client-side (charter
// §3.10), so the search, more-like-this and search-backfill paths live in
// the browser — and TMDB_API_KEY must never go there. The engine posts
// the titles it is about to ship; this route answers which of them exist.
//
// The snap lane does NOT use this route: /api/reksnap is already server
// code and calls verifyTitles directly, one less hop.
//
// Read-only, no secrets returned, and the ANCHOR is only ever logged —
// it is here so the [fake-title] line can name which search or snap
// produced the fiction.

import {
  verifyTitles,
  logFakeTitles,
  type VerifyItem,
  type TitleKind,
} from "../../../../src/lib/tmdbVerify";
import { runEnvCheck } from "../../../../src/lib/envCheck";

export const runtime = "nodejs";

runEnvCheck();

// Bounds. The engine's largest ask is 12 titles (sizedAsk's ceiling), so
// 20 is headroom without being an open proxy.
const MAX_ITEMS = 20;
const MAX_TITLE_LEN = 300;

const KINDS: TitleKind[] = ["movie", "tv", "any"];
const PATHS = ["search", "mlt", "search-backfill"] as const;
type LoggedPath = (typeof PATHS)[number];

export async function POST(req: Request): Promise<Response> {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  const rawItems = (body as { items?: unknown })?.items;
  if (!Array.isArray(rawItems)) {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  const items: VerifyItem[] = [];
  for (const raw of rawItems.slice(0, MAX_ITEMS)) {
    const title = (raw as { title?: unknown })?.title;
    if (typeof title !== "string") continue;
    const trimmed = title.trim();
    if (!trimmed || trimmed.length > MAX_TITLE_LEN) continue;
    const rawYear = (raw as { year?: unknown })?.year;
    const rawKind = (raw as { kind?: unknown })?.kind;
    items.push({
      title: trimmed,
      year:
        typeof rawYear === "number" && Number.isFinite(rawYear)
          ? Math.round(rawYear)
          : null,
      kind: KINDS.includes(rawKind as TitleKind) ? (rawKind as TitleKind) : "any",
    });
  }

  const rawAnchor = (body as { anchor?: unknown })?.anchor;
  const anchor =
    typeof rawAnchor === "string" && rawAnchor.trim()
      ? rawAnchor.trim().slice(0, MAX_TITLE_LEN)
      : "(no anchor)";
  const rawPath = (body as { path?: unknown })?.path;
  const path: LoggedPath = PATHS.includes(rawPath as LoggedPath)
    ? (rawPath as LoggedPath)
    : "search";
  const rawCategory = (body as { category?: unknown })?.category;
  const category =
    typeof rawCategory === "string" ? rawCategory.trim().slice(0, 100) : undefined;

  const { enabled, verdicts } = await verifyTitles(items);

  logFakeTitles({
    path,
    anchor,
    category,
    dropped: verdicts
      .filter((v) => !v.resolved)
      .map((v) => ({ title: v.title, reason: v.reason })),
    kept: verdicts.filter((v) => v.resolved).length,
    enabled,
  });

  return Response.json({ enabled, verdicts }, { status: 200 });
}
