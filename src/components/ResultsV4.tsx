// src/components/ResultsV4.tsx
import React, { useEffect, useMemo, useState } from "react";

/** -------------------------------
 *  Small types
 *  ------------------------------- */
type Item = {
  id: string;
  title: string;
  description: string;
  infoUrl?: string;
  trailerUrl?: string;
};

type FetchBody = { prompt: string; vertical: string };

type ResultsV4Props = {
  /** Optional seed values (e.g., from /results?q=...&v=...) */
  initialQuery?: string;
  initialVertical?: "movies" | "tv" | "books" | "wine" | string;
  /** If true and initialQuery present, auto-runs a recs fetch on mount */
  autoRunQuery?: boolean;
  /** If true and initialVertical present, auto-runs a "popular" query for that vertical */
  autoRunVertical?: boolean;
};

/** -------------------------------
 *  Config helpers
 *  ------------------------------- */
function getApiUrl(): string {
  const cfg = process.env.NEXT_PUBLIC_REKOMENDR_API || "/api/recs";
  if (/^https?:\/\//i.test(cfg)) return cfg;
  if (typeof window !== "undefined") return `${window.location.origin}${cfg}`;
  return cfg;
}

async function getRecsFromAPI(body: FetchBody): Promise<{ items: Item[] }> {
  const url = getApiUrl();
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Fetch failed: ${url} ${r.status} :: ${text.slice(0, 200)}`);
  }
  return r.json();
}

/** -------------------------------
 *  UI helpers / constants
 *  ------------------------------- */
const VERTICALS = ["movies", "tv", "books", "wine"] as const;

const RANDOM_SEEDS = [
  "feel-good",
  "smart and twisty",
  "underrated gems",
  "edge-of-seat thriller",
  "big crowd-pleaser",
  "date night",
  "mind-bending",
];

const BOTTOM_PROMPTS: Record<string, string[]> = {
  movies: ["true crime vibe", "laugh-out-loud", "critically acclaimed", "hidden gems", "based on a book"],
  tv: ["limited series", "crime drama", "comfort watch", "docuseries", "short episodes"],
  books: ["fast-paced", "award winners", "nonfiction that reads like fiction", "cozy mystery", "space opera"],
  wine: ["bold reds under $25", "crisp whites", "food-friendly picks", "crowd pleasers", "weird & wonderful"],
};

function HollowThumbUp({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
      strokeWidth={1.5} stroke="currentColor" className={className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h2.146a2.25 2.25 0 0 1 2.25 2.25v1.433c0 .31-.053.617-.156.905l-1.2 3.3a4.5 4.5 0 0 1-4.243 3.062H9a3.75 3.75 0 0 1-3.75-3.75v-4.5a.75.75 0 0 1 .75-.75Z" />
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M2.25 10.25h4.125a.375.375 0 0 1 .375.375v6.75a.375.375 0 0 1-.375.375H2.25a.75.75 0 0 1-.75-.75v-6a.75.75 0 0 1 .75-.75Z" />
    </svg>
  );
}

function HollowThumbDown({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
      strokeWidth={1.5} stroke="currentColor" className={className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M17.367 13.75c-.806 0-1.533.446-2.031 1.08a9.041 9.041 0 0 1-2.861 2.4c-.723.384-1.35.956-1.653 1.715a4.498 4.498 0 0 0-.322 1.672v.633a.75.75 0 0 1-.75.75A2.25 2.25 0 0 1 7.5 20.75c0-1.152.26-2.243.723-3.218.266-.558-.107-1.282-.725-1.282H5.352A2.25 2.25 0 0 1 3.102 14v-1.433c0-.31.053-.617.156-.905l1.2-3.3A4.5 4.5 0 0 1 8.701 5.3H15a3.75 3.75 0 0 1 3.75 3.75v4.5a.75.75 0 0 1-.75.75Z" />
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M21.75 13.75H17.625a.375.375 0 0 0-.375.375v6.75c0 .207.168.375.375.375h4.125a.75.75 0 0 0 .75-.75v-6a.75.75 0 0 0-.75-.75Z" />
    </svg>
  );
}

/** -------------------------------
 *  Component
 *  ------------------------------- */
const ResultsV4: React.FC<ResultsV4Props> = ({
  initialQuery = "",
  initialVertical = "movies",
  autoRunQuery = false,
  autoRunVertical = false,
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [vertical, setVertical] = useState<string>(initialVertical);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Gate thumbs unless you wire auth later
  const isSignedIn = false;

  // Build 5 items minimum by backfilling editor picks
  const ensuredItems = useMemo(() => {
    if ((items?.length || 0) >= 5) return items.slice(0, 5);
    const need = 5 - (items?.length || 0);
    const picks: Item[] = Array.from({ length: need }, (_, i) => ({
      id: `pick-${Date.now()}-${i}`,
      title: `Editor’s Pick #${i + 1}`,
      description: `Hand-curated ${vertical} pick to round out your list.`,
      infoUrl: "https://www.google.com/",
      trailerUrl: "https://www.youtube.com/",
    }));
    return [...(items || []), ...picks].slice(0, 5);
  }, [items, vertical]);

  async function runSearch(seed: string, v: string) {
    setLoading(true);
    setError(null);
    try {
      const out = await getRecsFromAPI({ prompt: seed, vertical: v });
      setItems(Array.isArray(out.items) ? out.items : []);
    } catch (e: any) {
      console.error("getRecsFromAPI failed:", e);
      setError(e?.message || "Unknown error");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  // Auto-run behaviors
  useEffect(() => {
    if (autoRunQuery && initialQuery) {
      runSearch(initialQuery, vertical);
      return;
    }
    if (autoRunVertical && initialVertical) {
      runSearch("popular", initialVertical);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Suggestion “Play” button — insert randomized prompt (does not auto-submit)
  function insertRandomPrompt() {
    const r = RANDOM_SEEDS[Math.floor(Math.random() * RANDOM_SEEDS.length)];
    setQuery(r);
  }

  // “More like this” refines based on title
  function refineFromTitle(title: string) {
    const seed = `more like "${title}"`;
    setQuery(seed);
    runSearch(seed, vertical);
  }

  // Reset clears UI
  function resetAll() {
    setQuery("");
    setItems([]);
    setError(null);
  }

  const bottomChips = BOTTOM_PROMPTS[vertical] || BOTTOM_PROMPTS["movies"];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Rekomendr.AI</h1>
        <button
          onClick={resetAll}
          className="text-sm rounded-xl px-3 py-1 border border-gray-300 hover:bg-gray-50"
          title="Reset"
        >
          Reset
        </button>
      </div>

      {/* Search bar */}
      <div className="flex items-stretch gap-2 mb-3">
        <button
          onClick={insertRandomPrompt}
          className="rounded-2xl px-3 py-2 border border-gray-300 hover:bg-gray-50"
          title="Surprise me"
        >
          ▶
        </button>
        <input
          className="flex-1 rounded-2xl px-3 py-2 border border-gray-300 outline-none"
          placeholder="What can I find for you?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") runSearch(query || "popular", vertical);
          }}
        />
        <button
          onClick={() => runSearch(query || "popular", vertical)}
          className="rounded-2xl px-4 py-2 bg-black text-white hover:opacity-90"
        >
          GO
        </button>
      </div>

      {/* Category bubbles */}
      <div className="flex flex-wrap gap-2 mb-6">
        {VERTICALS.map((v) => (
          <button
            key={v}
            onClick={() => {
              setVertical(v);
              runSearch("popular", v);
            }}
            className={`text-sm px-3 py-1 rounded-full border ${
              vertical === v
                ? "border-black bg-black text-white"
                : "border-gray-300 hover:bg-gray-50"
            }`}
          >
            {v === "tv" ? "TV Shows" : v[0].toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 text-sm text-red-600 border border-red-200 bg-red-50 rounded-xl p-3">
          {error}
        </div>
      )}

      {/* Results */}
      <div className="grid gap-4">
        {loading && (
          <div className="text-sm text-gray-500">Fetching recommendations…</div>
        )}

        {!loading &&
          ensuredItems.map((it) => (
            <div
              key={it.id}
              className="rounded-2xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Title row with hollow thumbs (gated) */}
              <div className="flex items-start justify-between gap-3">
                <a
                  href={it.infoUrl || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="text-lg font-semibold leading-snug hover:underline"
                >
                  {it.title}
                </a>
                <div className="flex items-center gap-2">
                  <button
                    className="p-1 rounded-lg border border-gray-300 text-gray-500"
                    title={isSignedIn ? "Like" : "Sign in to personalize"}
                    disabled={!isSignedIn}
                  >
                    <HollowThumbUp className="w-5 h-5" />
                  </button>
                  <button
                    className="p-1 rounded-lg border border-gray-300 text-gray-500"
                    title={isSignedIn ? "Dislike" : "Sign in to personalize"}
                    disabled={!isSignedIn}
                  >
                    <HollowThumbDown className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Description */}
              <p className="text-sm text-gray-700 mt-2">
                {it.description || "—"}
              </p>

              {/* Links row */}
              <div className="mt-3 text-sm flex items-center gap-4">
                <button
                  onClick={() => refineFromTitle(it.title)}
                  className="underline underline-offset-2 hover:opacity-80"
                >
                  + More like this
                </button>
                <a
                  className="underline underline-offset-2 hover:opacity-80"
                  target="_blank"
                  rel="noreferrer"
                  href={
                    it.trailerUrl ||
                    `https://www.youtube.com/results?search_query=${encodeURIComponent(
                      `${it.title} trailer`
                    )}`
                  }
                >
                  ▶ Trailer
                </a>
              </div>
            </div>
          ))}
      </div>

      {/* Bottom suggestions */}
      <div className="mt-6">
        <div className="text-sm text-gray-500 mb-2">Try these:</div>
        <div className="flex flex-wrap gap-2">
          {bottomChips.map((chip) => (
            <button
              key={chip}
              onClick={() => {
                setQuery(chip);
                runSearch(chip, vertical);
              }}
              className="text-sm px-3 py-1 rounded-full border border-gray-300 hover:bg-gray-50"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ResultsV4;
