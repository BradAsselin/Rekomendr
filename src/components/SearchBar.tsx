"use client";

// S21 — chip rows (docs/s21-chip-rows-plan.md): genres are ONE horizontal
// scrolling row (no scrollbar; it runs to the screen edge, so the last
// visible chip is cut off — the hint that it scrolls). Vibes are a second
// scrolling row that appears only once a genre is picked; tapping the
// picked genre again clears it and hides the vibes (no search).
//
// S17 — mood first (docs/s17-mood-first-plan.md, canvas Option D2): ONE
// search field — category ▾ · text · mic · camera — submitted by the
// keyboard's Search key (no GO; "Surprise me" is the empty search), and
// BOTH chip rows always showing, wrapping: genres, then vibes. A vibe
// tapped with no genre searches "Surprise me" in that vibe.
//
// S5 — mood chips up front (docs/s4-s5-build-plan.md). The bar was:
//   category ▾ · camera        (unchanged)
//   typed text · GO            (unchanged — a typed title or mood text)
//   ROW 1: lane chips          (always visible; one tap = results, no GO)
//   ROW 2: refiners            (after the first chip tap; optional, re-runs)
// Retired: the "+" lane dropdown, the "Lane:" line with its vibe menu and
// "Pick a lane first", and the Play button — every one of them was a step
// to learn before a result (§12.3). Chips, refiners and the reasoning for
// tap-to-search being safe live in src/lib/moodChips.ts.

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Camera, ChevronDown, Mic } from "lucide-react";
import {
  chipQuery,
  chipsFor,
  refinersFor,
  SURPRISE_ME,
  type Chip,
  type Refiner,
} from "../lib/moodChips";
import { speechSupported, startListening, type VoiceListener } from "../lib/voiceInput";

// S13c — what the page answers after parsing a spoken mood: mapped → the
// bar shows the lane/refiner it searched (when they are on the chip rows);
// not mapped → the words stay in the box and the closest lanes lead the
// chip row. Null = the parse failed; the words stay, GO still works.
export type VoiceAnswer = {
  mapped: boolean;
  category: string;
  laneLabel: string | null;
  refinerLabel: string | null;
  closest: string[];
};

// Approved wording (Brad, S13 brief) — the only two new lines voice adds.
const MIC_HINT = "Say what you’re in the mood for";
const FALLBACK_HINT = "Tap the keyboard mic to speak";

interface SearchBarProps {
  // S12b — a chip tap also says which chip and refiner (the Movies/TV
  // slot recipe needs them structured); typed searches send no meta.
  onSearch: (query: string, category: string, meta?: { chip: Chip; refiner: Refiner | null }) => void;
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

  // S13c — a spoken mood (the transcript and the bar's category). The
  // page parses it and runs the search; the bar only listens and shows.
  onVoice?: (transcript: string, category: string) => Promise<VoiceAnswer | null>;
}

const CATEGORIES = ["Movies", "TV Shows", "Books", "Wine"];

// S17 — Option D's chips. Unselected: transparent, a thin outline, light
// text (on the phone's navy page; quiet grey on desktop's white).
// Selected: filled brighter blue, white bold text.
const bubble = (active: boolean) =>
  [
    "shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] transition-colors",
    active
      ? "border-[#3B6BD4] bg-[#3B6BD4] font-semibold text-white"
      : "border-white/25 bg-transparent text-white/80 hover:border-white/50 sm:border-gray-300 sm:text-gray-700 sm:hover:border-gray-400",
  ].join(" ");

