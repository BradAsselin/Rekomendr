"use client";

import React, { useEffect, useRef, useState } from "react";
import SearchBar from "../src/components/SearchBar";
import ResultsV4 from "../src/components/ResultsV4";
import { getTop5FromEngine, type Rek } from "../src/engine/rekomendrEngine";

// Local type (keeps TS green)
export type Category = "Movies" | "TV Shows" | "Books" | "Wine";

function normalizeCategoryFromString(raw: string): Category {
  const c = (raw || "Movies").toLowerCase().trim();
  if (c === "wine" || c === "wines") return "Wine";
  if (c === "books" || c === "book") return "Books";
  if (c === "tv" || c === "tv shows" || c === "tv show") return "TV Shows";
  return "Movies";
}

// ✅ Source-of-truth: category encoded in query ("Wine||..." or "Movies|Comedy|...")
function categoryFromQuery(query: string): Category {
  const q = (query || "").trim();
  if (!q) return "Movies";
  if (q.startsWith("__PHOTO__:")) return "Movies"; // caller should override with UI category

  const parts = q.includes("||") ? q.split("||") : q.split("|");
  const rawCategory = (parts[0] || "Movies").trim();
  return normalizeCategoryFromString(rawCategory);
}

export default function Page() {
  const [reks, setReks] = useState<Rek[]>([]);
  const [loading, setLoading] = useState(false);
  const [sourceImage, setSourceImage] = useState<string | null>(null);

  // single source of truth for current vertical (used by backfill/more-like-this)
  const [category, setCategory] = useState<Category>("Movies");

  // ✅ bridge: allow ResultsV4 to trigger SearchBar vibe play
  const vibePlayRef = useRef<null | (() => void)>(null);

  // ✅ DEV STRICT-MODE GUARD (prevents front-door reroll)
  const didInitRef = useRef(false);

  useEffect(() => {
    if (didInitRef.current) return; // ✅ blocks 2nd StrictMode mount pass
    didInitRef.current = true;

    const loadInitial = async () => {
      setLoading(true);
      try {
        setSourceImage(null);
        const initial = await getTop5FromEngine({ rawQuery: "Movies||" });
        setReks(initial);
        setCategory("Movies");
      } catch (err) {
        console.error("Initial load failed:", err);
        setReks([]);
      } finally {
        setLoading(false);
      }
    };

    loadInitial();
  }, []);

  // SearchBar contract: onSearch(query, category)
  const handleSearch = async (query: string, cat: string) => {
    setLoading(true);

    // ✅ Determine category from query (truth), fallback to cat for photo flow
    const inferred = categoryFromQuery(query);
    const nextCategory = query.startsWith("__PHOTO__:")
      ? normalizeCategoryFromString(cat)
      : inferred;

    setCategory(nextCategory);

    try {
      if (query.startsWith("__PHOTO__:")) {
        const img = query.replace("__PHOTO__:", "");
        setSourceImage(img);
      } else {
        setSourceImage(null);
      }

      const next = await getTop5FromEngine({ rawQuery: query });
      setReks(next);
    } catch (err) {
      console.error("Search failed:", err);
      setReks([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen w-full flex justify-center px-4 py-6">
      <div className="w-full max-w-xl">
        <SearchBar
          onSearch={handleSearch}
          setLoading={setLoading}
          // You can keep this; it’s not the cause of reroll.
          hasHistory={reks.length > 0}
          registerVibePlay={(fn) => {
            vibePlayRef.current = fn;
          }}
        />

        <div className="mt-8">
          <ResultsV4
            reks={reks}
            loading={loading}
            sourceImage={sourceImage}
            category={category}
            onPlayVibe={() => vibePlayRef.current?.()}
          />
        </div>
      </div>
    </main>
  );
}
