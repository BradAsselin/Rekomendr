"use client";

import React, { useEffect, useState, useRef } from "react";
import { Play } from "lucide-react";

import DescriptorLine from "./DescriptorLine";
import { TrailerVerb, WhereToWatchVerb, titleInfoUrl } from "./MediaVerbs";
import RekCard from "./RekCard";
import RekSkeleton, { RekSkeletonCard } from "./RekSkeleton";
import RekTrail, { TrailRow } from "./RekTrail";

// Scroll-compensated layout commits for trail migrations (see the module
// comment — layout changes once, animation is transform/opacity only).
import { compensatedCommit } from "../lib/scrollCompensation";

// Engine helpers
import { getBackfillRek, getMoreLikeThisSet } from "../engine/rekomendrEngine";
import type { Rek } from "../engine/rekomendrEngine";
import { recordLike } from "../lib/userPrefs";

// Descriptor typing
import type { RekCategory } from "../lib/descriptors";

// Media gate — same set the snap lane's anchor verbs use, so the two lanes
// can never drift. "movies" and "tv shows" are exact members; Books/Wine
// are not, so they get no media verbs (retiring the old Wine-Trailer wart).
import { MEDIA_CATEGORIES } from "../lib/categoryGates";

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

// Graduation upward: a marked card (thumbed-up or saved) LEAVES the five
// and joins the compact trail at the top of the results — the frontier
// list holds only unmarked candidates, so its length IS the capacity
// count. Same model as the snap lane.

interface ResultsProps {
  loading: boolean;
  loadingLabel?: string;
  reks: Rek[];
  category: Category;
  onPlayVibe?: () => void;
  persistedLikedTitles?: string[];
  persistedDislikedTitles?: string[];
  initialVertical?: Category;
  autoRunVertical?: boolean;
}

