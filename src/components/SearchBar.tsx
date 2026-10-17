"use client";

// S5 — mood chips up front (docs/s4-s5-build-plan.md). The bar is now:
//   category ▾ · camera        (unchanged)
//   typed text · GO            (unchanged — a typed title or mood text)
//   ROW 1: lane chips          (always visible; one tap = results, no GO)
//   ROW 2: refiners            (after the first chip tap; optional, re-runs)
// Retired: the "+" lane dropdown, the "Lane:" line with its vibe menu and
// "Pick a lane first", and the Play button — every one of them was a step
// to learn before a result (§12.3). Chips, refiners and the reasoning for
// tap-to-search being safe live in src/lib/moodChips.ts.

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Camera, ChevronDown } from "lucide-react";
import {
  chipQuery,
  chipsFor,
  refinersFor,
  SURPRISE_ME,
  type Chip,
  type Refiner,
} from "../lib/moodChips";

interface SearchBarProps {
  onSearch: (query: string, category: string) => void;
  setLoading?: (loading: boolean) => void;
  hasHistory?: boolean;

  // ResultsV4's "Try another lane" (the pool exhaustion card) still asks
  // the bar to play the next lane.
  registerVibePlay?: (fn: () => void) => void;

  // The camera icon (mobile only — desktop has none; a desktop user won't
  // file-pick a product photo) always opens the current RekSnap flow.
  onSnap?: () => void;

  // S8a — the bar reports its category (the page sends it with each snap
  // as a hint), and a successful snap can move it: a new `n` with a value
  // re-aims the bar exactly as a tap on that category would.
  onCategoryChange?: (category: string) => void;
  categoryHint?: { value: string | null; n: number };
}

const CATEGORIES = ["Movies", "TV Shows", "Books", "Wine"];

// Same bubble as the Shortlist strip's chips (ShortlistStrip.tsx).
const bubble = (active: boolean) =>
  [
    "shrink-0 rounded-full border px-3 py-1.5 text-[13px] transition-colors",
    active
      ? "border-[#2D5AB5] bg-[#2D5AB5]/5 text-[#2D5AB5]"
      : "border-gray-300 bg-white text-gray-800 hover:border-gray-400",
  ].join(" ");

