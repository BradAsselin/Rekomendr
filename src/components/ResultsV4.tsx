"use client";

import React, { useEffect, useState, useRef } from "react";
import { Play } from "lucide-react";

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

// Graduation capacity: marked cards (thumbed-up or saved) hold their
// position but stop counting toward the five — the five slots are for
// unmarked candidates only. Same model as the snap lane.
function countUnmarked(list: Rek[], contenders: Rek[], saved: Rek[]): number {
  return list.filter(
    (r) =>
      !contenders.some((c) => c.id === r.id) &&
      !saved.some((s) => s.id === r.id)
  ).length;
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
  // Marked cards stay in the list (graduation model, same as the snap lane):
  // thumbs-up marks a contender, Save marks a keeper — both mark in place,
  // toggle off on second tap, and stop counting toward the five. Kept as
  // full Reks so their titles still feed the engine's liked-exclusion list
  // after a set wipe.
  const [contenders, setContenders] = useState<Rek[]>([]);
  const [saved, setSaved] = useState<Rek[]>([]);
  const [sessionDislikedTitles, setSessionDislikedTitles] = useState<string[]>([]);
  const [expandedTop, setExpandedTop] = useState<number | null>(null);
  const [exiting, setExiting] = useState<number | null>(null);
  const [visibleIds, setVisibleIds] = useState<number[]>([]);

  // AI loading-state presentation:
  // - mltLoading: "+ More like this" is regenerating the unmarked cards
  // - pendingBackfills: one-card swaps in flight (dismiss or mark), one
  //   inline skeleton each; in-flight backfills count as unmarked supply
  const [mltLoading, setMltLoading] = useState(false);
  const [pendingBackfills, setPendingBackfills] = useState(0);

  // Safety valve: pool exhaustion notice
  const [exhaustedMessage, setExhaustedMessage] = useState<string | null>(null);
  const clearExhausted = () => setExhaustedMessage(null);

  // Keep latest state for async handlers
  const reksRef = useRef<Rek[]>([]);
  useEffect(() => { reksRef.current = reks; }, [reks]);

  // Mark-state mirrors for async updaters: backfill responses decide
  // capacity from the marks at RESPONSE time, not at call time.
  const contendersRef = useRef<Rek[]>([]);
  const savedRef = useRef<Rek[]>([]);
  useEffect(() => { contendersRef.current = contenders; }, [contenders]);
  useEffect(() => { savedRef.current = saved; }, [saved]);

  const allLikedTitlesRef = useRef<string[]>([]);
  const allDislikedTitlesRef = useRef<string[]>([]);
  useEffect(() => {
    allLikedTitlesRef.current = [
      ...persistedLikedTitles,
      ...saved.map((r) => r.title),
      ...contenders.map((r) => r.title),
    ];
  }, [persistedLikedTitles, saved, contenders]);
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
    setSaved((prev) => toggle(prev));
  };

  /* -----------------------------
   * BACKFILL — CATEGORY EXPLICIT
   * ----------------------------- */
  const handleBackfill = async (_removed: Rek) => {
    // Show a single inline pulse in the replacing slot — never wipe the
    // whole set for a one-card swap.
    setPendingBackfills((p) => p + 1);
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
        // Capacity is five UNMARKED cards — marked keepers hold their
        // position and don't count. Marks read at response time via refs.
        if (countUnmarked(prev, contendersRef.current, savedRef.current) >= 5)
          return prev;

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
      setPendingBackfills((p) => Math.max(0, p - 1));
    }
  };

  /* -----------------------------
   * MORE LIKE THIS — CATEGORY EXPLICIT
   * ----------------------------- */
  const handleMoreLikeThis = async (rek: Rek) => {
    recordLike({ category, title: rek.title, year: rek.year, action: 'more_like_this' });

    // Graduation: marked cards (thumbed-up or saved) survive the wipe and
    // hold the top of the list; only the unmarked cards regenerate — the
    // skeletons pulse beneath the keepers, and the fresh five land there.
    const marked = reks.filter(
      (r) =>
        contenders.some((c) => c.id === r.id) ||
        saved.some((s) => s.id === r.id)
    );
    setExiting(null);
    setMltLoading(true);
    setReks(marked);
    setVisibleIds(marked.map((r) => r.id));
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
        // pool exhaustion. Say that, honestly. Marked keepers stay put.
        setExhaustedMessage(
          "Reks Ray couldn’t fetch fresh picks — give it another go."
        );
        return;
      }

      // Guard against the generator repeating a surviving keeper.
      const have = new Set(
        reksRef.current.map((r) => r.title.trim().toLowerCase())
      );
      const fresh = nextFive.filter(
        (r) => !have.has(r.title.trim().toLowerCase())
      );

      // Keepers are already visible — only the fresh cards stagger in.
      setReks((prev) => [...prev, ...fresh]);
      fresh.forEach((r, index) => {
        setTimeout(() => setVisibleIds((p) => [...p, r.id]), index * 80);
      });
    } catch (err) {
      console.error("More Like This via engine failed:", err);
    } finally {
      setMltLoading(false);
    }
  };

  /* -----------------------------
   * LIKE / DISLIKE / SAVE
   * ----------------------------- */
  // Graduation: marking a card plants it — it stops counting toward the
  // five, so backfill one fresh unmarked candidate. Fires only when the
  // mark actually drops unmarked supply below five (marking a carried
  // extra doesn't fetch); in-flight backfills count as supply. Skipped
  // mid-MLT: the fresh five are already on their way.
  const maybeBackfillAfterMark = (
    rek: Rek,
    nextContenders: Rek[],
    nextSaved: Rek[]
  ) => {
    if (mltLoading) return;
    if (!reks.some((r) => r.id === rek.id)) return;
    if (countUnmarked(reks, nextContenders, nextSaved) + pendingBackfills >= 5)
      return;
    void handleBackfill(rek);
  };

  // Thumbs-up marks the card in place as a contender (blue fill) — no
  // removal, no holding pen. Second tap un-marks; no LikeAction exists for
  // "unlike", so un-marking is visual-only and the original write stands.
  // Un-marking never dismisses and never backfills: a resulting sixth
  // unmarked card is carried until the next dismissal (whose backfill
  // guard then declines).
  const handleLike = (rek: Rek) => {
    if (contenders.some((c) => c.id === rek.id)) {
      setContenders((p) => p.filter((c) => c.id !== rek.id));
      return;
    }
    recordLike({ category, title: rek.title, year: rek.year, action: 'like' });
    const nextContenders = [...contenders, rek];
    setContenders(nextContenders);
    maybeBackfillAfterMark(rek, nextContenders, saved);
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

  // Save marks in place and toggles: second tap un-marks — no dismissal,
  // no holding pen. Un-marking is visual-only (no signal write); the
  // original save signal stands. Un-saving also re-arms swipe on the card
  // (marked cards are swipe-protected).
  const handleSave = (rek: Rek) => {
    if (saved.some((s) => s.id === rek.id)) {
      setSaved((p) => p.filter((s) => s.id !== rek.id));
      return;
    }
    recordLike({ category, title: rek.title, year: rek.year, action: 'save' });
    const nextSaved = [...saved, rek];
    setSaved(nextSaved);
    maybeBackfillAfterMark(rek, contenders, nextSaved);
  };

  /* -----------------------------
   * EXPANDERS
   * ----------------------------- */
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

      {/* Top 5 Cards — or the full skeleton while a fresh AI search
          generates. An MLT regeneration keeps the marked keepers on screen
          and pulses beneath them instead (see below). */}
      {loading ? (
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
              // Swipe grammar (touch only): a committed swipe in either
              // direction dismisses + backfills (thumbs-down). Liked or
              // saved cards don't arm — same protection as the snap lane.
              swipeable
              thumbSignal={
                contenders.some((c) => c.id === rek.id) ? "like" : null
              }
              saved={saved.some((s) => s.id === rek.id)}
              onThumbUp={() => handleLike(rek)}
              onThumbDown={() => handleDislike(rek)}
              onSave={() => handleSave(rek)}
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
          {/* MLT regeneration: keepers stay above, the fresh five land in
              these slots. */}
          {mltLoading && (
            <RekSkeleton label="Reks Ray™ is finding your reks…" count={5} />
          )}
          {/* One inline pulse per in-flight one-card swap (dismiss or mark) */}
          {Array.from({ length: pendingBackfills }).map((_, i) => (
            <RekSkeletonCard key={`backfill-${i}`} />
          ))}
        </div>
      )}

    </div>
  );
};

export default ResultsV4;
