// src/lib/bookCard.ts — server-only. S43: a shared book card's cover and
// author (docs: Brad's S42 follow-ups, 2026-11-22), the movie poster's
// pattern (src/lib/cardMedia.ts): looked up on Open Library by the card's
// title ONCE, then stored on the row, so the card never re-guesses and
// never changes after that.
//
//   poster_path  ← the cover's full Open Library URL (null: none found)
//   providers    ← { book: { author } }  (a book row has no providers;
//                  this records that the lookup ran, and its answer)
//
// The card's text (name, description) is never touched (§2.13). A slow or
// failed lookup shows the card without them and tries again next open.
// Plain Open Library reads: no model call on the public page.
if (typeof window !== "undefined") {
  throw new Error("bookCard.ts was imported in a browser bundle.");
}
import type { SupabaseClient } from "@supabase/supabase-js";
import { lookupBook } from "./openLibrary";
import { getSnapshotStore, type SnapshotRow } from "./anchorSnapshots";

export type BookView = { coverUrl: string | null; author: string | null; source: "stored" | "fresh" | "none" };

export const isBookRow = (row: SnapshotRow) => {
  const c = row.item_category.trim().toLowerCase();
  return c === "books" || c === "book";
};

const OL_COVER = /^https:\/\/covers\.openlibrary\.org\/b\/(id|isbn)\/[0-9A-Za-z]+-[SML]\.jpg$/;

function storedOf(row: SnapshotRow): BookView | null {
  const book = (row.providers as { book?: { author?: unknown } } | null | undefined)?.book;
  if (!book || typeof book !== "object") return null;
  const cover = typeof row.poster_path === "string" && OL_COVER.test(row.poster_path) ? row.poster_path : null;
  return { coverUrl: cover, author: typeof book.author === "string" && book.author.trim() ? book.author.trim() : null, source: "stored" };
}

export async function bookMedia(
  row: SnapshotRow,
  opts: { now?: number; store?: SupabaseClient | null } = {}
): Promise<BookView | null> {
  if (!isBookRow(row)) return null;
  const stored = storedOf(row);
  if (stored) return stored;
  const hit = await lookupBook({ title: row.item_name }).catch(() => null);
  if (!hit || !hit.found) {
    // Not stored: an outage and a missing book both try again next open.
    console.info("[card-book] no Open Library answer", { id: row.id });
    return { coverUrl: null, author: null, source: "none" };
  }
  const coverUrl = hit.coverUrl && OL_COVER.test(hit.coverUrl) && hit.coverUrl.length <= 200 ? hit.coverUrl : null;
  const author = hit.author ? hit.author.slice(0, 200) : null;
  try {
    const store = opts.store !== undefined ? opts.store : await getSnapshotStore();
    if (store) {
      // Only a row that has no answer yet: the first answer is the card's.
      const { error } = await store
        .from("anchor_snapshots")
        .update({ poster_path: coverUrl, providers: { book: { author } }, providers_at: new Date(opts.now ?? Date.now()).toISOString() })
        .eq("id", row.id)
        .is("providers", null);
      if (error) console.warn("[card-book] found but not stored", { id: row.id, code: error.code });
    }
  } catch (err) {
    console.warn("[card-book] found but not stored", { id: row.id, error: err instanceof Error ? err.message : String(err) });
  }
  console.info("[card-book] stored", { id: row.id, cover: !!coverUrl, author: !!author });
  return { coverUrl, author, source: "fresh" };
}

// Hang protection (§2.11), as cardMediaWithin: past the budget the card
// renders without the cover.
export async function bookMediaWithin(row: SnapshotRow, budgetMs: number): Promise<BookView | null> {
  if (!isBookRow(row)) return null;
  const quick = storedOf(row);
  if (quick) return quick;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<BookView>((resolve) => {
    timer = setTimeout(() => resolve({ coverUrl: null, author: null, source: "none" }), budgetMs);
  });
  try {
    return await Promise.race([bookMedia(row).catch(() => ({ coverUrl: null, author: null, source: "none" as const })), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// The OG image wants the large size.
export const largeCover = (url: string) => url.replace(/-[SM]\.jpg$/, "-L.jpg");
export const isOpenLibraryCover = (url: string | null | undefined) => !!url && OL_COVER.test(url);
