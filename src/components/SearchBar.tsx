"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Camera, ChevronDown, Plus, X, Play, ChevronUp } from "lucide-react";

interface SearchBarProps {
  onSearch: (query: string, category: string) => void;
  setLoading?: (loading: boolean) => void;
  hasHistory?: boolean;

  // allow Page / ResultsV4 to trigger Play
  registerVibePlay?: (fn: () => void) => void;
}

const AUTO_GO_DELAY_MS = 2000;

// --------------------------------------------
// VIBES (CATEGORY-SCOPED)
// --------------------------------------------
const VIBES_BY_CATEGORY: Record<string, string[]> = {
  Movies: [
    "Comfort Watch",
    "Goofy / Silly Fun",
    "Feel-Good Crowd Pleaser",
    "Smart & Witty",
    "Romantic / Heartfelt",
    "Dark & Twisty",
    "Suspense / Edge-of-Seat",
    "Epic / Immersive",
    "Action / Adrenaline",
    "Thought-Provoking / Meaningful",
    "Weird / Offbeat",
    "Documentary / Real Stories",
  ],
  "TV Shows": [
    "Binge & Chill",
    "Comfort Rewatch",
    "Prestige Drama",
    "Dark & Twisty",
    "Reality Escape",
    "Edge-of-Seat",
  ],
  Books: [
    "Can’t Put Down",
    "Thought-Provoking",
    "Comfort Read",
    "Smart & Witty",
    "Dark & Twisty",
  ],
  Wine: ["Crisp & Dry", "Easy Sipper", "Special Occasion", "Bright & Fresh", "Rich & Cozy"],
};

const getVibesForCategory = (category: string) =>
  VIBES_BY_CATEGORY[category] ?? VIBES_BY_CATEGORY["Movies"];

