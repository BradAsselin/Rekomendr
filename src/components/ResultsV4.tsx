"use client";

import React, { useEffect, useState, useRef } from "react";
import { Play } from "lucide-react";

import DescriptorLine from "./DescriptorLine";
import { TrailerVerb, WhereToWatchVerb, titleInfoUrl } from "./MediaVerbs";
import RekCard from "./RekCard";
import ShareRow from "./ShareRow";
import GoToStar from "./GoToStar";
import { addToVoiceSet, noteVoiceAction } from "../lib/voiceSignals";
import { noteRecent } from "../lib/recent";
import { isGoTo, logGoToEvent } from "../lib/goTos";
import { goToCategoryFor } from "../lib/goToCategory";
import { noteSetShown } from "../lib/screenVisit";
import { goToShortName } from "../lib/slotsClient";
import { postJson, tmdbCardSnapshot } from "../lib/shareSnapshot";
import RekSkeleton, { RekSkeletonCard } from "./RekSkeleton";
import RekTrail, { TrailRow } from "./RekTrail";
import ShortlistStrip, { type ShortlistItem } from "./ShortlistStrip";
import { WatchedButton, WatchedToast, UndoToast, type UndoToastLabel } from "./WatchedControl";
import { useWatchedMarks, watchedCategory, type WatchedItem, TOAST_MS } from "../lib/useWatchedMarks";
import PosterThumb from "./PosterThumb";
import { setPostersHidden, usePostersOn } from "../lib/posterPref";

// Scroll-compensated layout commits for trail migrations (see the module
// comment — layout changes once, animation is transform/opacity only).
import { compensatedCommit } from "../lib/scrollCompensation";

// Engine helpers
import { getBackfillRek, getMoreLikeThisSet } from "../engine/rekomendrEngine";
import { isAIServiceError } from "../lib/aiServiceError";
import type { Rek } from "../engine/rekomendrEngine";
import { getAnonymousClientId, recordLike, undoSignal } from "../lib/userPrefs";
import { resurfacedMarker } from "../engine/rekomendrEngine";

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
  // S1 — the Shortlist strip. Owned by the page (so it survives search to
  // search within the visit) and rendered here, above the results.
  shortlist?: ShortlistItem[];
  // Fires for every "Watched it" tap on the strip. The page owns the
  // write and the optimistic list update.
  onWatched?: (item: { title: string; year: number | null }) => void;
  // S16 — a card's "Watched" mark or undo (this component owns the write;
  // the page keeps its session list, which every re-run excludes).
  onWatchedChange?: (item: WatchedItem, watched: boolean) => void;
  watchPendingTitle?: string | null;
  watchFailedTitle?: string | null;
  initialVertical?: Category;
  autoRunVertical?: boolean;
  // S12b — the Steer by row (built by the page), rendered above the
  // results and outside the loading branch so it stays put while a steer
  // re-runs. And, for a slot-recipe set, the one-card replacement comes
  // from the same recipe (the no-repeat guarantee covers it).
  steerRow?: React.ReactNode;
  backfillOverride?: (removed: Rek, current: Rek[]) => Promise<Rek | null>;
  // S16 — early paint: the five are on screen and their "vs." lines are
  // still being written (they land on the same cards, merged in place).
  linesPending?: boolean;
  // S17 — the results header: the active chips ("Comedy · Feel-good") or
  // the typed/spoken words. Data, never copy.
  header?: string | null;
  // S24a — the header row's right side (the page's "Compare to" control).
  headerRight?: React.ReactNode;
}

