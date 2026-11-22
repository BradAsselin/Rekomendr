// app/api/covers/route.ts — S42: book cards' covers and authors
// (docs/2026-11-22_books_card_launch.md), from Open Library through
// src/lib/openLibrary.ts.
//
//   POST { items: [{ title, author?, isbn?, year? }] }   (at most 12)
//   → { ok: true, covers: [{ title, coverUrl, author }] }
//
// Read-only and keyless. Only the book's title, author and ISBN leave the
// server (the year only picks between same-titled editions here). A title
// that doesn't answer in time comes back with nulls: its card keeps the
// poster placeholder.

import { lookupBook, type BookQuery } from "../../../src/lib/openLibrary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ITEMS = 12;

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null);
  const items: BookQuery[] = (Array.isArray(body?.items) ? body.items : [])
    .map((t: any) => ({
      title: str(t?.title, 300),
      author: str(t?.author, 200),
      isbn: str(t?.isbn, 20),
      year: Number.isInteger(t?.year) ? (t.year as number) : null,
    }))
    .filter((t: { title: string | null }) => !!t.title)
    .slice(0, MAX_ITEMS);
  if (items.length === 0) return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });

  const covers = await Promise.all(
    items.map(async (q) => {
      const r = await lookupBook(q).catch(() => ({ coverUrl: null, author: null }));
      return { title: q.title, coverUrl: r.coverUrl, author: r.author };
    })
  );
  const hits = covers.filter((c) => c.coverUrl).length;
  if (hits < covers.length) console.info("[covers] no cover", { asked: covers.length, hits });
  return Response.json({ ok: true, covers });
}
