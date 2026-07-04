"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  Heart,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Play,
} from "lucide-react";

import DescriptorLine from "./DescriptorLine";
import RekCard from "./RekCard";
import RekSkeleton, { RekSkeletonCard } from "./RekSkeleton";

// Engine helpers
import { getBackfillRek, getMoreLikeThisSet } from "../engine/rekomendrEngine";
import type { Rek } from "../engine/rekomendrEngine";
import { recordLike } from "../lib/userPrefs";

// Descriptor typing
import type { RekCategory } from "../lib/descriptors";

// UI-facing category labels
type Category = "Movies" | "TV Shows" | "Books" | "Wine";

// Map UI label → canonical key used by descriptors/engine helpers
function toRekCategory(category: Category): RekCategory {
  if (category === "TV Shows") return "TV";
  return category;
}

// Category-aware noun for the one honest exhaustion voice: the pool is
// finite, and the way out is a typed title (which routes AI).
function nounForCategory(category: Category): string {
  if (category === "TV Shows") return "show";
  if (category === "Books") return "book";
  if (category === "Wine") return "wine";
  return "movie";
}

interface ResultsProps {
  loading: boolean;
  loadingLabel?: string;
  reks: Rek[];
  sourceImage?: string | null;
  category: Category;
  onPlayVibe?: () => void;
  persistedLikedTitles?: string[];
  persistedDislikedTitles?: string[];
  initialVertical?: Category;
  autoRunVertical?: boolean;
}