const ResultsV4: React.FC<ResultsProps> = ({
  loading,
  loadingLabel,
  reks: incomingReks,
  category,
  onPlayVibe,
  persistedLikedTitles = [],
  persistedDislikedTitles = [],
  shortlist = [],
  onWatched,
  onWatchedChange,
  watchPendingTitle,
  watchFailedTitle,
  steerRow,
  backfillOverride,
  linesPending,
  header,
  headerRight,
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

  /* -----------------------------
   * S17 — THE D2 CARD (Movies/TV; docs/s17-mood-first-plan.md)
   * ----------------------------- */
  const d2 = category === "Movies" || category === "TV Shows";
  const postersOn = usePostersOn();

  // One toast for the lane: the newest act replaces the last; ~4 s; a new
  // set drops it (the act stands). Undo runs the act's own reversal.
  const [toast, setToast] = useState<{ label: UndoToastLabel; undo: () => void } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (label: UndoToastLabel, undo: () => void) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ label, undo });
    toastTimer.current = setTimeout(() => {
      toastTimer.current = null;
      setToast(null);
    }, TOAST_MS);
  };
  const dropToast = () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = null;
    setToast(null);
  };
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  // The like-table writes in flight, by "action|title": an Undo waits for
  // its write before deleting, so it can never run ahead of the insert.
  const writesRef = useRef(new Map<string, Promise<void>>());
  const writeLike = (rek: Rek, action: "dislike" | "save") => {
    const p = recordLike({ category, title: rek.title, year: rek.year, action }).catch(() => {});
    writesRef.current.set(`${action}|${rek.title}`, p);
  };
  const unwriteLike = (rek: Rek, action: "dislike" | "save") => {
    const pending = writesRef.current.get(`${action}|${rek.title}`) ?? Promise.resolve();
    writesRef.current.delete(`${action}|${rek.title}`);
    void pending.then(async () => {
      const res = await undoSignal({ category, title: rek.title, action });
      if (!res.ok) console.warn("[signal-undo] not persisted", { action, reason: res.reason });
    });
  };

  // Commitment + where ("1h 43m · on Netflix") for cards that arrived
  // without it — the AI search's five, matched to TMDb by the title check.
  // Slot and screen cards already carry it. One batched read per set;
  // lands by id, and a late answer for a replaced set is dropped (epoch).
  const factsAskedRef = useRef(new Set<number>());
  useEffect(() => {
    if (!d2) return;
    const kind = category === "TV Shows" ? "tv" : "movie";
    const need = [...reks, ...trail].filter(
      (r) => r.tmdbId != null && r.facts === undefined && !factsAskedRef.current.has(r.id)
    );
    if (need.length === 0) return;
    need.forEach((r) => factsAskedRef.current.add(r.id));
    const epoch = frontierEpochRef.current;
    void fetch("/api/facts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: need.map((r) => ({ kind, id: r.tmdbId })) }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (epoch !== frontierEpochRef.current) return;
        const by = new Map<number, { facts: string[]; posterPath: string | null }>();
        for (const f of Array.isArray(data?.facts) ? data.facts : []) {
          if (Number.isInteger(f?.id)) by.set(f.id, { facts: Array.isArray(f.facts) ? f.facts : [], posterPath: f.posterPath ?? null });
        }
        const fill = (list: Rek[]) => {
          let changed = false;
          const next = list.map((r) => {
            const f = r.tmdbId != null && r.facts === undefined ? by.get(r.tmdbId) : undefined;
            if (!f) return r;
            changed = true;
            return { ...r, facts: f.facts, posterPath: r.posterPath ?? f.posterPath };
          });
          return changed ? next : list;
        };
        setReks(fill);
        setTrail(fill);
      })
      .catch(() => console.warn("[facts] request failed — cards keep no line"));
  }, [d2, category, reks, trail]);

  // Put a dismissed card back where it was (Undo). The frontier may hold
  // six for a moment if its backfill already landed — the existing
  // carried-sixth policy; nothing is dismissed to make room.
  const restoreToFrontier = (rek: Rek, index: number) => {
    setReks((prev) => {
      if (prev.some((r) => r.id === rek.id)) return prev;
      const next = [...prev];
      next.splice(Math.min(index, next.length), 0, rek);
      return next;
    });
    setVisibleIds((p) => (p.includes(rek.id) ? p : [...p, rek.id]));
    setExiting((cur) => (cur === rek.id ? null : cur));
  };

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
  // The ids of the last set the page sent. The same ids again = the same
  // set with its lines filled in (S16): merge, don't reset.
  const lastIncomingIdsRef = useRef<string>("");
  useEffect(() => {
    const ids = (incomingReks ?? []).map((r) => `${r.id}:${r.title}`).join("|");
    if (ids && ids === lastIncomingIdsRef.current) {
      const by = new Map(incomingReks.map((r) => [r.id, r]));
      const merge = (list: Rek[]) => {
        let changed = false;
        const next = list.map((r) => {
          const n = by.get(r.id);
          if (!n || (n.short === r.short && n.vsGoTo === r.vsGoTo)) return r;
          changed = true;
          return { ...r, short: n.short, vsGoTo: n.vsGoTo };
        });
        return changed ? next : list;
      };
      setReks(merge);
      setTrail(merge);
      return;
    }
    lastIncomingIdsRef.current = ids;
    dropToast(); // S17 — a new set drops the toast; the act stands
    factsAskedRef.current.clear();
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

      const { rek: next, exhausted } =
        backfillOverride && removed.slot
          ? { rek: await backfillOverride(removed, currentNow), exhausted: false }
          : await getBackfillRek({
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
      if (next) addToVoiceSet(next.title);

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
      noteSetShown(category, [next.title]);

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
      // A named service failure (out of credit, key refused, …) is an
      // outage, not a single-slot miss: it gets the banner whatever the
      // frontier holds — behind the same epoch guard as every notice here.
      if (epochAtStart !== frontierEpochRef.current) return;
      if (isAIServiceError(err)) setExhaustedMessage(err.message);
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
      noteSetShown(category, fresh.map((r) => r.title));
      setReks((prev) => [...prev, ...fresh]);
      fresh.forEach((r, index) => {
        setTimeout(() => setVisibleIds((p) => [...p, r.id]), index * 80);
      });
    } catch (err) {
      console.error("More Like This via engine failed:", err);
      // Named service failure → honest plain-voice copy, same epoch guard
      // as the empty-set notice above.
      if (epochAtStart !== frontierEpochRef.current) return;
      if (isAIServiceError(err)) setExhaustedMessage(err.message);
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
    const index = reksRef.current.findIndex((r) => r.id === rek.id);
    writeLike(rek, "dislike");
    setSessionDislikedTitles((p) => [...p, rek.title]);
    // A thumbed-up card can still be thumbed down; drop the contender mark so
    // its title doesn't sit in both the liked and disliked exclusion lists.
    setContenders((p) => p.filter((c) => c.id !== rek.id));
    setTimeout(() => {
      setReks((p) => p.filter((r) => r.id !== rek.id));
      handleBackfill(rek);
      setExiting(null);
    }, 250);
    // S17 — "Not for me · Undo": the card comes back where it was, and the
    // dislike leaves the table and the session's exclusions.
    if (d2) {
      showToast("Not for me", () => {
        dropToast();
        setSessionDislikedTitles((p) => {
          const i = p.lastIndexOf(rek.title);
          return i < 0 ? p : [...p.slice(0, i), ...p.slice(i + 1)];
        });
        unwriteLike(rek, "dislike");
        setTimeout(() => restoreToFrontier(rek, Math.max(0, index)), 260);
      });
    }
  };

  // Save marks and graduates, same as a thumb-up. Second tap un-marks —
  // visual-only (no signal write); the original save signal stands. When
  // no like is still holding it, un-saving returns the card from the
  // trail to the top of the frontier.
  const handleSave = (rek: Rek) => {
    noteAct("save", rek);
    if (savedRef.current.some((s) => s.id === rek.id)) {
      setSaved((p) => p.filter((s) => s.id !== rek.id));
      if (!contendersRef.current.some((c) => c.id === rek.id)) returnToFrontier(rek.id);
      // S17 — on a D2 card un-saving is real: the row leaves the table, so
      // the Saved page never lists what the person took back.
      if (d2) unwriteLike(rek, "save");
      return;
    }
    if (d2) writeLike(rek, "save");
    else recordLike({ category, title: rek.title, year: rek.year, action: 'save' });
    setSaved((p) => [...p, rek]);
    migrateToTrail(rek);
    if (d2) {
      showToast("Saved", () => {
        dropToast();
        if (savedRef.current.some((s) => s.id === rek.id)) handleSave(rek);
      });
    }
  };

  // S24a — every open, share, save and mark also lands in Recent (this
  // device only, never sent): with the card's poster and TMDb id, so the
  // Compare to sheet can show it.
  const noteAct = (kind: "tap" | "share" | "star" | "save" | "play", rek: Rek) => {
    noteVoiceAction(kind, rek.title);
    noteRecent({ category, title: rek.title, year: rek.year, tmdbId: rek.tmdbId ?? null, posterPath: rek.posterPath ?? null, facts: rek.facts });
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
  // S7 — Share on search-lane cards (Brad's call B): movies and TV only,
  // and the card carries TMDb's official synopsis (the server looks the
  // title up and signs what TMDb returns). Books and wine: no Share yet.
  const shareLane: "Movies" | "TV Shows" | null =
    category === "Movies" || category === "TV Shows" ? category : null;
  const shareFor = (rek: Rek) =>
    shareLane ? (
      <ShareRow
        key={`${shareLane}|${rek.id}`}
        title={rek.title}
        getSnapshot={() =>
          tmdbCardSnapshot(
            { title: rek.title, year: rek.year, category: shareLane },
            getAnonymousClientId(),
            postJson
          )
        }
        onTap={() => noteAct("share", rek)}
      />
    ) : undefined;

  // S12 — the go-to star (Movies, TV, Books; none for Wine here — wine's
  // star lives on the snap lane, S8b). A touchstone's star lives in its
  // label instead (one star per card).
  const goToItem = (rek: Rek) => ({
    category,
    name: rek.title,
    year: rek.year || null,
    tmdbKind: rek.tmdbId ? (category === "TV Shows" ? ("tv" as const) : ("movie" as const)) : null,
    tmdbId: rek.tmdbId ?? null,
  });
  const starFor = (rek: Rek) =>
    rek.slot === "touchstone" ? undefined : (
      <GoToStar item={goToItem(rek)} onStar={() => noteAct("star", rek)} />
    );

  // S12b — "A classic to steer by ☆" on a touchstone card; one tap stars it.
  const touchstoneLabel = (rek: Rek) =>
    rek.slot === "touchstone" ? (
      <span className="inline-flex items-center gap-1">
        A classic to steer by
        <GoToStar
          item={goToItem(rek)}
          size={15}
          onStar={() => {
            logGoToEvent("touchstone_star", goToCategoryFor(category));
            noteAct("star", rek);
          }}
        />
      </span>
    ) : undefined;
  const touchstonesLogged = useRef(new Set<string>());
  useEffect(() => {
    // S17 — the D2 card has no touchstone label, so nothing to count there.
    if (d2) return;
    for (const r of reks) {
      if (r.slot !== "touchstone" || touchstonesLogged.current.has(r.title)) continue;
      touchstonesLogged.current.add(r.title);
      logGoToEvent("touchstone_shown", goToCategoryFor(category));
    }
  }, [reks, category, d2]);

  // S12b — "vs. your Lioness: …" leads a card steered by a go-to.
  // S20 — "your" only for a starred favorite; a title someone named reads
  // "vs. The Office: …" (Brad's approved wording, 2026-10-24).
  const vsLead = (rek: Rek) =>
    rek.vsGoTo
      ? isGoTo(category, rek.vsGoTo)
        ? `vs. your ${goToShortName(rek.vsGoTo)}:`
        : `vs. ${rek.vsGoTo}:`
      : undefined;

  // S16 — "Watched" on every Movies/TV/Books card (bottom-left, always
  // visible; replaces S1's expanded-only "Watched it"). Wine has its own
  // actions and gets none; the gate is the go-to allow-list.
  // S17 — on a D2 card the lane's one toast speaks for Watched too.
  const watched = useWatchedMarks(onWatchedChange, { silent: d2 });
  const watchCat = watchedCategory(category);
  // S17 — on a D2 frontier card, Watched fades the card out of the five
  // (it's decided) and the slot backfills; Undo brings it back where it
  // was. A trail card (already kept) just dims, as in S16.
  const toggleWatched = (rek: Rek, inFrontier: boolean) => {
    if (!watchCat) return;
    const item = { title: rek.title, year: rek.year || null, category: watchCat };
    if (!d2 || watched.isWatched(rek.title)) {
      watched.toggle(item);
      if (d2) dropToast();
      return;
    }
    watched.toggle(item);
    noteRecent({ category, title: rek.title, year: rek.year, tmdbId: rek.tmdbId ?? null, posterPath: rek.posterPath ?? null, facts: rek.facts });
    const index = reksRef.current.findIndex((r) => r.id === rek.id);
    const leaves = inFrontier && index >= 0;
    if (leaves) {
      setExiting(rek.id);
      setTimeout(() => {
        setReks((p) => p.filter((r) => r.id !== rek.id));
        handleBackfill(rek);
        setExiting(null);
      }, 250);
    }
    showToast("Watched", () => {
      dropToast();
      watched.undo(item);
      if (leaves) setTimeout(() => restoreToFrontier(rek, index), 260);
    });
  };
  const watchedFor = (rek: Rek, inFrontier = false): React.ReactNode =>
    watchCat ? (
      <WatchedButton on={watched.isWatched(rek.title)} onToggle={() => toggleWatched(rek, inFrontier)} />
    ) : undefined;

  // S17 — the poster column (or nothing: posters hidden → D1, full-width
  // text, and no image is ever requested).
  const hidePosters = () => {
    setPostersHidden(true);
    showToast("Posters hidden", () => {
      dropToast();
      setPostersHidden(false);
    });
  };
  const posterFor = (rek: Rek): React.ReactNode =>
    postersOn ? <PosterThumb key={rek.posterPath ?? "none"} path={rek.posterPath} onHide={hidePosters} /> : undefined;
  const factsOf = (rek: Rek) => (rek.facts && rek.facts.length > 0 ? rek.facts.join(" · ") : undefined);

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
                className="px-3 py-2 rounded-xl text-sm border border-gray-300 bg-transparent text-gray-800 hover:border-gray-400"
              >
                <Play size={16} className="inline-block mr-1" />
                Try another lane
              </button>

              <button
                onClick={() => setExhaustedMessage(null)}
                className="px-3 py-2 rounded-xl text-sm border border-gray-300 bg-transparent text-gray-800 hover:border-gray-400"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* THE SHORTLIST STRIP — cross-session recall, above both bands and
          OUTSIDE the loading branch: the charter asks for it to be
          persistent across searches within the visit, so it must not
          blink out every time the frontier regenerates. The decided trail
          and the undecided frontier keep their relationship to each other
          untouched (charter §2.5); this is memory sitting above both of
          them, not a third decision surface. Hidden entirely when there
          is nothing to remember. */}
      {shortlist.length > 0 && (
        <div className="w-full max-w-xl mb-3">
          <ShortlistStrip
            items={shortlist}
            titleHref={(t) => (isMedia ? titleInfoUrl(t) : undefined)}
            onWatched={
              isMedia && onWatched
                ? (item) => onWatched({ title: item.title, year: item.year })
                : undefined
            }
            pendingTitle={watchPendingTitle}
            failedTitle={watchFailedTitle}
            markerFor={(item) => resurfacedMarker(item.likedAt)}
          />
        </div>
      )}

      {steerRow}

      {/* S17 — what this set answers: the chips, or the words. */}
      {header && (
        <div className="w-full max-w-xl mb-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <div
            data-testid="results-header"
            className="min-w-[7rem] flex-1 truncate text-[13px] font-medium text-gray-300 sm:text-gray-600"
          >
            {header}
          </div>
          {headerRight}
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
        <div className="w-full max-w-xl space-y-3" data-lines-pending={linesPending || undefined}>
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
                      d2 ? undefined : (
                        <DescriptorLine
                          rek={rek}
                          category={toRekCategory(category)}
                        />
                      )
                    }
                    title={rek.title}
                    year={rek.year}
                    markerLine={d2 ? undefined : rek.resurfacedNote ?? rek.screenNote}
                    layout={d2 ? "d2" : "classic"}
                    poster={d2 ? posterFor(rek) : undefined}
                    factsLine={d2 ? factsOf(rek) : undefined}
                    short={rek.short}
                    long={rek.long}
                    watchedSlot={watchedFor(rek)}
                    dimmed={watched.isWatched(rek.title)}
                    titleHref={isMedia ? titleInfoUrl(rek.title) : undefined}
                    detailsOpen={expandedTop === rek.id}
                    onToggleDetails={() => {
                      if (expandedTop !== rek.id) noteAct("tap", rek);
                      toggleTopExpand(rek.id);
                    }}
                    thumbSignal={
                      contenders.some((c) => c.id === rek.id) ? "like" : null
                    }
                    saved={saved.some((s) => s.id === rek.id)}
                    onThumbUp={() => handleLike(rek)}
                    onThumbDown={() => handleDislikeFromTrail(rek)}
                    onSave={() => handleSave(rek)}
                    shareSlot={shareFor(rek)}
                    starSlot={starFor(rek) ?? <GoToStar item={goToItem(rek)} />}
                    shortLead={vsLead(rek)}
                    /* Media verbs stay expansion-gated in this lane; RIGHT
                       stays empty — no chaining from the trail. */
                    verbLeft={
                      isMedia && expandedTop === rek.id ? (
                        <TrailerVerb name={rek.title} href={rek.trailerUrl} onOpen={() => noteAct("play", rek)} />
                      ) : undefined
                    }
                    verbMiddle={
                      isMedia && expandedTop === rek.id ? (
                        <WhereToWatchVerb name={rek.title} onOpen={() => noteAct("play", rek)} />
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
                  d2 ? undefined : <DescriptorLine rek={rek} category={toRekCategory(category)} />
                }
                title={rek.title}
                year={rek.year}
                /* S1 — set by the engine on the freshness slot only, and
                   only when that slot landed on a real past like. S17: not
                   on the D2 card (it lived beside the Shortlist strip, which
                   is gone); the slot itself still runs. A screen set's
                   "Start with this one" stays — it's that set's answer. */
                markerLine={d2 ? rek.screenNote : rek.resurfacedNote ?? rek.screenNote}
                short={rek.short}
                long={rek.long}
                watchedSlot={watchedFor(rek, true)}
                dimmed={!d2 && watched.isWatched(rek.title)}
                layout={d2 ? "d2" : "classic"}
                poster={d2 ? posterFor(rek) : undefined}
                factsLine={d2 ? factsOf(rek) : undefined}
                /* S17 — swipe left = Not for me, right = Save for later
                   (each with its Undo); the classic both-ways dismiss
                   stays on Books and Wine. */
                onSwipeLeft={d2 ? () => handleDislike(rek) : undefined}
                onSwipeRight={d2 ? () => handleSave(rek) : undefined}
                titleHref={isMedia ? titleInfoUrl(rek.title) : undefined}
                detailsOpen={expandedTop === rek.id}
                onToggleDetails={() => {
                      if (expandedTop !== rek.id) noteAct("tap", rek);
                      toggleTopExpand(rek.id);
                    }}
                // Swipe grammar (touch only): a committed swipe in either
                // direction dismisses + backfills (thumbs-down). Liked or
                // saved cards don't arm — same protection as the snap lane.
                swipeable={!d2}
                thumbSignal={
                  contenders.some((c) => c.id === rek.id) ? "like" : null
                }
                saved={saved.some((s) => s.id === rek.id)}
                onThumbUp={() => handleLike(rek)}
                onThumbDown={() => handleDislike(rek)}
                onSave={() => handleSave(rek)}
                shareSlot={shareFor(rek)}
                starSlot={d2 ? <GoToStar item={goToItem(rek)} onStar={() => noteAct("star", rek)} /> : starFor(rek)}
                markerSlot={d2 ? undefined : touchstoneLabel(rek)}
                shortLead={vsLead(rek)}
                /* Media verbs stay expansion-gated in this lane (logic
                   unchanged, position only); MLT is the RIGHT chain verb —
                   search lane only, where its plumbing lives. */
                verbLeft={
                  isMedia && expandedTop === rek.id ? (
                    <TrailerVerb name={rek.title} href={rek.trailerUrl} onOpen={() => noteAct("play", rek)} />
                  ) : undefined
                }
                verbMiddle={
                  isMedia && expandedTop === rek.id ? (
                    <WhereToWatchVerb name={rek.title} onOpen={() => noteAct("play", rek)} />
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
                  "transition-all duration-300 ease-out motion-reduce:transition-none",
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

      {d2 ? (
        <UndoToast label={toast?.label ?? null} onUndo={() => toast?.undo()} />
      ) : (
        <WatchedToast item={watched.toast} onUndo={watched.undo} />
      )}
    </div>
  );
};

export default ResultsV4;
