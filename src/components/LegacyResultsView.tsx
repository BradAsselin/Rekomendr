// FILE: src/components/LegacyResultsView.tsx
// Purpose: Presentational view for legacy results features (breadcrumbs, refine, vote, pagination)
// Tailwind version of your old inline-styled section.
// =============================================================
import React from "react";
import { Rec } from "../hooks/useLegacySearch";

export function LegacyResultsView(props: {
  recs: Rec[];
  paged: Rec[];
  loading: boolean;
  errorMsg: string | null;
  page: number;
  totalPages: number;
  justVoted: "up" | "down" | null;
  lastBase: string | null;
  titleRefine: string | null;
  tagRefine: string | null;
  setPage: (n: number) => void;
  refineWithTitle: (t: string) => void;
  refineWithTag: (t: string) => void;
  handleVote: (v: "up" | "down") => void;
}) {
  const {
    recs,
    paged,
    loading,
    errorMsg,
    page,
    totalPages,
    justVoted,
    lastBase,
    titleRefine,
    tagRefine,
    setPage,
    refineWithTitle,
    refineWithTag,
    handleVote,
  } = props;

  return (
    <div className="mx-auto mt-6 max-w-2xl">
      {/* Error */}
      {errorMsg && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
          {errorMsg}
        </div>
      )}

      {/* Skeleton */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-2 h-5 w-2/5 rounded-md bg-gray-100" />
              <div className="mb-1 h-3 w-[95%] rounded-md bg-gray-100" />
              <div className="h-3 w-[88%] rounded-md bg-gray-100" />
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {!loading && (
        <div className="space-y-3">
          {paged.map((r) => (
            <div key={r.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <strong className="text-lg font-extrabold text-gray-900">{r.title}</strong>
              <div className="mt-2 text-gray-700">{r.summary}</div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <button
                  onClick={() => refineWithTitle(r.title)}
                  className="rounded-lg border px-3 py-1 hover:bg-gray-50"
                  title="Refine with this title"
                >
                  + More like this
                </button>
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(r.title)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Learn more
                </a>
                <span className="opacity-40">·</span>
                <a
                  href={`https://www.youtube.com/results?search_query=${encodeURIComponent(r.title + " trailer")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                >
                  <span>▶</span>
                  <span>Trailer</span>
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && recs.length > 5 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm text-gray-700">
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="rounded border px-2 py-1 disabled:opacity-50">
            ← Prev
          </button>
          <div>Page {page} of {totalPages}</div>
          <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="rounded border px-2 py-1 disabled:opacity-50">
            Next →
          </button>
        </div>
      )}

      {/* Helpful + Tag refiners */}
      {!loading && recs.length > 0 && (
        <div className="mt-5 text-center">
          <div className="mb-2">Helpful?</div>
          <div className="inline-flex gap-3">
            <button onClick={() => handleVote("up")} disabled={!!justVoted} title="Yes" className="rounded border px-2 py-1 disabled:opacity-50">
              👍 Yes
            </button>
            <button onClick={() => handleVote("down")} disabled={!!justVoted} title="No" className="rounded border px-2 py-1 disabled:opacity-50">
              👎 No
            </button>
          </div>
          {justVoted && (
            <div className="mt-2 text-sm text-gray-600">Thanks! Logged your feedback ({justVoted === "up" ? "👍" : "👎"}).</div>
          )}

          {justVoted === "down" && (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {["newer", "funnier", "more popular", "shorter"].map((tag) => (
                <button
                  key={tag}
                  onClick={() => refineWithTag(tag)}
                  className="rounded-lg border px-3 py-1 hover:bg-gray-50"
                >
                  {tag === "newer"
                    ? "Something newer"
                    : tag === "funnier"
                    ? "Something funnier"
                    : tag === "more popular"
                    ? "More popular"
                    : "Shorter runtime"}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Breadcrumb chips */}
      {(lastBase || titleRefine || tagRefine) && (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {lastBase && (
            <span className="rounded-full border bg-white px-3 py-1 font-semibold" title={lastBase}>
              {lastBase}
            </span>
          )}
          {titleRefine && (
            <span className="rounded-full border bg-gray-50 px-3 py-1 opacity-90">
              more like <strong className="ml-1">{titleRefine}</strong>
            </span>
          )}
          {tagRefine && (
            <span className="rounded-full border bg-gray-50 px-3 py-1 opacity-90">
              make it <strong className="ml-1">{tagRefine}</strong>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
