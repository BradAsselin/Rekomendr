"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Camera, ChevronDown, Plus, X, Play, ChevronUp } from "lucide-react";

interface SearchBarProps {
  onSearch: (query: string, category: string) => void;
  setLoading?: (loading: boolean) => void;
  hasHistory?: boolean;

  // ✅ allow Page / ResultsV4 to trigger Play
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
  Wine: [
    "Crisp & Dry",
    "Easy Sipper",
    "Special Occasion",
    "Bright & Fresh",
    "Rich & Cozy",
  ],
};

// Always returns a valid vibe list
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

  const [autoGoVisible, setAutoGoVisible] = useState(false);
  const autoGoTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ✅ Vibe state
  const [vibeIndex, setVibeIndex] = useState(0);
  const [activeVibe, setActiveVibe] = useState<string | null>(null);

  // ✅ Vibe dropdown under Feeling line
  const [openVibes, setOpenVibes] = useState(false);

  // ✅ Track what last triggered results, so Feeling can be honest
  const [lastSearchMode, setLastSearchMode] = useState<
    "vibe" | "clarifier" | "typed" | "categoryOnly" | "photo" | null
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

  // -----------------------------
  // Refs to avoid stale-state in registered Play handler
  // -----------------------------
  const categoryRef = useRef(category);
  const vibeIndexRef = useRef(vibeIndex);

  useEffect(() => {
    categoryRef.current = category;
  }, [category]);

  useEffect(() => {
    vibeIndexRef.current = vibeIndex;
  }, [vibeIndex]);

  /* -----------------------------
   * HELPERS
   * ----------------------------- */

  // ✅ Use "||" format (engine supports both, this is cleaner + consistent)
  const buildQuery = (cat: string, clar: string | null, text: string) => {
    const safeText = text.trim();
    const clarPart = clar ?? "";
    return `${cat}||${clarPart}||${safeText}`;
  };

  const triggerPulse = () => {
    setIsPulsing(true);
    setTimeout(() => setIsPulsing(false), 1000);
  };

  // ✅ Critical fix: allow passing category explicitly (prevents stale-state bugs)
  const startSearch = (query: string, catOverride?: string) => {
    const cat = catOverride ?? categoryRef.current;
    setLoading?.(true);
    triggerPulse();
    onSearch(query, cat);
  };

  const clearVibeMode = () => {
    setActiveVibe(null);
  };

  const closeAllDropdowns = () => {
    setOpenCategory(false);
    setOpenClarifiers(false);
    setOpenVibes(false);
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
   * AUTO-GO CONTROL
   * ----------------------------- */
  const cancelAutoGo = () => {
    if (autoGoTimerRef.current) clearTimeout(autoGoTimerRef.current);
    autoGoTimerRef.current = null;
    setAutoGoVisible(false);
  };

  const scheduleAutoGo = (cat: string, clar: string) => {
    if (input.trim()) return;

    cancelAutoGo();
    autoGoTimerRef.current = setTimeout(() => {
      const q = buildQuery(cat, clar, "");
      setAutoGoVisible(true);

      // clarifier auto-go should reflect "clarifier" mode (not vibe)
      setLastSearchMode("clarifier");
      setLastTypedSeed("");
      startSearch(q, cat);

      setTimeout(() => setAutoGoVisible(false), 1200);
    }, AUTO_GO_DELAY_MS);
  };

  /* -----------------------------
   * VIBE RUNNER (single source of truth)
   * - Encodes as clarifier: "vibe:<name>"
   * ----------------------------- */
  const runVibe = useCallback(
    (vibeName: string, catOverride?: string, indexOverride?: number) => {
      const cat = catOverride ?? categoryRef.current;

      cancelAutoGo();
      closeAllDropdowns();

      // Vibe should not fight with clarifiers / input
      setClarifier(null);
      setInput("");

      setActiveVibe(vibeName);
      setLastSearchMode("vibe");
      setLastTypedSeed("");

      // keep index aligned when we chose a specific vibe (dropdown)
      if (typeof indexOverride === "number") {
        setVibeIndex(indexOverride);
      }

      const q = buildQuery(cat, `vibe:${vibeName}`, "");
      startSearch(q, cat);
    },
    // startSearch uses refs; safe to keep deps empty-ish besides functions created here
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /* -----------------------------
   * VIBE PLAY (ONE BUTTON → RESULTS)
   * - category-scoped
   * ----------------------------- */
  const handleVibePlayStable = useCallback(() => {
    const cat = categoryRef.current;
    const vibes = getVibesForCategory(cat);
    const nextIndex = (vibeIndexRef.current + 1) % vibes.length;
    const vibe = vibes[nextIndex];

    setVibeIndex(nextIndex);
    runVibe(vibe, cat, nextIndex);
  }, [runVibe]);

  // ✅ Register stable Play handler with Page.tsx (once)
  useEffect(() => {
    registerVibePlay?.(handleVibePlayStable);
  }, [registerVibePlay, handleVibePlayStable]);

  /* -----------------------------
   * CATEGORY SELECT
   * ----------------------------- */
  const handleSelectCategory = (c: string) => {
    cancelAutoGo();
    setCategory(c);
    setOpenCategory(false);

    // Reset refiners
    setClarifier(null);
    setOpenClarifiers(false);
    setInput("");
    clearVibeMode();
    setVibeIndex(0);
    setAutoGoVisible(false);
    setOpenVibes(false);

    // Category-only is "Surprise me"
    setLastSearchMode("categoryOnly");
    setLastTypedSeed("");

    // Immediate search on category select (empty query valid)
    const q = buildQuery(c, null, "");
    startSearch(q, c);
  };

  /* -----------------------------
   * CLARIFIERS — VERTICAL AWARE
   * ----------------------------- */

  const movieClarifiers = ["Comedy", "Thriller", "Action", "Drama", "Romance", "Sci-Fi"];
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

  const handleSelectClarifier = (c: string) => {
    setClarifier(c);
    setOpenClarifiers(false);
    cancelAutoGo();
    clearVibeMode();
    setOpenVibes(false);

    // Clarifier intent should show as Feeling: <clarifier>
    setLastSearchMode("clarifier");
    setLastTypedSeed("");

    scheduleAutoGo(category, c);
  };

  /* -----------------------------
   * FEELING LABEL (ALWAYS VISIBLE)
   * ----------------------------- */
  const getFeelingLabel = () => {
    // Vibe mode wins
    if (activeVibe) return activeVibe;

    // Photo
    if (lastSearchMode === "photo") return "Based on your photo";

    // Typed seed
    if (lastSearchMode === "typed" && lastTypedSeed.trim())
      return `Based on “${lastTypedSeed.trim()}”`;

    // Clarifier chosen
    if (clarifier) return clarifier;

    // Category-only / empty
    return "Surprise me";
  };

  /* -----------------------------
   * SUBMIT LOGIC
   * ----------------------------- */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    cancelAutoGo();
    closeAllDropdowns();

    // Photo flow (if captured)
    if (capturedPhoto) {
      setLoading?.(true);
      triggerPulse();
      onSearch("__PHOTO__:" + capturedPhoto, category);
      setCapturedPhoto(null);
      setInput("");
      clearVibeMode();

      setLastSearchMode("photo");
      setLastTypedSeed("");

      return;
    }

    const trimmed = input.trim();
    const q = buildQuery(category, clarifier, trimmed);

    // Determine mode for Feeling label
    if (trimmed) {
      setLastSearchMode("typed");
      setLastTypedSeed(trimmed);
    } else if (clarifier) {
      setLastSearchMode("clarifier");
      setLastTypedSeed("");
    } else {
      setLastSearchMode("categoryOnly");
      setLastTypedSeed("");
    }

    // Allow empty GO (category-only)
    startSearch(q, category);

    setInput("");
    clearVibeMode();
  };

  /* -----------------------------
   * CAMERA HANDLERS (unchanged)
   * ----------------------------- */
  const handleOpenCamera = () => {
    cancelAutoGo();
    closeAllDropdowns();
    clearVibeMode();
    setOpenVibes(false);
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
        onSearch("__PHOTO__:" + capturedPhoto, category);
        clearVibeMode();

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
  const feelingLabel = getFeelingLabel();

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
        {/* ✅ VIBE PLAY (front-door) */}
        <button
          type="button"
          onClick={handleVibePlayStable}
          title="Play a vibe"
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
                clearVibeMode();
                setOpenClarifiers((prev) => !prev);
                setOpenCategory(false);
                setOpenVibes(false);
              }}
              className="text-gray-500 hover:text-gray-700 transition"
            >
              <Plus size={15} strokeWidth={1.8} />
            </button>
          )}

          {clarifier && <span className="text-sm text-gray-600 ml-1">{clarifier}</span>}
        </div>

        {/* INPUT */}
        <input
          type="text"
          placeholder={getPlaceholder()}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            cancelAutoGo();
            clearVibeMode();
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

        {/* GO BUTTON */}
        <button type="submit" className="font-semibold text-gray-800 hover:text-black transition">
          GO
        </button>
      </form>

      {/* ✅ FEELING (ALWAYS VISIBLE) + CHEVRON */}
      <div className="mt-2 text-xs text-gray-500 pl-1 flex items-center gap-1">
        <span>
          Feeling: <span className="font-semibold text-gray-700">{feelingLabel}</span>
        </span>

        <button
          type="button"
          onClick={() => {
            cancelAutoGo();
            setOpenVibes((p) => !p);
            setOpenCategory(false);
            setOpenClarifiers(false);
          }}
          className="ml-1 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-gray-600 hover:text-black hover:border-gray-300 transition"
          title="Pick a vibe"
        >
          {openVibes ? <ChevronUp size={14} strokeWidth={1.8} /> : <ChevronDown size={14} strokeWidth={1.8} />}
        </button>
      </div>

      {/* ✅ VIBE DROPDOWN (UNDER FEELING LINE) */}
      {openVibes && (
        <div className="mt-2 w-full max-w-[320px] bg-white border border-gray-300 rounded-xl shadow-lg py-2 z-40">
          {getVibesForCategory(category).map((v, idx) => (
            <button
              key={v}
              onClick={() => runVibe(v, category, idx)}
              className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition"
            >
              {v}
            </button>
          ))}
        </div>
      )}

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
      {openClarifiers && !clarifier && (
        <div className="absolute top-[108%] left-0 w-[150px] bg-white border border-gray-300 rounded-xl shadow-lg py-1.5 z-40">
          {getClarifierSet().map((g) => (
            <button
              key={g}
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