const SearchBar: React.FC<SearchBarProps> = ({
  onSearch,
  setLoading,
  hasHistory,
  registerVibePlay,
}) => {
  const [input, setInput] = useState("");
  const [isPulsing, setIsPulsing] = useState(false);

  const [category, setCategory] = useState("Movies");
  const [clarifier, setClarifier] = useState<string | null>(null);

  const [openCategory, setOpenCategory] = useState(false);
  const [openClarifiers, setOpenClarifiers] = useState(false);
  const [openVibes, setOpenVibes] = useState(false);

  const [autoGoVisible, setAutoGoVisible] = useState(false);
  const autoGoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  // Vibe state
  const [vibeIndex, setVibeIndex] = useState(0);
  const [activeVibe, setActiveVibe] = useState<string | null>(null);

  // Track what last triggered results, so Lane can be honest
  const [lastSearchMode, setLastSearchMode] = useState<
    "clarifier" | "typed" | "categoryOnly" | "photo" | null
  >(null);
  const [lastTypedSeed, setLastTypedSeed] = useState<string>("");

  // Camera state
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [hasCaptured, setHasCaptured] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isFlashing, setIsFlashing] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // --------------------------------------------
  // Refs to avoid stale state in Play handler
  // --------------------------------------------
  const categoryRef = useRef(category);
  const vibeIndexRef = useRef(vibeIndex);
  const clarifierRef = useRef<string | null>(clarifier);

  useEffect(() => {
    categoryRef.current = category;
  }, [category]);

  useEffect(() => {
    vibeIndexRef.current = vibeIndex;
  }, [vibeIndex]);

  useEffect(() => {
    clarifierRef.current = clarifier;
  }, [clarifier]);

  /* -----------------------------
   * HELPERS
   * ----------------------------- */

  // Use "||" format (engine supports both)
  const buildQuery = (cat: string, clar: string | null, text: string, mode: "pool" | "ai") => {
  const safeText = text.trim();
  const clarPart = clar ?? "";
  return `${cat}||${clarPart}||${safeText}||mode:${mode}`;
};


  const triggerPulse = () => {
    setIsPulsing(true);
    setTimeout(() => setIsPulsing(false), 1000);
  };

  const startSearch = (query: string, catOverride?: string) => {
    const cat = catOverride ?? categoryRef.current;
    setLoading?.(true);
    triggerPulse();
    onSearch(query, cat);
  };

  const closeAllDropdowns = () => {
    setOpenCategory(false);
    setOpenClarifiers(false);
    setOpenVibes(false);
  };

  const cancelAutoGo = () => {
    if (autoGoTimerRef.current) clearTimeout(autoGoTimerRef.current);
    autoGoTimerRef.current = null;
    setAutoGoVisible(false);
  };

  const scheduleAutoGo = (cat: string, clar: string) => {
    if (input.trim()) return;

    cancelAutoGo();
    autoGoTimerRef.current = setTimeout(() => {
      const q = buildQuery(cat, clar, "", "ai");
      setAutoGoVisible(true);

      setLastSearchMode("clarifier");
      setLastTypedSeed("");
      startSearch(q, cat);

      setTimeout(() => setAutoGoVisible(false), 1200);
    }, AUTO_GO_DELAY_MS);
  };

  /* -----------------------------
   * PLACEHOLDER LOGIC
   * ----------------------------- */
  const getPlaceholder = () => {
    if (clarifier) return "";

    switch (category) {
      case "Movies":
        return "Enter a movie you liked";
      case "TV Shows":
        return "Enter a TV show you liked";
      case "Books":
        return "Enter a book you liked";
      case "Wine":
        return "Enter a wine you like";
      default:
        return "What can I find for you?";
    }
  };

  /* -----------------------------
   * CLARIFIERS — VERTICAL AWARE
   * ----------------------------- */
  const movieClarifiers = ["Comedy", "Thriller", "Action", "Drama", "Romance", "Sci-Fi", "Crime"];
  const tvClarifiers = ["Sitcom", "Drama", "Crime", "Reality", "Documentary", "Fantasy"];
  const bookClarifiers = ["Mystery", "Fantasy", "Romance", "Sci-Fi", "Non-Fiction", "Thriller"];
  const wineClarifiers = ["Dry", "Sweet", "Red", "White", "Sparkling", "Rosé"];

  const getClarifierSet = () => {
    switch (category) {
      case "Movies":
        return movieClarifiers;
      case "TV Shows":
        return tvClarifiers;
      case "Books":
        return bookClarifiers;
      case "Wine":
        return wineClarifiers;
      default:
        return [];
    }
  };

  const advancedOptions = hasHistory ? ["Saved", "Favorites", "Liked"] : [];

  const handleSelectCategory = (c: string) => {
    cancelAutoGo();
    closeAllDropdowns();

    setCategory(c);

    // Reset refiners
    setClarifier(null);
    setInput("");
    setActiveVibe(null);
    setVibeIndex(0);

    setLastSearchMode("categoryOnly");
    setLastTypedSeed("");

    // Immediate search on category select (empty query valid)
    const q = buildQuery(c, null, "", "pool");
    startSearch(q, c);
  };

  const handleSelectClarifier = (c: string) => {
    cancelAutoGo();
    closeAllDropdowns();

    setClarifier(c);
    setActiveVibe(null); // lane changed => clear vibe modifier
    setInput("");

    setLastSearchMode("clarifier");
    setLastTypedSeed("");

    // Auto-go (only when input empty)
    scheduleAutoGo(categoryRef.current, c);
  };

  const clearLane = () => {
    cancelAutoGo();
    closeAllDropdowns();

    setClarifier(null);
    setActiveVibe(null);
    setInput("");

    setLastSearchMode("categoryOnly");
    setLastTypedSeed("");

    const q = buildQuery(categoryRef.current, null, "", "pool");

    startSearch(q, categoryRef.current);
  };

  /* -----------------------------
 * VIBE (modifier)
 * - requires lane to exist
 * - encoded as TEXT so engine sees it as intent bias
 * ----------------------------- */
