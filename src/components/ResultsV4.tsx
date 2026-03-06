"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  ThumbsUp,
  ThumbsDown,
  Heart,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Play,
} from "lucide-react";

import DescriptorLine from "./DescriptorLine";

// Engine helpers
import { getBackfillRek, getMoreLikeThisSet } from "../engine/rekomendrEngine";
import type { Rek } from "../engine/rekomendrEngine";

// Descriptor typing
import type { RekCategory } from "../lib/descriptors";

// UI-facing category labels
type Category = "Movies" | "TV Shows" | "Books" | "Wine";

// Map UI label → canonical key used by descriptors/engine helpers
function toRekCategory(category: Category): RekCategory {
  if (category === "TV Shows") return "TV";
  return category;
}

interface ResultsProps {
  loading: boolean;
  loadingLabel?: string;
  reks: Rek[];
  sourceImage?: string | null;
  category: Category;
  onPlayVibe?: () => void;
}

const ResultsV4: React.FC<ResultsProps> = ({
  loading,
  loadingLabel,
  reks: incomingReks,
  category,
  onPlayVibe,
}) => {
  const [reks, setReks] = useState<Rek[]>([]);
  const [liked, setLiked] = useState<Rek[]>([]);
  const [saved, setSaved] = useState<Rek[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [expandedTop, setExpandedTop] = useState<number | null>(null);
  const [exiting, setExiting] = useState<number | null>(null);
  const [showLoader, setShowLoader] = useState(false);
  const [visibleIds, setVisibleIds] = useState<number[]>([]);
  const loaderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Safety valve: pool exhaustion notice
  const [exhaustedMessage, setExhaustedMessage] = useState<string | null>(null);
  const clearExhausted = () => setExhaustedMessage(null);

  // Clarify tile
  const [clarifyTarget, setClarifyTarget] = useState<Rek | null>(null);
  const [clarifyOptions, setClarifyOptions] = useState<string[]>([]);
  const [clarifyVisible, setClarifyVisible] = useState(false);
  const clarifyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep latest state for async handlers
  const reksRef = useRef<Rek[]>([]);
  useEffect(() => {
    reksRef.current = reks;
  }, [reks]);

  // Auto-clear exhaustion notice when fresh results arrive
  useEffect(() => {
    if (incomingReks.length > 0) {
      setExhaustedMessage(null);
    }
  }, [incomingReks]);

  /* -----------------------------
   * STAGGER ANIMATION
   * ----------------------------- */
  const animateIn = (ids: number[]) => {
    setVisibleIds([]);
    ids.forEach((id, index) => {
      setTimeout(() => setVisibleIds((p) => [...p, id]), index * 80);
    });
  };

  /* -----------------------------
   * SYNC WITH PROPS (ENGINE → UI)
   * ----------------------------- */
  useEffect(() => {
    if (!incomingReks || incomingReks.length === 0) {
      setReks([]);
      setVisibleIds([]);
      return;
    }

    const normalized = incomingReks.map((r) => ({
      ...r,
      isFavorite: r.isFavorite ?? false,
    }));

    setReks(normalized);
    animateIn(normalized.map((r) => r.id));
  }, [incomingReks]);

  /* -----------------------------
   * LOADER (DELAYED)
   * ----------------------------- */
  useEffect(() => {
    if (loading) {
      if (loaderTimer.current) clearTimeout(loaderTimer.current);
      loaderTimer.current = setTimeout(() => setShowLoader(true), 120);
    } else {
      if (loaderTimer.current) clearTimeout(loaderTimer.current);
      setShowLoader(false);
    }
  }, [loading]);

  /* -----------------------------
   * CLARIFY LOGIC
   * ----------------------------- */
  const getClarifyOptions = (_rek: Rek) => [
    "Too slow",
    "Too dark / intense",
    "Not my genre",
    "Seen it already",
  ];

  const startClarifyFor = (rek: Rek) => {
    if (clarifyTimeoutRef.current) clearTimeout(clarifyTimeoutRef.current);

    setClarifyTarget(rek);
    setClarifyOptions(getClarifyOptions(rek));
    setClarifyVisible(true);

    clarifyTimeoutRef.current = setTimeout(() => finalizeClarify(), 4000);
  };

  const finalizeClarify = (_reason?: string) => {
    if (!clarifyTarget) return;

    if (clarifyTimeoutRef.current) clearTimeout(clarifyTimeoutRef.current);

    setClarifyVisible(false);
    const target = clarifyTarget;
    setClarifyTarget(null);

    setReks((prev) => prev.filter((r) => r.id !== target.id));
    handleBackfill(target);
  };

  /* -----------------------------
   * FAVORITE TOGGLE
   * ----------------------------- */
  const toggleFavorite = (rekId: number) => {
    const toggle = (list: Rek[]) =>
      list.map((r) =>
        r.id === rekId ? { ...r, isFavorite: !r.isFavorite } : r
      );

    setReks((prev) => toggle(prev));
    setLiked((prev) => toggle(prev));
    setSaved((prev) => toggle(prev));
  };

  /* -----------------------------
   * BACKFILL — CATEGORY EXPLICIT
   * ----------------------------- */
  const handleBackfill = async (_removed: Rek) => {
    try {
      const currentNow = reksRef.current;

      const next = await getBackfillRek({
        current: currentNow,
        category,
      });

      if (!next) {
        setExhaustedMessage(
          "You’ve drained this path. Hit Play for a new vibe, or switch category to keep it fresh."
        );
        return;
      }

      clearExhausted();

      setReks((prev) => {
        if (prev.length >= 5) return prev;

        const updated = [
          ...prev,
          { ...next, isFavorite: next.isFavorite ?? false },
        ];

        animateIn(updated.map((r) => r.id));
        return updated;
      });
    } catch (err) {
      console.error("Backfill via engine failed:", err);
    }
  };

  /* -----------------------------
   * MORE LIKE THIS — CATEGORY EXPLICIT
   * ----------------------------- */
  const handleMoreLikeThis = async (rek: Rek) => {
    setExiting(rek.id);

    setTimeout(async () => {
      try {
        setLiked((p) => [...p, rek]);

        const nextFive = await getMoreLikeThisSet({ seed: rek, category });

        if (!nextFive || nextFive.length === 0) {
          setExhaustedMessage(
            "No fresh Reks left for this path. Hit Play for a new vibe or try a different seed."
          );
          return;
        }

        clearExhausted();
        setReks(nextFive);
        animateIn(nextFive.map((r) => r.id));
      } catch (err) {
        console.error("More Like This via engine failed:", err);
      } finally {
        setExiting(null);
      }
    }, 250);
  };

  /* -----------------------------
   * LIKE / DISLIKE / SAVE
   * ----------------------------- */
  const handleLike = (rek: Rek) => {
    setExiting(rek.id);
    setTimeout(() => {
      setLiked((p) => [...p, rek]);
      setReks((p) => p.filter((r) => r.id !== rek.id));
      handleBackfill(rek);
      setExiting(null);
    }, 250);
  };

  const handleDislike = (rek: Rek) => startClarifyFor(rek);

  const handleSaveFromTop = (rek: Rek) => {
    setExiting(rek.id);
    setTimeout(() => {
      setSaved((p) => [...p, rek]);
      setReks((p) => p.filter((r) => r.id !== rek.id));
      handleBackfill(rek);
      setExiting(null);
    }, 250);
  };

  const handleSaveFromLiked = (rek: Rek) => {
    setLiked((p) => p.filter((r) => r.id !== rek.id));
    setSaved((p) => [...p, rek]);
  };

  /* -----------------------------
   * EXPANDERS
   * ----------------------------- */
  const toggleExpand = (id: number) =>
    setExpanded((prev) => (prev === id ? null : id));

  const toggleTopExpand = (id: number) =>
    setExpandedTop((prev) => (prev === id ? null : id));

  /* -----------------------------
   * TRAILER OPEN
   * ----------------------------- */
  const openTrailer = (rek: Rek) => {
    const url =
      rek.trailerUrl ||
      `https://www.youtube.com/results?search_query=${encodeURIComponent(
        rek.title + " trailer"
      )}`;
    window.open(url, "_blank");
  };

  return (
    <div className="w-full flex flex-col items-center px-4 pt-2 pb-14 select-none">
      {/* Loader */}
      <div
        className={[
          "text-sm text-gray-600 mb-2 transition-all duration-300",
          showLoader
            ? "opacity-100 max-h-8"
            : "opacity-0 max-h-0 overflow-hidden",
        ].join(" ")}
      >
        {loadingLabel || "Getting your Reks…"}
      </div>

      {/* Safety Valve Notice */}
      {exhaustedMessage && (
        <div className="w-full max-w-xl mb-3">
          <div className="bg-white border border-amber-300 rounded-2xl p-4 shadow-sm">
            <div className="text-sm text-gray-800">{exhaustedMessage}</div>

            <div className="mt-3 flex gap-2">
              <button
                onClick={() => onPlayVibe?.()}
                className="px-3 py-2 rounded-xl text-sm bg-gray-900 text-white hover:opacity-90"
              >
                <Play size={16} className="inline-block mr-1" />
                New vibe
              </button>

              <button
                onClick={() => setExhaustedMessage(null)}
                className="px-3 py-2 rounded-xl text-sm border border-gray-300 bg-white hover:bg-gray-50"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top 5 Cards */}
      <div className="w-full max-w-xl space-y-3">
        {reks.map((rek, index) => {
          const isVisible = visibleIds.includes(rek.id);
          const isExiting = exiting === rek.id;
          const isClarify = clarifyVisible && clarifyTarget?.id === rek.id;
          const isFavorite = !!rek.isFavorite;

          if (isClarify) {
            return (
              <div
                key={rek.id}
                className={[
                  "bg-white border border-blue-300 rounded-2xl p-4 shadow-md",
                  isVisible
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-2",
                  "transition-all duration-300 ease-out",
                ].join(" ")}
                style={{ transitionDelay: `${index * 60}ms` }}
              >
                <p className="text-sm font-semibold text-gray-800">
                  Why wasn’t this a fit?
                </p>
                <p className="text-xs text-gray-600 mt-1 mb-3">
                  Help us learn your taste.
                </p>

                <div className="flex flex-wrap gap-2">
                  {clarifyOptions.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => finalizeClarify(opt)}
                      className="px-3 py-1.5 rounded-full border border-gray-300 text-xs text-gray-700 hover:bg-gray-100"
                    >
                      {opt}
                    </button>
                  ))}
                  <button
                    onClick={() => finalizeClarify()}
                    className="text-[11px] uppercase tracking-wide text-gray-400 hover:text-gray-600"
                  >
                    Skip
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div
              key={rek.id}
              className={[
                "bg-white border border-gray-300 rounded-2xl p-4 shadow-sm",
                isExiting
                  ? "opacity-0 translate-x-3 scale-[0.97]"
                  : isVisible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-2",
                "transition-all duration-300 ease-out",
              ].join(" ")}
              style={{ transitionDelay: `${index * 60}ms` }}
            >
              <DescriptorLine rek={rek} category={toRekCategory(category)} />

              {/* TITLE + THUMBS */}
              <div className="flex justify-between items-start mb-2">
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(
                    `${rek.title} ${rek.year}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-[17px] hover:underline"
                >
                  {rek.title} ({rek.year})
                </a>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleLike(rek)}
                    className="p-1 rounded-full border border-gray-400 text-gray-500 hover:border-black hover:text-black"
                  >
                    <ThumbsUp size={18} />
                  </button>

                  <button
                    onClick={() => handleDislike(rek)}
                    className="p-1 rounded-full border border-gray-400 text-gray-500 hover:border-black hover:text-black"
                  >
                    <ThumbsDown size={18} />
                  </button>
                </div>
              </div>

              {/* SHORT DESCRIPTION + EXPAND */}
              <p className="text-sm text-gray-700 mb-2 leading-6">
                 {rek.short}{" "}
                 <button
                 onClick={() => toggleTopExpand(rek.id)}
                 className="text-xs text-gray-500 hover:underline"
               >
                {expandedTop === rek.id ? "Hide details" : "Show details"}
               </button>
             </p>

              {expandedTop === rek.id && (
                <p className="text-sm text-gray-600 mb-3">
                  {rek.long.length > 420
                    ? rek.long.slice(0, 420).trim() + "…"
                    : rek.long}
                </p>
              )}

              {/* INLINE ACTION ROW */}
              <div className="flex items-center gap-4 text-sm text-gray-700 mt-1">
                <button
                  onClick={() => handleMoreLikeThis(rek)}
                  className="hover:underline"
                >
                  + More like this
                </button>

                <button
                  onClick={() => openTrailer(rek)}
                  className="hover:underline flex items-center gap-1"
                >
                  <span>▶</span> Trailer
                </button>

                <button
                  onClick={() => handleSaveFromTop(rek)}
                  className="hover:underline flex items-center gap-1"
                >
                  <Bookmark size={16} />
                  Save
                </button>

                <button
                  onClick={() => toggleFavorite(rek.id)}
                  className="ml-auto p-1 rounded-full border border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-500 transition"
                >
                  <Heart
                    size={18}
                    strokeWidth={1.6}
                    fill={isFavorite ? "#666666" : "none"}
                  />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* SAVED REKS */}
      {saved.length > 0 && (
        <div className="w-full max-w-xl mt-8 px-1 mx-auto">
          <h3 className="text-lg font-semibold text-center mb-3">
            Your Saved Reks
          </h3>

          <ul className="space-y-3">
            {saved.map((rek) => {
              const isFavorite = !!rek.isFavorite;
              const open = expanded === rek.id;

              return (
                <li
                  key={rek.id}
                  className="bg-white border border-gray-300 rounded-2xl p-4 shadow-sm w-full"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">
                      {rek.title} ({rek.year})
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleFavorite(rek.id)}
                        className="p-1 rounded-full border border-gray-300 text-gray-500 transition"
                      >
                        <Heart size={16} fill={isFavorite ? "#666666" : "none"} />
                      </button>

                      <button
                        onClick={() => toggleExpand(rek.id)}
                        className="text-gray-500"
                      >
                        {open ? (
                          <ChevronUp size={16} />
                        ) : (
                          <ChevronDown size={16} />
                        )}
                      </button>
                    </div>
                  </div>

                  {open && <p className="text-sm text-gray-600 mt-2">{rek.long}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* LIKED REKS */}
      {liked.length > 0 && (
        <div className="w-full max-w-xl mt-8">
          <h3 className="text-lg font-semibold text-center mb-3">
            Your Liked Reks
          </h3>

          <ul className="space-y-3">
            {liked.map((rek) => {
              const isFavorite = !!rek.isFavorite;
              const open = expanded === rek.id;

              return (
                <li
                  key={rek.id}
                  className="bg-white border border-gray-300 rounded-xl p-4 shadow-sm"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">
                      {rek.title} ({rek.year})
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleFavorite(rek.id)}
                        className="p-1 rounded-full border border-gray-300 text-gray-500 transition"
                      >
                        <Heart size={16} fill={isFavorite ? "#666666" : "none"} />
                      </button>

                      <button
                        onClick={() => handleSaveFromLiked(rek)}
                        className="p-1 rounded-full border border-gray-300 text-gray-500"
                      >
                        <Bookmark size={16} />
                      </button>

                      <button
                        onClick={() => toggleExpand(rek.id)}
                        className="text-gray-500"
                      >
                        {open ? (
                          <ChevronUp size={16} />
                        ) : (
                          <ChevronDown size={16} />
                        )}
                      </button>
                    </div>
                  </div>

                  {open && <p className="text-sm text-gray-600 mt-2">{rek.long}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ResultsV4;
