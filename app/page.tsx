"use client";

import React, { useEffect, useRef, useState } from "react";
import SearchBar from "../src/components/SearchBar";
import ResultsV4 from "../src/components/ResultsV4";
import { getTop5FromEngine, type Rek } from "../src/engine/rekomendrEngine";

export type Category = "Movies" | "TV Shows" | "Books" | "Wine";

function normalizeCategoryFromString(raw: string): Category {
  const c = (raw || "Movies").toLowerCase().trim();
  if (c === "wine" || c === "wines") return "Wine";
  if (c === "books" || c === "book") return "Books";
  if (c === "tv" || c === "tv shows" || c === "tv show") return "TV Shows";
  return "Movies";
}

function categoryFromQuery(query: string): Category {
  const q = (query || "").trim();
  if (!q) return "Movies";
  if (q.startsWith("__PHOTO__:")) return "Movies";

  const parts = q.includes("||") ? q.split("||") : q.split("|");
  const rawCategory = (parts[0] || "Movies").trim();
  return normalizeCategoryFromString(rawCategory);
}

function loadingLabelFromQuery(query: string, cat: Category): string {
  const q = (query || "").trim();

  if (!q) return "Finding fresh Reks for you...";
  if (q.startsWith("__PHOTO__:")) return `Finding ${cat} Reks from your photo...`;

  const parts = q.includes("||") ? q.split("||") : q.split("|");
  const clarifier = (parts[1] || "").trim();
  const text = (parts[2] || "").trim();

  if (text) return `Finding ${cat} Reks for "${text}"...`;
  if (clarifier.toLowerCase().startsWith("vibe:")) {
    const vibe = clarifier.slice(5).trim();
    return `Finding ${cat} Reks for ${vibe || "that vibe"}...`;
  }
  if (clarifier) return `Finding ${cat} Reks for ${clarifier}...`;

  return "Finding fresh Reks for you...";
}

export default function Page() {
  const [reks, setReks] = useState<Rek[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Finding fresh Reks for you...");
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>("Movies");

  const vibePlayRef = useRef<null | (() => void)>(null);
  const didInitRef = useRef(false);

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;

    const loadInitial = async () => {
      setLoading(true);
      setLoadingLabel("Finding fresh Reks for you...");

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

  const handleSearch = async (query: string, cat: string) => {
    const inferred = categoryFromQuery(query);
    const nextCategory = query.startsWith("__PHOTO__:")
      ? normalizeCategoryFromString(cat)
      : inferred;

    setCategory(nextCategory);
    setLoading(true);
    setLoadingLabel(loadingLabelFromQuery(query, nextCategory));

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
          hasHistory={reks.length > 0}
          registerVibePlay={(fn) => {
            vibePlayRef.current = fn;
          }}
        />

        <div className="mt-8">
          <ResultsV4
            reks={reks}
            loading={loading}
            loadingLabel={loadingLabel}
            sourceImage={sourceImage}
            category={category}
            onPlayVibe={() => vibePlayRef.current?.()}
          />
        </div>
      </div>
    </main>
  );
}
