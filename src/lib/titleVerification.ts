// src/lib/titleVerification.ts
// S1.5 — the search lane's client-side half of the real-title guard.
//
// The engine runs in the browser, so it cannot hold TMDB_API_KEY. This is
// the thin call to /api/verify/titles plus the one rule the engine needs:
// WHICH categories are verified at all.

export type VerifiedKind = "movie" | "tv" | "any";

export type VerifyRequestItem = {
  title: string;
  year?: number | null;
  kind?: VerifiedKind;
};

export type VerifyResult = {
  enabled: boolean;
  // Normalized-title -> resolved. Absent means "no verdict arrived".
  resolved: Map<string, boolean>;
  // S17a — the titles TMDb actually ANSWERED: found, or searched and not
  // there (no_match / year_mismatch). A title missing from this set was
  // never checked (the call failed, or TMDb's lookup did): it still does
  // not ship, but it is not evidence of fiction either.
  answered: Set<string>;
  // S17 — the TMDb match for each resolved title (id + poster path).
  matches: Map<string, { tmdbId: number; posterPath: string | null }>;
};

// Mirrors normalizeTitle in tmdbVerify.ts — the two must agree or the
// verdict map will not line up with the titles the engine holds. Kept as
// a copy rather than an import because that module is server-only.
export function verifyKey(raw: string): string {
  return (raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// MOVIES AND TV ONLY. Books and Wine are out of scope: TMDb does not know
// them, and a guard that cannot check a category must not pretend to.
// A fabricated book title is a real problem and a real future session —
// it is named in the PR rather than half-solved here.
export function verifiedKindForCategory(category: string): VerifiedKind | null {
  const c = (category ?? "").trim().toLowerCase();
  if (c === "movies" || c === "movie") return "movie";
  if (c === "tv shows" || c === "tv show" || c === "tv") return "tv";
  return null;
}

// Fail-soft in ONE direction only, and deliberately so: a transport
// failure HERE (the route is unreachable, the bundle is talking to a
// deploy that predates the route) returns an empty map, and the engine
// treats "no verdict" as "do not ship" — the same fail-closed posture the
// server takes. `enabled: false` is the single case that lets titles
// through, and it means TMDB_API_KEY is missing, which is loud everywhere
// else.
export async function verifyTitlesViaApi(args: {
  items: VerifyRequestItem[];
  anchor: string;
  path: "search" | "search-freshness" | "mlt" | "search-backfill";
  category?: string;
}): Promise<VerifyResult> {
  const empty = (): VerifyResult => ({ enabled: true, resolved: new Map(), answered: new Set(), matches: new Map() });
  if (args.items.length === 0) return empty();

  // S17a — one retry when the CALL fails as a whole (a function timeout, a
  // dropped request on a phone): a blip must not read as a set of fakes.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("/api/verify/titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: args.items,
          anchor: args.anchor,
          path: args.path,
          category: args.category,
        }),
      });
      if (!res.ok) {
        console.warn("[fake-title] verification route non-OK", { status: res.status, attempt });
        continue;
      }
      const data = await res.json();
      const out = empty();
      if (Array.isArray(data?.verdicts)) {
        for (const v of data.verdicts) {
          if (v && typeof v.title === "string") {
            const k = verifyKey(v.title);
            out.resolved.set(k, Boolean(v.resolved));
            if (v.resolved || v.reason === "no_match" || v.reason === "year_mismatch") out.answered.add(k);
            if (v.resolved && Number.isInteger(v.tmdbId)) {
              out.matches.set(k, {
                tmdbId: v.tmdbId,
                posterPath: typeof v.posterPath === "string" ? v.posterPath : null,
              });
            }
          }
        }
      }
      out.enabled = data?.enabled !== false;
      return out;
    } catch (err) {
      console.warn("[fake-title] verification call threw", {
        attempt,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return empty();
}