const ResultsV4: React.FC<ResultsProps> = ({
  loading,
  reks: incomingReks,
  category,
  onPlayVibe,
  persistedLikedTitles = [],
  persistedDislikedTitles = [],
}) => {
  const [reks, setReks] = useState<Rek[]>([]);
  const [liked, setLiked] = useState<Rek[]>([]);
  const [saved, setSaved] = useState<Rek[]>([]);
  // Thumbed-up cards stay in the list as marked contenders (gesture grammar:
  // thumbs = taste signal, Save = holding pen). Kept as full Reks so their
  // titles still feed the engine's liked-exclusion list after a set wipe.
  const [contenders, setContenders] = useState<Rek[]>([]);
  const [sessionDislikedTitles, setSessionDislikedTitles] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [expandedTop, setExpandedTop] = useState<number | null>(null);
  const [exiting, setExiting] = useState<number | null>(null);
  const [visibleIds, setVisibleIds] = useState<number[]>([]);

  // AI loading-state presentation:
  // - mltLoading: "+ More like this" is regenerating the whole set
  // - backfillPending: a single dislike/save swap is fetching one card
  const [mltLoading, setMltLoading] = useState(false);
  const [backfillPending, setBackfillPending] = useState(false);

  // Safety valve: pool exhaustion notice
  const [exhaustedMessage, setExhaustedMessage] = useState<string | null>(null);
  const clearExhausted = () => setExhaustedMessage(null);

  // Keep latest state for async handlers
  const reksRef = useRef<Rek[]>([]);
  useEffect(() => { reksRef.current = reks; }, [reks]);

  const allLikedTitlesRef = useRef<string[]>([]);
  const allDislikedTitlesRef = useRef<string[]>([]);
  useEffect(() => {
    allLikedTitlesRef.current = [
      ...persistedLikedTitles,
      ...liked.map((r) => r.title),
      ...saved.map((r) => r.title),
      ...contenders.map((r) => r.title),
    ];
  }, [persistedLikedTitles, liked, saved, contenders]);
  useEffect(() => {
    allDislikedTitlesRef.current = [...persistedDislikedTitles, ...sessionDislikedTitles];
  }, [persistedDislikedTitles, sessionDislikedTitles]);

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
    // Show a single inline pulse in the replacing slot — never wipe the
    // whole set for a one-card swap.
    setBackfillPending(true);
    try {
      const currentNow = reksRef.current;

      const { rek: next, exhausted } = await getBackfillRek({
        current: currentNow,
        category,
        likedTitles: allLikedTitlesRef.current,
        dislikedTitles: allDislikedTitlesRef.current,
      });

      if (!next) {
        if (exhausted) {
          setExhaustedMessage(
            `You’ve seen all our quick picks — type a ${nounForCategory(
              category
            )} you liked for fresh AI recommendations.`
          );
        } else {
          // AI backfill failure: the slot stays one short (same policy as
          // the snap lane) — no false exhaustion notice, no pool fallback.
          console.error("AI backfill failed; slot left empty.");
        }
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
    } finally {
      setBackfillPending(false);
    }
  };

  /* -----------------------------
   * MORE LIKE THIS — CATEGORY EXPLICIT
   * ----------------------------- */
  const handleMoreLikeThis = async (rek: Rek) => {
    recordLike({ category, title: rek.title, year: rek.year, action: 'more_like_this' });
    setLiked((p) => [...p, rek]);

    // Wipe the current set and show the full skeleton while the new AI set
    // generates, then render it in place.
    setExiting(null);
    setMltLoading(true);
    setVisibleIds([]);
    setReks([]);
    clearExhausted();

    try {
      const nextFive = await getMoreLikeThisSet({
        seed: rek,
        category,
        likedTitles: allLikedTitlesRef.current,
        dislikedTitles: allDislikedTitlesRef.current,
      });

      if (!nextFive || nextFive.length === 0) {
        // MLT is always AI now, so an empty set is an AI failure — never
        // pool exhaustion. Say that, honestly.
        setExhaustedMessage(
          "Reks Ray couldn’t fetch fresh picks — give it another go."
        );
        return;
      }

      setReks(nextFive);
      animateIn(nextFive.map((r) => r.id));
    } catch (err) {
      console.error("More Like This via engine failed:", err);
    } finally {
      setMltLoading(false);
    }
  };

  /* -----------------------------
   * LIKE / DISLIKE / SAVE
   * ----------------------------- */
  // Thumbs-up marks the card in place as a contender (blue fill) — no
  // removal, no holding pen. Second tap un-marks; no LikeAction exists for
  // "unlike", so un-marking is visual-only and the original write stands.
  const handleLike = (rek: Rek) => {
    if (contenders.some((c) => c.id === rek.id)) {
      setContenders((p) => p.filter((c) => c.id !== rek.id));
      return;
    }
    recordLike({ category, title: rek.title, year: rek.year, action: 'like' });
    setContenders((p) => [...p, rek]);
  };

  // Thumbs-down dismisses + backfills directly — no clarify panel. The
  // recovered clarify-pills inherit the "why" job later.
  const handleDislike = (rek: Rek) => {
    setExiting(rek.id);
    recordLike({ category, title: rek.title, year: rek.year, action: 'dislike' });
    setSessionDislikedTitles((p) => [...p, rek.title]);
    // A thumbed-up card can still be thumbed down; drop the contender mark so
    // its title doesn't sit in both the liked and disliked exclusion lists.
    setContenders((p) => p.filter((c) => c.id !== rek.id));
    setTimeout(() => {
      setReks((p) => p.filter((r) => r.id !== rek.id));
      handleBackfill(rek);
      setExiting(null);
    }, 250);
  };

  const handleSaveFromTop = (rek: Rek) => {
    setExiting(rek.id);
    recordLike({ category, title: rek.title, year: rek.year, action: 'save' });
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

  // The whole-set skeleton shows for a fresh AI search (loading) or a
  // "+ More like this" regeneration (mltLoading).
  const aiPending = loading || mltLoading;

  return (
    <div className="w-full flex flex-col items-center px-4 pt-2 pb-14 select-none">
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

      {/* Top 5 Cards — or the full skeleton while an AI set generates */}
      {aiPending ? (
        <div className="w-full max-w-xl">
          <RekSkeleton label="Reks Ray™ is finding your reks…" count={5} />
        </div>
      ) : (
        <div className="w-full max-w-xl space-y-3">
          {reks.map((rek, index) => {
          const isVisible = visibleIds.includes(rek.id);
          const isExiting = exiting === rek.id;
          const isFavorite = !!rek.isFavorite;

          return (
            <RekCard
              key={rek.id}
              genreLine={
                <DescriptorLine rek={rek} category={toRekCategory(category)} />
              }
              title={rek.title}
              year={rek.year}
              titleHref={`https://www.google.com/search?q=${encodeURIComponent(
                `${rek.title} ${rek.year}`
              )}`}
              short={rek.short}
              long={rek.long}
              detailsOpen={expandedTop === rek.id}
              onToggleDetails={() => toggleTopExpand(rek.id)}
              thumbSignal={
                contenders.some((c) => c.id === rek.id) ? "like" : null
              }
              onThumbUp={() => handleLike(rek)}
              onThumbDown={() => handleDislike(rek)}
              onSave={() => handleSaveFromTop(rek)}
              onHeart={() => toggleFavorite(rek.id)}
              isFavorite={isFavorite}
              completionActions={
                <>
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
                </>
              }
              className={[
                isExiting
                  ? "opacity-0 translate-x-3 scale-[0.97]"
                  : isVisible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-2",
                "transition-all duration-300 ease-out",
              ].join(" ")}
              style={{ transitionDelay: `${index * 60}ms` }}
            />
          );
          })}
          {/* Single inline pulse for a one-card dislike/save swap */}
          {backfillPending && <RekSkeletonCard />}
        </div>
      )}

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