const SearchBar: React.FC<SearchBarProps> = ({
  onSearch,
  setLoading,
  registerVibePlay,
  onSnap,
  onCategoryChange,
  categoryHint,
}) => {
  const [input, setInput] = useState("");
  const [isPulsing, setIsPulsing] = useState(false);
  const [category, setCategory] = useState("Movies");
  const [openCategory, setOpenCategory] = useState(false);

  // The tapped lane chip (row 1) and the optional refiner (row 2).
  const [activeChip, setActiveChip] = useState<Chip | null>(null);
  const [refiner, setRefiner] = useState<Refiner | null>(null);

  const categoryRef = useRef(category);
  const chipRef = useRef<Chip | null>(activeChip);
  useEffect(() => {
    categoryRef.current = category;
    onCategoryChange?.(category);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);
  useEffect(() => {
    chipRef.current = activeChip;
  }, [activeChip]);

  const triggerPulse = () => {
    setIsPulsing(true);
    setTimeout(() => setIsPulsing(false), 1000);
  };

  const startSearch = (query: string, cat: string) => {
    setLoading?.(true);
    triggerPulse();
    onSearch(query, cat);
  };

  const getPlaceholder = () => {
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

  // A category switch only re-aims the bar and its chips — it never
  // searches by itself (3eaa04b). The previous results stay until a tap.
  const handleSelectCategory = (c: string) => {
    setOpenCategory(false);
    setCategory(c);
    setActiveChip(null);
    setRefiner(null);
    setInput("");
  };

  // S8a — a snap moved the bar (wine snap → Wine). Same as a category tap
  // (re-aims, never searches); a no-op when the bar is already there.
  const hintN = categoryHint?.n ?? 0;
  useEffect(() => {
    const v = categoryHint?.value;
    if (!hintN || !v || !CATEGORIES.includes(v) || v === categoryRef.current) return;
    handleSelectCategory(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintN]);

  // Row 1: one tap = results. A new lane starts unrefined.
  const tapChip = (c: Chip) => {
    setOpenCategory(false);
    setActiveChip(c);
    setRefiner(null);
    setInput("");
    startSearch(chipQuery(categoryRef.current, c, null), categoryRef.current);
  };

  // Row 2: one refiner at a time; tapping the active one clears it. Either
  // way the search re-runs.
  const tapRefiner = (r: Refiner) => {
    const lane = chipRef.current;
    if (!lane) return;
    const next = refiner?.label === r.label ? null : r;
    setRefiner(next);
    startSearch(chipQuery(categoryRef.current, lane, next), categoryRef.current);
  };

  // "Try another lane" (ResultsV4's pool exhaustion card): the next row-1
  // chip, from the canned pool — the one place pool is still opt-in.
  const playNextLane = useCallback(() => {
    const cat = categoryRef.current;
    const lanes = chipsFor(cat).filter((c) => c.label !== SURPRISE_ME);
    const current = chipRef.current;
    const idx = current ? lanes.findIndex((c) => c.label === current.label) : -1;
    const next = lanes[(idx + 1) % lanes.length];
    setActiveChip(next);
    setRefiner(null);
    setInput("");
    startSearch(`${cat}||${next.lane}||||mode:pool`, cat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    registerVibePlay?.(playNextLane);
  }, [registerVibePlay, playNextLane]);

  // Typed text is its own path, unchanged: a title lands as the anchor, a
  // mood phrase searches. It does not inherit a tapped chip.
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setOpenCategory(false);
    const trimmed = input.trim();
    setActiveChip(null);
    setRefiner(null);
    // Empty GO is still a deliberate press — generic AI discovery.
    startSearch(`${categoryRef.current}||||${trimmed}||mode:ai`, categoryRef.current);
    setInput("");
  };

  const chips = chipsFor(category);
  const refiners = refinersFor(category);

  return (
    <div className="w-full relative">
      {/* SEARCH BAR */}
      <form
        onSubmit={handleSubmit}
        className="flex flex-col sm:flex-row sm:items-center px-4 py-3 rounded-2xl
                   bg-white text-black shadow-[0_2px_6px_rgba(0,0,0,0.08)]
                   transition-all duration-200 hover:shadow-[0_3px_10px_rgba(0,0,0,0.12)]
                   focus-within:shadow-[0_3px_12px_rgba(0,0,0,0.14)]"
      >
        {/* ROW 1 (mobile) / left section (desktop): category + camera */}
        <div className="flex items-center sm:mr-3">
          <button
            type="button"
            onClick={() => setOpenCategory((prev) => !prev)}
            className="flex items-center gap-1 text-gray-700 hover:text-black font-medium whitespace-nowrap"
          >
            {category}
            <ChevronDown size={16} strokeWidth={1.7} />
          </button>

          {/* CAMERA — mobile only, and it IS RekSnap: always opens the
              current snap flow regardless of session state. */}
          <button
            type="button"
            onClick={() => onSnap?.()}
            aria-label="Snap"
            className="ml-auto pl-3 sm:hidden text-[#2D5AB5] hover:text-[#244a99] transition flex-shrink-0"
          >
            <Camera size={20} strokeWidth={1.7} />
          </button>
        </div>

        {/* ROW 2 (mobile) / right section (desktop): input + GO */}
        <div className="flex items-center flex-1 mt-2 sm:mt-0">
          <input
            type="text"
            placeholder={getPlaceholder()}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-grow bg-transparent outline-none text-black placeholder-gray-500 text-base min-w-0"
          />
          <button type="submit" className="ml-2 font-semibold text-gray-800 hover:text-black transition flex-shrink-0">
            GO
          </button>
        </div>
      </form>

      {/* CHIPS — row 1 always; row 2 after the first tap. Horizontal
          scroll only; the page keeps its own vertical scroll. */}
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: "thin" }} aria-label="Moods">
        {chips.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => tapChip(c)}
            aria-pressed={activeChip?.label === c.label}
            className={bubble(activeChip?.label === c.label)}
          >
            {c.label}
          </button>
        ))}
      </div>
      {activeChip && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: "thin" }} aria-label="Refine">
          {refiners.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => tapRefiner(r)}
              aria-pressed={refiner?.label === r.label}
              className={bubble(refiner?.label === r.label)}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      {/* CATEGORY DROPDOWN */}
      {openCategory && (
        <div className="absolute top-12 left-0 w-[150px] bg-white border border-gray-300 rounded-xl shadow-lg py-1.5 z-40">
          {CATEGORIES.map((c) => (
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

      {/* PULSE LINE */}
      <div
        className={[
          "h-[3px] mt-2 rounded-full transition-all duration-700",
          isPulsing ? "bg-gray-300 animate-[pulseLine_1.2s_ease-in-out_infinite]" : "bg-transparent",
        ].join(" ")}
      />

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