const ResultsV4: React.FC<ResultsProps> = ({
  loading,
  loadingLabel,
  reks: incomingReks,
  category,
  onPlayVibe,
  persistedLikedTitles = [],
  persistedDislikedTitles = [],
}) => {
  const [reks, setReks] = useState<Rek[]>([]);
  // Mark state (graduation model, same as the snap lane): thumbs-up marks
  // a contender, Save marks a keeper — both toggle off on second tap.
  // Kept as full Reks so their titles keep flowing into likedTitles even
  // after their cards leave the view — the engine steers by marked titles
  // but excludes them from candidates (prompt avoid list + uncapped
  // response drop-set in generateAIReks).
  const [contenders, setContenders] = useState<Rek[]>([]);
  const [saved, setSaved] = useState<Rek[]>([]);
  // The decided trail: marked cards graduate up here in compact form and
  // stop occupying frontier slots. Membership = marked (like OR save);
  // in marking order.
  const [trail, setTrail] = useState<Rek[]>([]);
  const [sessionDislikedTitles, setSessionDislikedTitles] = useState<string[]>([]);
  const [expandedTop, setExpandedTop] = useState<number | null>(null);
  const [exiting, setExiting] = useState<number | null>(null);
  // Card mid-migration animation — marked, fading up out of the frontier.
  const [migrating, setMigrating] = useState<number | null>(null);
  // Card just reinserted from the trail (toggle-off) — drops in from above.
  const [entering, setEntering] = useState<number | null>(null);
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

  // State mirrors for deferred work — migration commits fire after the
  // exit animation and backfill/MLT responses after a fetch, so both must
  // read at FIRE time, not call time.
  const contendersRef = useRef<Rek[]>([]);
  const savedRef = useRef<Rek[]>([]);
  const trailRef = useRef<Rek[]>([]);
  const pendingBackfillsRef = useRef(0);
  const mltLoadingRef = useRef(false);
  useEffect(() => { contendersRef.current = contenders; }, [contenders]);
  useEffect(() => { savedRef.current = saved; }, [saved]);
  useEffect(() => { trailRef.current = trail; }, [trail]);
  useEffect(() => { pendingBackfillsRef.current = pendingBackfills; }, [pendingBackfills]);
  useEffect(() => { mltLoadingRef.current = mltLoading; }, [mltLoading]);

  // Rendered frontier card elements by id — the scroll-compensation
  // reference lookup at migration-commit time (see compensatedCommit).
  const cardEls = useRef(new Map<number, HTMLDivElement>());

  // Frontier generation counter — bumped whenever the list is wholesale
  // replaced (new-search sync, MLT wipe). A backfill response from a dead
  // generation must not insert, animate, or show notices: aborted
  // requests can't race, but the 30s window lets successful ones land
  // across a wipe (the snap lane's listEpochRef, R2/R5 — same race class).
  const frontierEpochRef = useRef(0);

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
    // A new search replaces the whole result view — the old trail leaves
    // with it, same as marked cards always vanished on a new search. The
    // marks persist in contenders/saved, so their titles keep feeding
    // likedTitles — steer in the prompt, excluded from candidates by the
    // engine's avoid list and response drop-set.
    frontierEpochRef.current++; // in-flight backfills belong to the old view
    setTrail([]);
    setMigrating(null);
    setEntering(null);

    if (!incomingReks || incomingReks.length === 0) {
      setReks([]);
      setVisibleIds([]);
      return;
    }

    setReks(incomingReks);
    animateIn(incomingReks.map((r) => r.id));
  }, [incomingReks]);

  /* -----------------------------
   * BACKFILL — CATEGORY EXPLICIT
   * ----------------------------- */
  const handleBackfill = async (removed: Rek) => {
    // Show a single inline pulse in the replacing slot — never wipe the
    // whole set for a one-card swap.
    const epochAtStart = frontierEpochRef.current;
    setPendingBackfills((p) => p + 1);
    try {
      const currentNow = reksRef.current;

      // Session trail as direction (marking order, oldest→newest). A
      // like/save-triggered backfill fires inside the same commit that
      // trails the card, so trailRef lags one render — append the removed
      // card when it's marked (it IS the newest keep, the strongest
      // signal). A dislike-removed card is not kept and never appended:
      // that backfill steers by the remaining keeps, or none.
      const removedKept =
        contendersRef.current.some((c) => c.id === removed.id) ||
        savedRef.current.some((s) => s.id === removed.id);
      const trailTitles = [
        ...trailRef.current.map((r) => r.title),
        ...(removedKept && !trailRef.current.some((r) => r.id === removed.id)
          ? [removed.title]
          : []),
      ];

      const { rek: next, exhausted } = await getBackfillRek({
        current: currentNow,
        category,
        likedTitles: allLikedTitlesRef.current,
        dislikedTitles: allDislikedTitlesRef.current,
        trailTitles,
      });

      // Epoch guard BEFORE any response handling: a backfill that crossed
      // an MLT wipe or a new search belongs to a list that no longer
      // exists — no insert (the sixth card), no animateIn (the visibleIds
      // reset that stranded fresh cards mid-transition), and no stale
      // "running dry" notice from a dead generation's null.
      if (epochAtStart !== frontierEpochRef.current) return;

      if (!next) {
        if (exhausted) {
          // Voice rule (handler owns the voice): pool exhaustion is the
          // app's machinery — plain voice. The AI running-dry notice
          // below speaks as Reks Ray, because there the AI itself is the
          // handler that came up empty. The two strings differing is
          // deliberate, not drift.
          setExhaustedMessage(
            `You’ve seen all our quick picks — type a ${nounForCategory(
              category
            )} you liked for fresh AI recommendations.`
          );
        } else {
          // AI backfill failure (RC-4), two concerns split: the tripwire
          // log fires on EVERY null (silent failures get named), but the
          // user notice renders ONLY when this null lands on an EMPTY
          // frontier — a missing slot among visible cards is a log line,
          // not a banner. A sibling in-flight backfill that later succeeds
          // clears the notice (clearExhausted on the success path).
          console.warn(
            "[short-sets] AI backfill returned null — slot left empty",
            {
              category,
              frontier: reksRef.current.length,
              pendingBackfills: pendingBackfillsRef.current,
            }
          );
          if (reksRef.current.length === 0) {
            setExhaustedMessage(
              `Reks Ray is running dry on this line — type a ${nounForCategory(
                category
              )} you liked to point it somewhere fresh.`
            );
          }
        }
        return;
      }

      clearExhausted();

      setReks((prev) => {
        // Marked cards live in the trail now, so the frontier list itself
        // is the unmarked count. A carried sixth (toggle-off return)
        // parks the list at capacity and this guard declines.
        if (prev.length >= 5) return prev;

        const updated = [...prev, next];

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

    // Chain-parity: the tapped card is a PURSUED KEEP — it marks as a
    // like locally and graduates to the trail with the wipe's flush
    // below, not dying as collateral. Deliberately NOT handleLike: that
    // would write a second row, and the more_like_this row above already
    // subsumes the like (the snap lane's chain-subsumes-like pattern;
    // /api/prefs counts more_like_this as liked).
    setContenders((p) =>
      p.some((c) => c.id === rek.id) || saved.some((s) => s.id === rek.id)
        ? p
        : [...p, rek]
    );

    // Keepers live in the trail now, so the wipe is total. A marked card
    // still mid-migration flushes straight to the trail (no animation)
    // instead of dying with the frontier; the skeletons pulse beneath the
    // trail, and the fresh five land there. The pursued keep flushes
    // LAST — it is the newest keep, the tail the trail-steer weighs
    // heaviest.
    const stillMarked = [
      ...reks.filter(
        (r) =>
          r.id !== rek.id &&
          (contenders.some((c) => c.id === r.id) ||
            saved.some((s) => s.id === r.id))
      ),
      ...(reks.some((r) => r.id === rek.id) ? [rek] : []),
    ];
    setExiting(null);
    setMigrating(null);
    setMltLoading(true);
    frontierEpochRef.current++; // the wipe kills the old generation —
    // any in-flight backfill response landing after this must decline
    const epochAtStart = frontierEpochRef.current;
    setTrail((prev) => [
      ...prev,
      ...stillMarked.filter((m) => !prev.some((t) => t.id === m.id)),
    ]);
    setReks([]);
    setVisibleIds([]);
    clearExhausted();

    try {
      const nextFive = await getMoreLikeThisSet({
        seed: rek,
        category,
        // The seed's title rides likedTitles explicitly: the ref lags one
        // commit behind the setContenders above, so for THIS call its
        // presence would be timing-dependent (future calls get it from
        // the ref for free). The seen tier already blocks the seed; this
        // makes the marked tier deterministic too.
        likedTitles: [...allLikedTitlesRef.current, rek.title],
        dislikedTitles: allDislikedTitlesRef.current,
      });

      // Epoch guard BEFORE any response handling — the race this
      // sequence hid: MLT was the one wipe-adjacent landing site without
      // one. A new search bumps the epoch and replaces the view while
      // this generation is in flight; a stale response must not append
      // dead cards onto the new frontier or raise a stale failure
      // notice. Same guard class as backfill's (R2/R5).
      if (epochAtStart !== frontierEpochRef.current) return;

      if (!nextFive || nextFive.length === 0) {
        // MLT is always AI now, so an empty set is an AI failure — never
        // pool exhaustion. Say that, honestly. Marked keepers stay put.
        setExhaustedMessage(
          "Reks Ray couldn’t fetch fresh picks — give it another go."
        );
        return;
      }

      // Guard against the generator repeating a surviving keeper — keepers
      // sit in the trail now, so check both lists.
      const have = new Set(
        [...reksRef.current, ...trailRef.current].map((r) =>
          r.title.trim().toLowerCase()
        )
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
   * GRADUATION UPWARD (TRAIL)
   * ----------------------------- */
  // A marked frontier card animates out of the five in place (transform/
  // opacity only — layout-inert), then ONE compensated commit moves it to
  // the trail and backfills the freed slot. Layout never changes outside
  // that commit, so the page can't lurch (see compensatedCommit). No-ops
  // for already-graduated trail cards — they aren't in the frontier list.
  const migrateToTrail = (rek: Rek) => {
    if (!reksRef.current.some((r) => r.id === rek.id)) return;
    setMigrating(rek.id);
    setTimeout(() => commitMigration(rek), 250);
  };

  const commitMigration = (rek: Rek) => {
    setMigrating((cur) => (cur === rek.id ? null : cur));
    const list = reksRef.current;
    const idx = list.findIndex((r) => r.id === rek.id);
    if (idx === -1) return; // dismissed or MLT-flushed mid-animation
    // Mark toggled off mid-animation: only still-marked cards graduate
    // (the cleared migrating state fades the card back in where it is).
    if (
      !contendersRef.current.some((c) => c.id === rek.id) &&
      !savedRef.current.some((s) => s.id === rek.id)
    ) {
      return;
    }

    // Scroll reference: the neighbor the user reads next (below, else
    // above), falling back to any rendered card.
    const refId = list[idx + 1]?.id ?? list[idx - 1]?.id ?? null;
    let refEl = refId != null ? cardEls.current.get(refId) ?? null : null;
    if (!refEl) {
      for (const [id, el] of Array.from(cardEls.current.entries())) {
        if (id !== rek.id) {
          refEl = el;
          break;
        }
      }
    }

    // Skipped mid-MLT: the fresh five are already on their way. In-flight
    // backfills count as supply.
    const needBackfill =
      !mltLoadingRef.current &&
      list.length - 1 + pendingBackfillsRef.current < 5;

    compensatedCommit(refEl, () => {
      setReks((prev) => prev.filter((r) => r.id !== rek.id));
      setTrail((prev) =>
        prev.some((r) => r.id === rek.id) ? prev : [...prev, rek]
      );
      if (needBackfill) void handleBackfill(rek);
    });
  };

  // Toggle-off return: the card leaves the trail and re-enters the
  // frontier AT THE TOP — just across the boundary from where it sat.
  // The frontier may briefly hold six; that's the existing carried-sixth
  // policy (no dismissal, no backfill — the next dismissal's response
  // guard declines instead). The visible frontier is held pixel-stable;
  // the returning card takes the space the trail row gives up.
  const returnToFrontier = (id: number) => {
    const rek = trailRef.current.find((r) => r.id === id);
    if (!rek) return;

    const firstId = reksRef.current[0]?.id ?? null;
    const refEl = firstId != null ? cardEls.current.get(firstId) ?? null : null;

    compensatedCommit(refEl, () => {
      setTrail((prev) => prev.filter((r) => r.id !== id));
      setReks((prev) =>
        prev.some((r) => r.id === id) ? prev : [rek, ...prev]
      );
      // The stagger machinery may have reset visibleIds since this card
      // graduated — re-admit it or it would stay invisible.
      setVisibleIds((p) => (p.includes(id) ? p : [...p, id]));
      setEntering(id);
    });
    // Release the entrance state a tick later so the drop-in plays.
    setTimeout(() => setEntering((cur) => (cur === id ? null : cur)), 30);
  };

  // Thumbs-down keeps its meaning on a trail card: record + dismiss —
  // the same grammar as thumbing down a liked frontier card. It vacates
  // no frontier slot, so there is nothing to backfill.
  const handleDislikeFromTrail = (rek: Rek) => {
    recordLike({ category, title: rek.title, year: rek.year, action: 'dislike' });
    setSessionDislikedTitles((p) => [...p, rek.title]);
    setContenders((p) => p.filter((c) => c.id !== rek.id));
    setSaved((p) => p.filter((s) => s.id !== rek.id));
    const firstId = reksRef.current[0]?.id ?? null;
    const refEl = firstId != null ? cardEls.current.get(firstId) ?? null : null;
    compensatedCommit(refEl, () => {
      setTrail((prev) => prev.filter((r) => r.id !== rek.id));
    });
  };

  /* -----------------------------
   * LIKE / DISLIKE / SAVE
   * ----------------------------- */
  // Thumbs-up marks the card as a contender (blue fill) and graduates it
  // up to the trail. Second tap un-marks; no LikeAction exists for
  // "unlike", so un-marking is visual-only and the original write stands.
  // When no Save is still holding it, un-marking returns the card from
  // the trail to the top of the frontier (trail membership = marked).
  const handleLike = (rek: Rek) => {
    if (contenders.some((c) => c.id === rek.id)) {
      setContenders((p) => p.filter((c) => c.id !== rek.id));
      if (!saved.some((s) => s.id === rek.id)) returnToFrontier(rek.id);
      return;
    }
    recordLike({ category, title: rek.title, year: rek.year, action: 'like' });
    setContenders((p) => [...p, rek]);
    migrateToTrail(rek);
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

  // Save marks and graduates, same as a thumb-up. Second tap un-marks —
  // visual-only (no signal write); the original save signal stands. When
  // no like is still holding it, un-saving returns the card from the
  // trail to the top of the frontier.
  const handleSave = (rek: Rek) => {
    if (saved.some((s) => s.id === rek.id)) {
      setSaved((p) => p.filter((s) => s.id !== rek.id));
      if (!contenders.some((c) => c.id === rek.id)) returnToFrontier(rek.id);
      return;
    }
    recordLike({ category, title: rek.title, year: rek.year, action: 'save' });
    setSaved((p) => [...p, rek]);
    migrateToTrail(rek);
  };

  /* -----------------------------
   * EXPANDERS
   * ----------------------------- */
  const toggleTopExpand = (id: number) =>
    setExpandedTop((prev) => (prev === id ? null : id));

  // Media completion verbs (Trailer + Where-to-watch) belong to the
  // EXPANDED card — the read moment — and only for screen media. Same
  // gate as the snap anchor's verbs (categoryGates.ts), evaluated once:
  // the whole result set shares one category.
  const isMedia = MEDIA_CATEGORIES.has(category.toLowerCase());

  return (
    <div className="w-full flex flex-col items-center px-4 pt-2 pb-14 select-none">
      {/* Safety Valve Notice */}
      {exhaustedMessage && (
        <div className="w-full max-w-xl mb-3">
          <div className="bg-white border border-amber-300 rounded-2xl p-4 shadow-sm">
            <div className="text-sm text-gray-800">{exhaustedMessage}</div>

            <div className="mt-3 flex gap-2">
              {/* Truthful label: the handler is handlePlayStable, which
                  cycles the GENRE LANE via a Play/pool search — it never
                  touched the vibe list. One card serves both exhaustion
                  voices (pool + AI running-dry), so one label = one voice. */}
              <button
                onClick={() => onPlayVibe?.()}
                className="px-3 py-2 rounded-xl text-sm bg-gray-900 text-white hover:opacity-90"
              >
                <Play size={16} className="inline-block mr-1" />
                Try another lane
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
          <RekSkeleton
            label={loadingLabel || "Reks Ray™ is finding your reks…"}
            count={5}
          />
        </div>
      ) : (
        <div className="w-full max-w-xl space-y-3">
          {/* THE TRAIL — the user's decided keeps, compact, at the top of
              the results. Tapping a row expands it in place to a full
              RekCard. Trail cards never get `swipeable` (keep-protection
              is structural) and never get "+ More like this" (no chaining
              from the trail); the media verbs (on expanded details) stay. */}
          {trail.length > 0 && (
            <RekTrail>
              {trail.map((rek) => (
                <TrailRow
                  key={rek.id}
                  title={rek.title}
                  hint={rek.short}
                  thumbed={contenders.some((c) => c.id === rek.id)}
                  saved={saved.some((s) => s.id === rek.id)}
                  /* Media titles link out — same gate as the media verbs. */
                  titleHref={isMedia ? titleInfoUrl(rek.title) : undefined}
                >
                  <RekCard
                    genreLine={
                      <DescriptorLine
                        rek={rek}
                        category={toRekCategory(category)}
                      />
                    }
                    title={rek.title}
                    year={rek.year}
                    short={rek.short}
                    long={rek.long}
                    titleHref={isMedia ? titleInfoUrl(rek.title) : undefined}
                    detailsOpen={expandedTop === rek.id}
                    onToggleDetails={() => toggleTopExpand(rek.id)}
                    thumbSignal={
                      contenders.some((c) => c.id === rek.id) ? "like" : null
                    }
                    saved={saved.some((s) => s.id === rek.id)}
                    onThumbUp={() => handleLike(rek)}
                    onThumbDown={() => handleDislikeFromTrail(rek)}
                    onSave={() => handleSave(rek)}
                    /* Media verbs stay expansion-gated in this lane; RIGHT
                       stays empty — no chaining from the trail. */
                    verbLeft={
                      isMedia && expandedTop === rek.id ? (
                        <TrailerVerb name={rek.title} href={rek.trailerUrl} />
                      ) : undefined
                    }
                    verbMiddle={
                      isMedia && expandedTop === rek.id ? (
                        <WhereToWatchVerb name={rek.title} />
                      ) : undefined
                    }
                  />
                </TrailRow>
              ))}
            </RekTrail>
          )}

          {/* The frontier — five full, unmarked candidates still being
              judged. The plain wrapper div carries the DOM handle the
              scroll-compensated migration commit measures against; all
              card animation stays transform/opacity on the RekCard so
              the wrapper's layout only ever changes inside that commit. */}
          {reks.map((rek, index) => {
          const isVisible = visibleIds.includes(rek.id);
          const isExiting = exiting === rek.id;

          return (
            <div
              key={rek.id}
              ref={(el) => {
                if (el) cardEls.current.set(rek.id, el);
                else cardEls.current.delete(rek.id);
              }}
            >
              <RekCard
                genreLine={
                  <DescriptorLine rek={rek} category={toRekCategory(category)} />
                }
                title={rek.title}
                year={rek.year}
                short={rek.short}
                long={rek.long}
                titleHref={isMedia ? titleInfoUrl(rek.title) : undefined}
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
                /* Media verbs stay expansion-gated in this lane (logic
                   unchanged, position only); MLT is the RIGHT chain verb —
                   search lane only, where its plumbing lives. */
                verbLeft={
                  isMedia && expandedTop === rek.id ? (
                    <TrailerVerb name={rek.title} href={rek.trailerUrl} />
                  ) : undefined
                }
                verbMiddle={
                  isMedia && expandedTop === rek.id ? (
                    <WhereToWatchVerb name={rek.title} />
                  ) : undefined
                }
                verbRight={
                  <button
                    onClick={() => handleMoreLikeThis(rek)}
                    className="hover:underline"
                  >
                    + More like this
                  </button>
                }
                className={[
                  migrating === rek.id
                    ? "opacity-0 -translate-y-2 scale-[0.97]" // graduating up to the trail
                    : entering === rek.id
                    ? "opacity-0 -translate-y-2" // dropping back in from the trail
                    : isExiting
                    ? "opacity-0 translate-x-3 scale-[0.97]" // dismissed sideways
                    : isVisible
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-2",
                  "transition-all duration-300 ease-out",
                ].join(" ")}
                style={{ transitionDelay: `${index * 60}ms` }}
              />
            </div>
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
