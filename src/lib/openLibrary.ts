// src/lib/openLibrary.ts — S42 (docs/2026-11-22_books_card_launch.md):
// a book card's cover and author, from Open Library (free, no key, no
// account). Server side only: the lookup sends the book's title, and its
// author and ISBN when the card has them — nothing about the person (no
// cookies, no client id, a generic User-Agent naming the app).
//
//   ISBN first:  covers.openlibrary.org/b/isbn/<isbn>-M.jpg?default=false
//   then:        openlibrary.org/search.json?title=…&author=…
//
// A miss is an answer too (the card keeps the poster placeholder). Answers
// are cached in memory for the instance (hits 30 days, misses 1 day) and
// the HTTP reads go through Next's fetch cache, like the TMDb bundles.

export type BookQuery = { title: string; author?: string | null; isbn?: string | null; year?: number | null };
export type BookCover = { coverUrl: string | null; author: string | null };

const UA = "Rekomendr/1.0 (+https://www.rekomendr.ai)";
const SEARCH = "https://openlibrary.org/search.json";
const COVERS = "https://covers.openlibrary.org/b";
// Hang protection (charter §2.11): one Open Library read is ~200-800 ms.
const WAIT_MS = 4000;
const HIT_TTL = 30 * 864e5;
const MISS_TTL = 864e5;
const CACHE_MAX = 2000;

const cache = new Map<string, { at: number; value: BookCover }>();

export const normTitle = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^(the|a|an)\s+/, "")
    .replace(/[:(].*$/, "") // a subtitle or "(Book 1)" doesn't decide the match
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const cleanIsbn = (s: string | null | undefined) => {
  const v = (s ?? "").replace(/[^0-9Xx]/g, "").toUpperCase();
  return v.length === 10 || v.length === 13 ? v : null;
};

// The exact URLs a lookup reads — what leaves the server (validate-s42
// asserts nothing but the title, author and ISBN is in them).
export function bookLookupUrls(q: BookQuery): string[] {
  const urls: string[] = [];
  const isbn = cleanIsbn(q.isbn);
  if (isbn) urls.push(`${COVERS}/isbn/${isbn}-M.jpg?default=false`);
  const p = new URLSearchParams({ title: q.title.trim() });
  if (q.author && q.author.trim()) p.set("author", q.author.trim());
  p.set("limit", "8");
  p.set("fields", "title,author_name,cover_i,first_publish_year");
  urls.push(`${SEARCH}?${p.toString()}`);
  return urls;
}

type Doc = { title?: string; author_name?: string[]; cover_i?: number; first_publish_year?: number };

// The search's best match: same title (normalized) with a cover, nearest
// in year when the card has one; never a different book with a cover.
export function pickDoc(docs: Doc[], q: BookQuery): Doc | null {
  const want = normTitle(q.title);
  const same = docs.filter((d) => typeof d.title === "string" && normTitle(d.title) === want);
  const covered = same.filter((d) => Number.isInteger(d.cover_i) && (d.cover_i as number) > 0);
  if (covered.length === 0) return same[0] ?? null;
  if (q.year) {
    const near = covered.find((d) => d.first_publish_year && Math.abs(d.first_publish_year - (q.year as number)) <= 1);
    if (near) return near;
  }
  return covered[0];
}

const coverOf = (d: Doc | null) =>
  d && Number.isInteger(d.cover_i) && (d.cover_i as number) > 0 ? `${COVERS}/id/${d.cover_i}-M.jpg` : null;

async function get(url: string, init: RequestInit = {}): Promise<Response | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), WAIT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: ctl.signal,
      credentials: "omit",
      headers: { "User-Agent": UA, Accept: "application/json" },
      // Next's data cache, as the TMDb reads use.
      next: { revalidate: 7 * 86400 },
    } as RequestInit);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function lookupBook(q: BookQuery, now = Date.now()): Promise<BookCover> {
  const key = `${normTitle(q.title)}|${normTitle(q.author ?? "")}|${cleanIsbn(q.isbn) ?? ""}|${q.year ?? ""}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < (hit.value.coverUrl ? HIT_TTL : MISS_TTL)) return hit.value;

  const [isbnUrl, searchUrl] = (() => {
    const u = bookLookupUrls(q);
    return u.length === 2 ? u : [null, u[0]];
  })();
  let coverUrl: string | null = null;
  let author: string | null = q.author?.trim() || null;
  if (isbnUrl) {
    const r = await get(isbnUrl, { method: "HEAD" });
    if (r?.ok) coverUrl = isbnUrl.replace("?default=false", "");
  }
  if (!coverUrl || !author) {
    const r = await get(searchUrl as string);
    const data = r?.ok ? await r.json().catch(() => null) : null;
    const doc = pickDoc(Array.isArray(data?.docs) ? data.docs : [], q);
    if (!coverUrl) coverUrl = coverOf(doc);
    if (!author && Array.isArray(doc?.author_name) && typeof doc!.author_name![0] === "string") author = doc!.author_name![0];
    if (!r || !r.ok) {
      // An outage is not a miss: don't remember it.
      return { coverUrl, author };
    }
  }
  const value = { coverUrl, author };
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: now, value });
  return value;
}
