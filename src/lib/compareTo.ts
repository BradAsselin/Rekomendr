// src/lib/compareTo.ts — S24a, client side: the references chosen in
// "Compare to…" (docs/s22-compare-to-plan.md). Steering is off by
// default: favorites shape picks only when the person picks them here.
//
// One applied set per device (≤3), in one category. It stays through
// genre/vibe changes and new searches, until it's cleared or the category
// changes. localStorage can be missing or throw (private mode, blocked
// storage, previews): every read and write is wrapped, and the set then
// holds in memory for this tab.

export type CompareCategory = "Movies" | "TV Shows" | "Books";

export type CompareRef = {
  category: CompareCategory;
  name: string;
  year: number | null;
  tmdbKind: "movie" | "tv" | null;
  tmdbId: number | null;
  posterPath: string | null;
  at: string;
};

type Stored = { category: CompareCategory; refs: CompareRef[] };

export const MAX_REFS = 3;
const KEY = "rekomendr.compare_to";
const EVENT = "rekomendr:compare-to";
let memo: Stored | null | undefined; // this tab's copy when storage is unreadable

const isCategory = (c: unknown): c is CompareCategory => c === "Movies" || c === "TV Shows" || c === "Books";

export const compareCategoryOf = (c: unknown): CompareCategory | null => (isCategory(c) ? c : null);

function read(): Stored | null {
  if (memo !== undefined) return memo;
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) || "null");
    if (!raw || !isCategory(raw.category) || !Array.isArray(raw.refs)) return null;
    const refs = raw.refs
      .filter((r: any) => r && typeof r.name === "string" && r.name.trim())
      .slice(0, MAX_REFS)
      .map((r: any) => ({
        category: raw.category,
        name: String(r.name),
        year: Number.isInteger(r.year) ? r.year : null,
        tmdbKind: r.tmdbKind === "movie" || r.tmdbKind === "tv" ? r.tmdbKind : null,
        tmdbId: Number.isInteger(r.tmdbId) && r.tmdbId > 0 ? r.tmdbId : null,
        posterPath: typeof r.posterPath === "string" ? r.posterPath : null,
        at: typeof r.at === "string" ? r.at : new Date().toISOString(),
      }));
    return refs.length ? { category: raw.category, refs } : null;
  } catch {
    return null;
  }
}

function write(next: Stored | null) {
  memo = next;
  try {
    if (next && next.refs.length) window.localStorage.setItem(KEY, JSON.stringify(next));
    else window.localStorage.removeItem(KEY);
  } catch {
    // storage blocked: the set holds for this tab only
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {}
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// The applied references for this category; [] for any other.
export function refsFor(category: unknown): CompareRef[] {
  const s = read();
  return s && s.category === category ? s.refs : [];
}

export function setRefs(category: CompareCategory, refs: CompareRef[]): void {
  const seen = new Set<string>();
  const clean = refs
    .filter((r) => {
      const k = r.name.trim().toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, MAX_REFS)
    .map((r) => ({ ...r, category }));
  write(clean.length ? { category, refs: clean } : null);
}

export function removeRef(category: CompareCategory, name: string): void {
  setRefs(category, refsFor(category).filter((r) => !same(r.name, name)));
}

export function clearRefs(): void {
  if (read()) write(null);
}

// A category change clears the set (Brad: "until cleared or the category
// changes"). Called with the category the person is now in.
export function clearIfCategoryChanged(category: unknown): void {
  const s = read();
  if (s && s.category !== category) {
    console.info("[compare-to] category changed — references cleared", { from: s.category, to: category });
    write(null);
  }
}

export function onRefsChange(fn: () => void): () => void {
  const h = () => fn();
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

// What the slot and screen routes read (S12's go-to shape).
export const refsPayload = (refs: CompareRef[]) =>
  refs.map((r) => ({ name: r.name, tmdbKind: r.tmdbKind, tmdbId: r.tmdbId, at: r.at }));
