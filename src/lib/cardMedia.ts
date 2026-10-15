// src/lib/cardMedia.ts — server-only. S4: a shared card's live media.
//
// The card is permanent; where a title streams is not. So the synopsis
// stays fixed in the snapshot, and the where-to-watch answer is refreshed
// when the card is opened (or its link preview fetched):
//
//   * first time (a card shared before S4, or never opened): resolve the
//     title on TMDb by name ONCE, then store its id, poster, trailer and
//     providers on the row — no reopen ever re-guesses by name again;
//   * stored answer younger than PROVIDERS_TTL_MS → use it (the cache);
//   * older → ask TMDb now and store the new answer;
//   * TMDb fails → show the stored answer (the fallback), say so in the log.
//
// The row's `providers` column is both the cache and the fallback: it only
// ever holds the last GOOD answer. Plain TMDb reads — no model call, so the
// public page's import graph still never reaches OpenAI (validate-s2).
//
// Tripwire (§3.7): every path logs `[card-providers] <outcome>`.
if (typeof window !== "undefined") {
  throw new Error("cardMedia.ts was imported in a browser bundle.");
}
import type { SupabaseClient } from "@supabase/supabase-js";
import { MEDIA_CATEGORIES } from "./categoryGates";
import {
  fetchCardMedia,
  mediaConfigured,
  resolveSavedTitle,
  type CardMedia,
  type MediaKind,
  type WatchInfo,
} from "./tmdbMedia";
import { getSnapshotStore, type SnapshotRow } from "./anchorSnapshots";

// Short enough that a card reopened tomorrow reflects a title that moved
// services today; long enough that a card going round a group chat costs
// one TMDb call, not one per tap. Build plan: "about 6–24 h".
export const PROVIDERS_TTL_MS = 12 * 60 * 60 * 1000;

export type CardMediaView = {
  posterPath: string | null;
  trailerUrl: string | null;
  watch: WatchInfo | null;
  availability: string | null;
  // How this answer was reached — logged, and asserted by the harness.
  source: "fresh" | "cached" | "fallback" | "none";
};

type StoredProviders = { watch: WatchInfo | null; availability: string | null };

const isMediaRow = (row: SnapshotRow) =>
  MEDIA_CATEGORIES.has(row.item_category.trim().toLowerCase());

function storedOf(row: SnapshotRow): StoredProviders | null {
  const p = row.providers as Partial<StoredProviders> | null | undefined;
  if (!p || typeof p !== "object") return null;
  const watch = p.watch && typeof p.watch === "object" && typeof p.watch.link === "string" ? p.watch : null;
  return { watch, availability: typeof p.availability === "string" ? p.availability : null };
}

function viewOf(row: SnapshotRow, source: CardMediaView["source"]): CardMediaView {
  const stored = storedOf(row);
  return {
    posterPath: row.poster_path ?? null,
    trailerUrl: row.trailer_url ?? null,
    watch: stored?.watch ?? null,
    availability: stored?.availability ?? null,
    source,
  };
}

export async function cardMedia(
  row: SnapshotRow,
  opts: { now?: number; store?: SupabaseClient | null } = {}
): Promise<CardMediaView | null> {
  if (!isMediaRow(row)) return null;
  const now = opts.now ?? Date.now();
  const at = row.providers_at ? Date.parse(row.providers_at) : NaN;
  if (row.media_id && Number.isFinite(at) && now - at < PROVIDERS_TTL_MS) {
    console.info("[card-providers] cached", { id: row.id, ageMin: Math.round((now - at) / 60000) });
    return viewOf(row, "cached");
  }
  if (!mediaConfigured()) {
    console.warn("[card-providers] fallback stored — tmdb key missing", { id: row.id });
    return viewOf(row, row.providers ? "fallback" : "none");
  }

  let kind: MediaKind | null = row.media_kind ?? null;
  let mediaId: number | null = row.media_id ?? null;
  if (!kind || !mediaId) {
    const resolved = await resolveSavedTitle(row.item_name, row.item_category).catch(() => null);
    if (!resolved) {
      console.warn("[card-providers] fallback stored — title not resolved", { id: row.id });
      return viewOf(row, row.providers ? "fallback" : "none");
    }
    kind = resolved.kind;
    mediaId = resolved.id;
  }

  const fresh: CardMedia | null = await fetchCardMedia(kind, mediaId).catch(() => null);
  if (!fresh) {
    console.warn("[card-providers] fallback stored — tmdb refresh failed", { id: row.id, kind, mediaId });
    return viewOf(row, row.providers ? "fallback" : "none");
  }

  const update = {
    media_kind: kind,
    media_id: mediaId,
    poster_path: fresh.posterPath,
    trailer_url: fresh.trailerUrl,
    providers: { watch: fresh.watch, availability: fresh.availability } satisfies StoredProviders,
    providers_at: new Date(now).toISOString(),
  };
  // The write is the cache, never the answer: a failed store still shows
  // the fresh providers, and the next open simply refreshes again.
  try {
    const store = opts.store !== undefined ? opts.store : await getSnapshotStore();
    if (store) {
      const { error } = await store.from("anchor_snapshots").update(update).eq("id", row.id);
      if (error) console.warn("[card-providers] refreshed but not stored", { id: row.id, code: error.code });
    }
  } catch (err) {
    console.warn("[card-providers] refreshed but not stored", {
      id: row.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  console.info("[card-providers] refreshed", {
    id: row.id,
    kind,
    mediaId,
    stream: fresh.watch?.stream.length ?? 0,
    rentBuy: fresh.watch?.rentBuy.length ?? 0,
    firstLookup: !row.media_id,
  });
  return {
    posterPath: fresh.posterPath,
    trailerUrl: fresh.trailerUrl,
    watch: fresh.watch,
    availability: fresh.availability,
    source: "fresh",
  };
}

// Hang protection for public surfaces (§2.11): a slow TMDb must never hold
// a card or a link preview open. Past the budget, the stored answer shows.
export async function cardMediaWithin(
  row: SnapshotRow,
  budgetMs: number
): Promise<CardMediaView | null> {
  if (!isMediaRow(row)) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<CardMediaView>((resolve) => {
    timer = setTimeout(() => {
      console.warn("[card-providers] fallback stored — over budget", { id: row.id, budgetMs });
      resolve(viewOf(row, row.providers ? "fallback" : "none"));
    }, budgetMs);
  });
  try {
    return await Promise.race([cardMedia(row).catch(() => viewOf(row, "fallback")), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