const runVibe = useCallback(
  (vibeName: string, catOverride?: string, indexOverride?: number) => {
    const cat = catOverride ?? categoryRef.current;

    cancelAutoGo();
    closeAllDropdowns();

    // ✅ vibe only valid once a lane exists
    const lane = clarifierRef.current;
    if (!lane) return;

    setInput("");
    setActiveVibe(vibeName);

    // vibe is modifier => keep mode as clarifier (lane-first)
    setLastSearchMode("clarifier");
    setLastTypedSeed("");

    if (typeof indexOverride === "number") setVibeIndex(indexOverride);

    const q = buildQuery(cat, lane, vibeName, "ai");
    startSearch(q, cat);
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  []
);

  /* -----------------------------
   * PLAY BUTTON
   * - cycles GENRE (clarifier) instead of vibes
   * - solves “genre hidden behind +”
   * ----------------------------- */
  const handlePlayStable = useCallback(() => {
    const cat = categoryRef.current;

    // Only meaningful for now on Movies (you can expand later)
    const clarifiers = (() => {
      switch (cat) {
        case "Movies":
          return movieClarifiers;
        case "TV Shows":
          return tvClarifiers;
        case "Books":
          return bookClarifiers;
        case "Wine":
          return wineClarifiers;
        default:
          return movieClarifiers;
      }
    })();

    // find next clarifier
    const current = clarifierRef.current;
    const currentIdx = current ? Math.max(clarifiers.indexOf(current), -1) : -1;
    const nextIdx = (currentIdx + 1) % clarifiers.length;
    const nextClar = clarifiers[nextIdx];

    // set lane + run auto-go immediately
    setClarifier(nextClar);
    setActiveVibe(null);
    setInput("");

    setLastSearchMode("clarifier");
    setLastTypedSeed("");

    const q = buildQuery(cat, nextClar, "", "pool");
    startSearch(q, cat);
  }, []);

  // Register Play handler with Page.tsx
  useEffect(() => {
    registerVibePlay?.(handlePlayStable);
  }, [registerVibePlay, handlePlayStable]);

  /* -----------------------------
   * FEELING / LANE LABEL
   * ----------------------------- */
  const getLaneLabel = () => {
    // Photo override
    if (lastSearchMode === "photo") return "Based on your photo";

    // Base lane
    const parts: string[] = [];
    parts.push(clarifier ? clarifier : "Surprise me");

    // Modifier vibe only after lane exists
    if (clarifier && activeVibe) parts.push(activeVibe);

    // Typed seed last (your request: sports first, then vibe second)
    if (lastSearchMode === "typed" && lastTypedSeed.trim()) {
      // If no lane, show typed as primary lane label
      if (!clarifier) return `“${lastTypedSeed.trim()}”`;
      return `${parts.join(" • ")} • “${lastTypedSeed.trim()}”`;
    }

    return parts.join(" • ");
  };

  /* -----------------------------
   * SUBMIT LOGIC
   * ----------------------------- */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    cancelAutoGo();
    closeAllDropdowns();

    // Photo flow
    if (capturedPhoto) {
      setLoading?.(true);
      triggerPulse();
      onSearch("__PHOTO__:" + capturedPhoto, categoryRef.current);

      setCapturedPhoto(null);
      setInput("");
      setActiveVibe(null);

      setLastSearchMode("photo");
      setLastTypedSeed("");
      return;
    }

    const trimmed = input.trim();

   // If they typed, that becomes the primary lane label (no surprise-me)
   if (trimmed) {
     setLastSearchMode("typed");
     setLastTypedSeed(trimmed);

   // typed should clear vibe modifier (prevents weird “sports + goofy” unless user re-adds)
    setActiveVibe(null);

     const mode: "pool" | "ai" = "ai";
     const q = buildQuery(categoryRef.current, clarifierRef.current, trimmed, mode);
     startSearch(q, categoryRef.current);

    setInput("");
   return;
  }


    // no typed
    if (clarifierRef.current) {
  setLastSearchMode("clarifier");
  setLastTypedSeed("");

  const q = buildQuery(categoryRef.current, clarifierRef.current, "", "ai");
  startSearch(q, categoryRef.current);
} else {
  setLastSearchMode("categoryOnly");
  setLastTypedSeed("");

  const q = buildQuery(categoryRef.current, null, "", "pool");
  startSearch(q, categoryRef.current);
}

setInput("");

  };

  /* -----------------------------
   * CAMERA HANDLERS (unchanged)
   * ----------------------------- */
  const handleOpenCamera = () => {
    cancelAutoGo();
    closeAllDropdowns();
    setActiveVibe(null);
    setIsCameraOpen(true);
    setHasCaptured(false);
    setCapturedPhoto(null);
  };

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      (videoRef.current as any).srcObject = null;
    }
  };

  const handleCloseCamera = () => {
    stopStream();
    setIsCameraOpen(false);
    setHasCaptured(false);
    setCapturedPhoto(null);
  };

  const handleCameraAction = () => {
    cancelAutoGo();

    if (!hasCaptured) {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas) {
        const width = video.videoWidth || 640;
        const height = video.videoHeight || 360;
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/png");
          setCapturedPhoto(dataUrl);
        }
      }

      stopStream();
      setHasCaptured(true);
      setIsFlashing(true);
      setTimeout(() => setIsFlashing(false), 150);
    } else {
      if (capturedPhoto) {
        setIsCameraOpen(false);
        setHasCaptured(false);
        setLoading?.(true);
        triggerPulse();
        onSearch("__PHOTO__:" + capturedPhoto, categoryRef.current);

        setActiveVibe(null);
        setLastSearchMode("photo");
        setLastTypedSeed("");
      }
    }
  };

  useEffect(() => {
    if (!isCameraOpen) {
      stopStream();
      return;
    }

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = stream;
        if (videoRef.current) {
          (videoRef.current as any).srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err) {
        console.error("Camera error:", err);
      }
    };

    start();
    return () => stopStream();
  }, [isCameraOpen]);

  /* -----------------------------
   * RENDER
   * ----------------------------- */
  const laneLabel = getLaneLabel();
  const vibeEnabled = !!clarifier;

  return (
    <div className="w-full relative">
      {/* SEARCH BAR */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center justify-between px-4 py-3 rounded-2xl
                   bg-white text-black shadow-[0_2px_6px_rgba(0,0,0,0.08)]
                   transition-all duration-200 hover:shadow-[0_3px_10px_rgba(0,0,0,0.12)]
                   focus-within:shadow-[0_3px_12px_rgba(0,0,0,0.14)]"
      >
        {/* PLAY (cycles lane/genre) */}
        <button
          type="button"
          onClick={handlePlayStable}
          title="Play a lane"
          className="mr-3 p-2 rounded-full border border-gray-300 text-gray-600 hover:text-black hover:border-gray-500 transition"
        >
          <Play size={18} strokeWidth={1.8} />
        </button>

        {/* CATEGORY + PLUS / CLARIFIER */}
        <div className="flex items-center gap-1 mr-3">
          <button
            type="button"
            onClick={() => {
              cancelAutoGo();
              setOpenCategory((prev) => !prev);
              setOpenClarifiers(false);
              setOpenVibes(false);
            }}
            className="flex items-center gap-1 text-gray-700 hover:text-black font-medium"
          >
            {category}
            <ChevronDown size={16} strokeWidth={1.7} />
          </button>

          {!clarifier && (
            <button
              type="button"
              onClick={() => {
                cancelAutoGo();
                setOpenClarifiers((prev) => !prev);
                setOpenCategory(false);
                setOpenVibes(false);
              }}
              className="text-gray-500 hover:text-gray-700 transition"
              title="Pick a lane"
            >
              <Plus size={15} strokeWidth={1.8} />
            </button>
          )}

          {clarifier && (
            <button
              type="button"
              onClick={() => {
                cancelAutoGo();
                setOpenClarifiers((p) => !p);
                setOpenCategory(false);
                setOpenVibes(false);
              }}
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-black transition ml-1"
              title="Change lane"
            >
              {clarifier}
              <ChevronDown size={14} strokeWidth={1.8} />
            </button>
          )}
        </div>

        {/* INPUT */}
        <input
          type="text"
          placeholder={getPlaceholder()}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            cancelAutoGo();
            setOpenVibes(false);
          }}
          className="flex-grow bg-transparent outline-none text-black placeholder-gray-500 text-base"
        />

        {/* CAMERA */}
        <button
          type="button"
          onClick={handleOpenCamera}
          className="text-gray-500 hover:text-gray-700 transition mr-2"
        >
          <Camera size={20} strokeWidth={1.7} />
        </button>

        {/* GO */}
        <button type="submit" className="font-semibold text-gray-800 hover:text-black transition">
          GO
        </button>
      </form>

      {/* LANE LINE + VIBE MODIFIER */}
      <div className="relative mt-2 text-xs text-gray-500 pl-1 flex items-center gap-1">
        <span>
          Lane: <span className="font-semibold text-gray-700">{laneLabel}</span>
        </span>

        <button
          type="button"
          disabled={!vibeEnabled}
          onClick={() => {
            if (!vibeEnabled) return;
            cancelAutoGo();
            setOpenVibes((p) => !p);
            setOpenCategory(false);
            setOpenClarifiers(false);
          }}
          className={[
            "ml-1 inline-flex items-center justify-center rounded-md border px-1.5 py-0.5 transition",
            vibeEnabled
              ? "border-gray-200 bg-white text-gray-600 hover:text-black hover:border-gray-300"
              : "border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed",
          ].join(" ")}
          title={vibeEnabled ? "Pick a vibe (optional)" : "Pick a lane first"}
        >
          {openVibes ? <ChevronUp size={14} strokeWidth={1.8} /> : <ChevronDown size={14} strokeWidth={1.8} />}
        </button>

        {!vibeEnabled && (
          <span className="ml-1 text-[11px] text-gray-400">Pick a lane first</span>
        )}

        {openVibes && vibeEnabled && (
          <div className="absolute left-0 top-[calc(100%+8px)] w-full max-w-[320px] bg-white border border-gray-300 rounded-xl shadow-lg py-2 z-50">
            {getVibesForCategory(category).map((v, idx) => (
              <button
                key={v}
                onClick={() => runVibe(v, categoryRef.current, idx)}
                className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition"
              >
                {v}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* CATEGORY DROPDOWN */}
      {openCategory && (
        <div className="absolute top-[108%] left-0 w-[150px] bg-white border border-gray-300 rounded-xl shadow-lg py-1.5 z-40">
          {["Movies", "TV Shows", "Books", "Wine"].map((c) => (
            <button
              key={c}
              onClick={() => handleSelectCategory(c)}
              className="block w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition"
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* CLARIFIER DROPDOWN */}
      {openClarifiers && (
        <div className="absolute top-[108%] left-0 w-[170px] bg-white border border-gray-300 rounded-xl shadow-lg py-1.5 z-40">
          {clarifier && (
            <>
              <button
                type="button"
                onClick={clearLane}
                className="block w-full text-left px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 transition"
              >
                Clear lane
              </button>
              <div className="border-t my-1 border-gray-200" />
            </>
          )}

          {getClarifierSet().map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => handleSelectClarifier(g)}
              className="block w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition"
            >
              {g}
            </button>
          ))}

          {advancedOptions.length > 0 && (
            <>
              <div className="border-t my-1 border-gray-200" />
              {advancedOptions.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => handleSelectClarifier(opt)}
                  className="block w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition"
                >
                  {opt}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {/* AUTO-SEARCH */}
      {autoGoVisible && (
        <div className="mt-1 text-xs text-gray-400 animate-pulse pl-1">Auto-searching…</div>
      )}

      {/* PULSE LINE */}
      <div
        className={[
          "h-[3px] mt-2 rounded-full transition-all duration-700",
          isPulsing ? "bg-gray-300 animate-[pulseLine_1.2s_ease-in-out_infinite]" : "bg-transparent",
        ].join(" ")}
      />

      {/* CAMERA OVERLAY */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex flex-col relative">
          {isFlashing && <div className="absolute inset-0 bg-white opacity-80 pointer-events-none" />}

          <div className="flex items-center justify-between px-4 pt-4 pb-2 text-white">
            <button type="button" onClick={handleCloseCamera} className="p-1 -ml-1">
              <X size={22} strokeWidth={1.7} />
            </button>
            <span className="text-xs uppercase tracking-[0.2em] opacity-80">REK SNAP</span>
            <div className="w-6" />
          </div>

          <div className="flex-1 mx-4 mb-4 rounded-2xl border border-gray-700 bg-black overflow-hidden flex items-center justify-center">
            {capturedPhoto ? (
              <img src={capturedPhoto} alt="Captured" className="w-full h-full object-cover" />
            ) : (
              <>
                <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                {!streamRef.current && (
                  <span className="absolute text-[11px] uppercase tracking-[0.2em] text-gray-300">
                    Starting camera…
                  </span>
                )}
              </>
            )}
          </div>

          <canvas ref={canvasRef} className="hidden" />

          <div className="pb-10 flex flex-col items-center">
            <button
              type="button"
              onClick={handleCameraAction}
              className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center bg-white/10 active:scale-95 transition-transform"
            >
              <div className={["w-10 h-10 rounded-full", hasCaptured ? "bg-white/70" : "bg-white"].join(" ")} />
            </button>

            <button type="button" onClick={handleCameraAction} className="mt-3 text-sm font-medium text-white/90">
              {hasCaptured ? "Use Photo" : "Take Photo"}
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes pulseLine {
          0% {
            opacity: 0.3;
            transform: scaleX(0.3);
          }
          50% {
            opacity: 1;
            transform: scaleX(1);
          }
          100% {
            opacity: 0.3;
            transform: scaleX(0.3);
          }
        }
      `}</style>
    </div>
  );
};

export default SearchBar;
