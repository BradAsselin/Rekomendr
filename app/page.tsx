"use client";

import React, { useEffect, useRef, useState } from "react";
import SearchBar from "../src/components/SearchBar";
import ResultsV4 from "../src/components/ResultsV4";
import RekSnapButton from "../src/components/RekSnapButton";
import RekSnapResults, { type SnapResult } from "../src/components/RekSnapResults";
import RecipeModal from "../src/components/RecipeModal";
import { getTop5FromEngine, type Rek } from "../src/engine/rekomendrEngine";
import { loadPrefsForCategory } from "../src/lib/userPrefs";

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

// Soft session limit on RekSnaps; count lives in sessionStorage so it
// resets when the browser session ends.
const SNAP_COUNT_KEY = "rekomendr.snap_count";
const SNAP_LIMIT = 5;

// The 5-Rek cap is enforced in production only. Local dev bypasses enforcement
// so we can snap freely while testing — the limit number itself is unchanged,
// and production behavior is identical to before.
const ENFORCE_SNAP_LIMIT = process.env.NODE_ENV === "production";

function getSnapCount(): number {
  if (typeof window === "undefined") return 0;
  return parseInt(sessionStorage.getItem(SNAP_COUNT_KEY) || "0", 10) || 0;
}

function incrementSnapCount(): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SNAP_COUNT_KEY, String(getSnapCount() + 1));
}

// Downscale large camera photos client-side so the vision request stays small.
async function imageFileToDataUrl(file: File, maxDim = 1280): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = dataUrl;
  });

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  if (scale === 1) return dataUrl;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export default function Page() {
  const [reks, setReks] = useState<Rek[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Finding fresh Reks for you...");
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>("Movies");
  const [persistedLikedTitles, setPersistedLikedTitles] = useState<string[]>([]);
  const [persistedDislikedTitles, setPersistedDislikedTitles] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const [snapLoading, setSnapLoading] = useState(false);
  const [snapResult, setSnapResult] = useState<SnapResult | null>(null);
  const [snapError, setSnapError] = useState<string | null>(null);
  const [snapLimitReached, setSnapLimitReached] = useState(false);
  // True once this session has at least one successful snap; hides the hero
  // button and promotes the search-bar camera icon. Set in an effect so
  // server and first client render stay in sync.
  const [hasSnapped, setHasSnapped] = useState(false);

  // Recipe push-through modal. Non-null = open, with the dish to generate and
  // the detected item it came from. Set when a food "uses" snap card is tapped.
  const [activeRecipe, setActiveRecipe] = useState<
    { dish: string; detectedItem?: string } | null
  >(null);

  useEffect(() => {
    setHasSnapped(getSnapCount() >= 1);
  }, []);

  const vibePlayRef = useRef<null | (() => void)>(null);
  const searchIdRef = useRef(0);
  const snapInputRef = useRef<HTMLInputElement | null>(null);

  const openSnapPicker = () => {
    if (ENFORCE_SNAP_LIMIT && getSnapCount() >= SNAP_LIMIT) {
      setSnapLimitReached(true);
      return;
    }
    snapInputRef.current?.click();
  };

  const handleSnapFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-snapping the same photo
    if (!file) return;

    setSnapError(null);
    setSnapResult(null);
    setSnapLoading(true);

    try {
      const image = await imageFileToDataUrl(file);
      const res = await fetch("/api/reksnap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      });
      const data = await res.json().catch(() => null);
      if (
        !res.ok ||
        !data?.detected_item ||
        !data?.results ||
        !Array.isArray(data?.results?.similar)
      ) {
        throw new Error(data?.error || "RekSnap failed");
      }
      setSnapResult(data as SnapResult);
      incrementSnapCount();
      setHasSnapped(true);
    } catch (err) {
      console.error("RekSnap failed:", err);
      setSnapError("Reks Ray™ couldn't read that photo. Give it another snap.");
    } finally {
      setSnapLoading(false);
    }
  };

  const handleSearch = async (query: string, cat: string) => {
    const searchId = ++searchIdRef.current;

    // A new search dismisses any RekSnap results.
    setSnapResult(null);
    setSnapError(null);
    setSnapLoading(false);
    setSnapLimitReached(false);

    const inferred = categoryFromQuery(query);
    const nextCategory = query.startsWith("__PHOTO__:")
      ? normalizeCategoryFromString(cat)
      : inferred;

    setHasSearched(true);
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

      const prefs = await loadPrefsForCategory(nextCategory);
      if (searchId !== searchIdRef.current) return;

      setPersistedLikedTitles(prefs.likedTitles);
      setPersistedDislikedTitles(prefs.dislikedTitles);

      const next = await getTop5FromEngine({ rawQuery: query, ...prefs });
      if (searchId !== searchIdRef.current) return;

      setReks(next);
    } catch (err) {
      if (searchId !== searchIdRef.current) return;
      console.error("Search failed:", err);
      setReks([]);
    } finally {
      if (searchId === searchIdRef.current) {
        setLoading(false);
      }
    }
  };

  return (
    <main className="min-h-screen w-full flex justify-center px-4 py-6">
      <div className="w-full max-w-xl">
        <div className="mb-6 text-center text-3xl font-bold tracking-tight text-[#2D5AB5]">
          Rekomendr<span className="text-[#2D5AB5]/70">.AI</span>
        </div>
        <SearchBar
          onSearch={handleSearch}
          setLoading={setLoading}
          hasHistory={reks.length > 0}
          snapPrimary={hasSnapped}
          onSnap={openSnapPicker}
          registerVibePlay={(fn) => {
            vibePlayRef.current = fn;
          }}
        />

        <input
          ref={snapInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleSnapFile}
        />

        <div className="mt-8">
          {snapLoading || snapResult || snapError || snapLimitReached ? (
            <RekSnapResults
              loading={snapLoading}
              result={snapResult}
              error={snapError}
              limitReached={snapLimitReached}
              onSnapAgain={openSnapPicker}
              onOpenRecipe={(r) => setActiveRecipe(r)}
            />
          ) : !hasSearched && !loading ? (
            !hasSnapped && (
              <div className="sm:hidden">
                <RekSnapButton onClick={openSnapPicker} />
              </div>
            )
          ) : (
            <ResultsV4
              reks={reks}
              loading={loading}
              loadingLabel={loadingLabel}
              sourceImage={sourceImage}
              category={category}
              onPlayVibe={() => vibePlayRef.current?.()}
              persistedLikedTitles={persistedLikedTitles}
              persistedDislikedTitles={persistedDislikedTitles}
            />
          )}
        </div>
      </div>

      {activeRecipe && (
        <RecipeModal
          dish={activeRecipe.dish}
          detectedItem={activeRecipe.detectedItem}
          onClose={() => setActiveRecipe(null)}
        />
      )}
    </main>
  );
}