const SearchBar: React.FC<SearchBarProps> = ({
  onSearch,
  setLoading,
  registerVibePlay,
  onSnap,
  onCategoryChange,
  categoryHint,
  onVoice,
}) => {
  const [input, setInput] = useState("");
  const [isPulsing, setIsPulsing] = useState(false);
  const [category, setCategory] = useState("Movies");
  const [openCategory, setOpenCategory] = useState(false);

  // The tapped lane chip (row 1) and the optional refiner (row 2).
  const [activeChip, setActiveChip] = useState<Chip | null>(null);
  const [refiner, setRefiner] = useState<Refiner | null>(null);

  // S13c — the mic. `hint` replaces the placeholder while listening (or
  // after a fallback); `chipOrder` puts the closest lanes first when a
  // mood didn't map. voiceEpoch drops a late answer once the person has
  // typed, tapped a chip, pressed GO or started listening again.
  const [listening, setListening] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [chipOrder, setChipOrder] = useState<string[] | null>(null);
  const listenerRef = useRef<VoiceListener | null>(null);
  const heardRef = useRef("");
  const fellBackRef = useRef(false);
  const voiceEpoch = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

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

  const startSearch = (query: string, cat: string, meta?: { chip: Chip; refiner: Refiner | null }) => {
    setLoading?.(true);
    triggerPulse();
    onSearch(query, cat, meta);
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
    voiceEpoch.current++;
    setOpenCategory(false);
    setCategory(c);
    setActiveChip(null);
    setRefiner(null);
    setChipOrder(null);
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

  // Row 1: one tap = results. A new lane starts unrefined. S21 — a tap on
  // the picked genre clears it and its vibe, and hides the vibe row; it
  // runs no search (the results on screen stay).
  const tapChip = (c: Chip) => {
    voiceEpoch.current++;
    setChipOrder(null);
    setOpenCategory(false);
    if (chipRef.current?.label === c.label) {
      chipRef.current = null;
      setActiveChip(null);
      setRefiner(null);
      return;
    }
    setActiveChip(c);
    setRefiner(null);
    setInput("");
    startSearch(chipQuery(categoryRef.current, c, null), categoryRef.current, { chip: c, refiner: null });
  };

  // Row 2: one refiner at a time; tapping the active one clears it. Either
  // way the search re-runs. S17 — with no genre picked, a vibe searches
  // "Surprise me" in that vibe (the row is always showing now).
  const tapRefiner = (r: Refiner) => {
    voiceEpoch.current++;
    const lane =
      chipRef.current ??
      chipsFor(categoryRef.current).find((c) => c.label === SURPRISE_ME) ??
      { label: SURPRISE_ME, lane: "" };
    const next = refiner?.label === r.label ? null : r;
    setChipOrder(null);
    setOpenCategory(false);
    setActiveChip(lane);
    setRefiner(next);
    setInput("");
    startSearch(chipQuery(categoryRef.current, lane, next), categoryRef.current, { chip: lane, refiner: next });
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
    voiceEpoch.current++;
    listenerRef.current?.stop();
    setHint(null);
    setChipOrder(null);
    setOpenCategory(false);
    const trimmed = input.trim();
    setActiveChip(null);
    setRefiner(null);
    // Empty GO is still a deliberate press — generic AI discovery.
    startSearch(`${categoryRef.current}||||${trimmed}||mode:ai`, categoryRef.current);
    setInput("");
  };

  // S13c — THE MIC. One tap starts; a second tap, or a pause, stops.
  const fallBack = () => {
    fellBackRef.current = true;
    listenerRef.current = null;
    setListening(false);
    setHint(FALLBACK_HINT);
    inputRef.current?.focus();
  };

  const runVoice = async (text: string, epoch: number) => {
    setInput(text);
    if (!onVoice) return;
    setIsPulsing(true);
    const ans = await onVoice(text, categoryRef.current).catch(() => null);
    setIsPulsing(false);
    if (epoch !== voiceEpoch.current) return;
    if (!ans || !ans.mapped) {
      // The words stay; the closest lanes lead the row. Never an error.
      setInput(text);
      setChipOrder(ans?.closest?.length ? ans.closest : null);
      return;
    }
    setInput("");
    setChipOrder(null);
    if (CATEGORIES.includes(ans.category) && ans.category !== categoryRef.current) {
      categoryRef.current = ans.category;
      setCategory(ans.category);
    }
    setActiveChip(chipsFor(ans.category).find((c) => c.label === ans.laneLabel) ?? null);
    setRefiner(refinersFor(ans.category).find((r) => r.label === ans.refinerLabel) ?? null);
  };

  const tapMic = () => {
    if (listening) {
      listenerRef.current?.stop();
      return;
    }
    const epoch = ++voiceEpoch.current;
    setOpenCategory(false);
    setChipOrder(null);
    heardRef.current = "";
    fellBackRef.current = false;
    if (!speechSupported()) {
      fallBack();
      return;
    }
    const l = startListening({
      onText: (t) => {
        if (epoch !== voiceEpoch.current) return;
        heardRef.current = t;
        setInput(t);
      },
      onFallback: () => {
        if (epoch === voiceEpoch.current) fallBack();
      },
      onEnd: () => {
        listenerRef.current = null;
        if (epoch !== voiceEpoch.current || fellBackRef.current) return;
        setListening(false);
        setHint(null);
        const heard = heardRef.current.trim();
        if (heard) void runVoice(heard, epoch);
      },
    });
    if (!l) {
      fallBack();
      return;
    }
    listenerRef.current = l;
    setInput("");
    setListening(true);
    setHint(MIC_HINT);
  };

  useEffect(() => () => listenerRef.current?.stop(), []);

  const chips = chipOrder
    ? [
        ...chipOrder
          .map((l) => chipsFor(category).find((c) => c.label === l))
          .filter((c): c is Chip => !!c),
        ...chipsFor(category).filter((c) => !chipOrder.includes(c.label)),
      ]
    : chipsFor(category);
  const refiners = refinersFor(category);

  // S21 — a genre picked off-screen (by voice, or after a scroll) slides
  // into view; no smooth scroll under reduced motion.
  const activeChipEl = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const el = activeChipEl.current;
    if (!el || typeof el.scrollIntoView !== "function") return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [activeChip?.label]);

  return (
    <div className="w-full relative">
      {/* SEARCH FIELD — one row: category ▾ · text · mic · camera. The
          keyboard's Search key submits (no GO button). */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 pl-4 pr-2 py-2 rounded-2xl
                   bg-white text-black shadow-[0_2px_6px_rgba(0,0,0,0.08)]
                   transition-all duration-200 hover:shadow-[0_3px_10px_rgba(0,0,0,0.12)]
                   focus-within:shadow-[0_3px_12px_rgba(0,0,0,0.14)]"
      >
        <button
          type="button"
          onClick={() => setOpenCategory((prev) => !prev)}
          className="flex shrink-0 items-center gap-1 py-2 text-gray-700 hover:text-black font-medium whitespace-nowrap"
        >
          {category}
          <ChevronDown size={16} strokeWidth={1.7} />
        </button>

        <input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          placeholder={hint ?? getPlaceholder()}
          value={input}
          onChange={(e) => {
            if (listening) return;
            voiceEpoch.current++;
            if (hint) setHint(null);
            setInput(e.target.value);
          }}
          onBlur={() => {
            if (!listening && hint) setHint(null);
          }}
          className="min-w-0 flex-grow bg-transparent outline-none text-black placeholder-gray-500 text-base [&::-webkit-search-cancel-button]:hidden"
        />

        {/* MIC (S13c) — speak a mood; the words show in the box. Where the
            browser can't listen, the box takes focus and the keyboard's own
            dictation does it. 44px touch targets. */}
        <button
          type="button"
          onClick={tapMic}
          aria-label={MIC_HINT}
          aria-pressed={listening}
          data-testid="voice-mic"
          className={[
            "flex h-11 w-10 shrink-0 items-center justify-center transition",
            listening ? "text-red-500 animate-pulse" : "text-[#2D5AB5] hover:text-[#244a99]",
          ].join(" ")}
        >
          <Mic size={20} strokeWidth={1.7} />
        </button>

        {/* CAMERA — mobile only, and it IS RekSnap: always opens the
            current snap flow regardless of session state. */}
        <button
          type="button"
          onClick={() => onSnap?.()}
          aria-label="Snap"
          className="flex h-11 w-10 shrink-0 items-center justify-center sm:hidden text-[#2D5AB5] hover:text-[#244a99] transition"
        >
          <Camera size={20} strokeWidth={1.7} />
        </button>
      </form>

      {/* CHIPS (S21) — genres in one scrolling row; vibes in a second row
          once a genre is picked. Both rows bleed to the screen edge (the
          page's 16px gutter is undone with -mx-4/px-4) so a cut-off chip
          shows there's more; desktop's column keeps its own edges. */}
      <div
        className="mt-3 -mx-4 flex gap-2 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0"
        aria-label="Moods"
        data-testid="genre-row"
      >
        {chips.map((c) => (
          <button
            key={c.label}
            ref={activeChip?.label === c.label ? activeChipEl : undefined}
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
        <div
          className="vibe-row mt-2 -mx-4 flex gap-2 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0"
          aria-label="Refine"
          data-testid="vibe-row"
        >
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
        .vibe-row {
          animation: vibeIn 220ms ease-out;
        }
        @keyframes vibeIn {
          from {
            opacity: 0;
            transform: translateY(-6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .vibe-row {
            animation: none;
          }
        }
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
