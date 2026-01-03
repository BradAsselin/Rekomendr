// app/api/recs/route.ts
import { NextResponse } from "next/server";

import { MOVIE_REKS } from "../../../src/data/pools/movies";
import { TV_REKS } from "../../../src/data/pools/tv";
import { BOOK_REKS } from "../../../src/data/pools/books";
import { WINE_REKS } from "../../../src/data/pools/wine";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = (url.searchParams.get("category") || "Movies").toLowerCase();

  const pool =
    raw === "tv" ? TV_REKS :
    raw === "books" ? BOOK_REKS :
    raw === "wine" ? WINE_REKS :
    MOVIE_REKS;

  // ✅ return array (engine expects Rek[])
  return NextResponse.json(pool);
}
