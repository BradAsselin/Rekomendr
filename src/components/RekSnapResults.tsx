"use client";

import React, { useEffect, useRef, useState } from "react";
import { Camera, ChevronRight } from "lucide-react";

import {
  HEALTH_MEDICAL_CATEGORIES,
  MEDIA_CATEGORIES,
  NON_RECIPE_CATEGORIES,
} from "../lib/categoryGates";
import { recordSnapSignal, type SnapMode } from "../lib/reksnapSignals";
import { compensatedCommit } from "../lib/scrollCompensation";
import { TrailerVerb, WhereToWatchVerb } from "./MediaVerbs";
import RekCard from "./RekCard";
import RekSkeleton, { RekSkeletonCard } from "./RekSkeleton";
import RekTrail, { TrailRow } from "./RekTrail";

export type SnapRek = {
  name: string;
  description: string;
  rank: number;
};

export type SnapResult = {
  detected_item: { name: string; description: string; category: string };
  mode: SnapMode;
  results: Record<SnapMode, SnapRek[]>;
};

// Graduation upward: a marked card (thumbed-up or saved) LEAVES the five
// and joins the compact trail under the anchor — the frontier list holds
// only unmarked candidates, so its length IS the capacity count. Each
// trail entry remembers its origin mode so toggle-off can reinsert there.
type TrailEntry = { rek: SnapRek; mode: SnapMode };

// Plain-language labels + order for the mode toggle row.
const MODE_TABS: { mode: SnapMode; label: string }[] = [
  { mode: "similar", label: "Similar" },
  { mode: "uses", label: "Use it for" },
  { mode: "alternatives", label: "Instead try" },
];

type Props = {
  loading: boolean;
  result: SnapResult | null;
  error?: string | null;
  limitReached?: boolean;
  onSnapAgain?: () => void;
  // Opens the recipe modal (state lives in the page). Only food "uses" cards
  // call this; passes the tapped dish + the detected item it came from.
  onOpenRecipe?: (recipe: { dish: string; detectedItem: string }) => void;
};

// Warm, non-punitive notice when the session snap limit is hit.
const LimitCard = () => (
  <div className="w-full max-w-xl">
    <div className="bg-white border border-blue-300 rounded-2xl p-4 shadow-sm text-center">
      <Camera size={20} className="inline-block text-[#2D5AB5] mb-1.5" />
      <p className="text-[15px] text-gray-800 leading-relaxed">
        You've used your 5 free Reks this session — sign in to keep snapping.
      </p>
    </div>
  </div>
);

const RekSnapResults: React.FC<Props> = ({
  loading,
  result,
  error,
  limitReached,
  onSnapAgain,
  onOpenRecipe,
}) => {
  // Thumb marks and saves are independent per item name (a card can be
  // thumbed-up AND saved). Thumbs are one-active-within-thumbs and toggle on
  // repeat tap — same grammar as the search lane.
  const [thumbSignals, setThumbSignals] = useState<
    Record<string, "like" | "dislike">
  >({});
  const [savedNames, setSavedNames] = useState<Record<string, boolean>>({});

  // The decided trail (cross-mode): marked cards graduate up here in
  // compact form and stop occupying frontier slots. The anchor never
  // joins it — anchor marks stay in place, as before.
  const [trail, setTrail] = useState<TrailEntry[]>([]);

  // Local copy of the three lists so thumbs-down can dismiss + backfill.
  // Reset from the prop whenever a new snap result arrives.
  const [lists, setLists] = useState<Record<SnapMode, SnapRek[]> | null>(
    result?.results ?? null
  );
  // Names dismissed this snap — excluded from every backfill generation.
  const [dismissedNames, setDismissedNames] = useState<string[]>([]);
  // Card mid-exit-animation (keyed by name; names are unique per list).
  const [exiting, setExiting] = useState<string | null>(null);
  // Card mid-migration animation — marked, fading up out of the frontier.
  const [migrating, setMigrating] = useState<string | null>(null);
  // Card just reinserted from the trail (toggle-off) — drops in from above.
  const [entering, setEntering] = useState<string | null>(null);
  // In-flight backfills per mode; each shows one skeleton card in that list.
  const [pending, setPending] = useState<Record<SnapMode, number>>({
    similar: 0,
    uses: 0,
    alternatives: 0,
  });

  // Anchor long tier — lazy-loaded on first "Show details" tap, then cached
  // for the life of the snap (re-toggles are local, no re-fetch).
  const [anchorLong, setAnchorLong] = useState<string | null>(null);
  const [anchorLoading, setAnchorLoading] = useState(false);
  const [anchorOpen, setAnchorOpen] = useState(false);
  // detail_expand is written once per snap, on the tap that triggers the
  // fetch — re-toggles are visual-only, same noise philosophy as thumbs.
  const [anchorExpandSignaled, setAnchorExpandSignaled] = useState(false);

  // Guards late backfill responses from a previous snap result.
  const resultRef = useRef(result);

  // State mirrors for deferred work — migration commits fire after the
  // exit animation and backfill responses after a fetch, so both must
  // read at FIRE time, not call time.
  const thumbSignalsRef = useRef(thumbSignals);
  const savedNamesRef = useRef(savedNames);
  const listsRef = useRef(lists);
  const pendingRef = useRef(pending);
  const dismissedNamesRef = useRef(dismissedNames);
  const trailRef = useRef(trail);
  useEffect(() => {
    thumbSignalsRef.current = thumbSignals;
  }, [thumbSignals]);
  useEffect(() => {
    savedNamesRef.current = savedNames;
  }, [savedNames]);
  useEffect(() => {
    listsRef.current = lists;
  }, [lists]);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  useEffect(() => {
    dismissedNamesRef.current = dismissedNames;
  }, [dismissedNames]);
  useEffect(() => {
    trailRef.current = trail;
  }, [trail]);

  // Rendered frontier card elements by name — the scroll-compensation
  // reference lookup at migration-commit time (see compensatedCommit).
  const cardEls = useRef(new Map<string, HTMLDivElement>());

  // Which intent list is on screen. Defaults to the model's inferred mode;
  // all three lists are already loaded, so switching is instant (no API call).
  const [activeMode, setActiveMode] = useState<SnapMode>(result?.mode ?? "similar");

  // A new snap result resets the view to its inferred mode and clears all
  // per-snap state (highlights, dismissals, local lists, pending backfills).
  useEffect(() => {
    resultRef.current = result;
    if (result) {
      setActiveMode(result.mode);
      setThumbSignals({});
      setSavedNames({});
      setTrail([]);
      setLists(result.results);
      setDismissedNames([]);
      setExiting(null);
      setMigrating(null);
      setEntering(null);
      setPending({ similar: 0, uses: 0, alternatives: 0 });
      setAnchorLong(null);
      setAnchorLoading(false);
      setAnchorOpen(false);
      setAnchorExpandSignaled(false);
    }
  }, [result]);

  const switchMode = (mode: SnapMode) => {
    if (!result || mode === activeMode) return;
    setActiveMode(mode);
    // Log the flip as its own signal, tagged with the mode switched TO.
    recordSnapSignal({
      itemName: result.detected_item.name,
      itemCategory: result.detected_item.category,
      action: "context_flip",
      flipToMode: mode,
    });
  };

  // Graduation upward: a marked frontier card animates out of the five in
  // place (transform/opacity only — layout-inert), then ONE compensated
  // commit moves it to the trail, renumbers the frontier, and backfills
  // the freed slot. Layout never changes outside that commit, so the
  // page can't lurch (see compensatedCommit). No-ops for the anchor and
  // for already-graduated trail cards — neither is in the frontier list.
  const migrateToTrail = (itemName: string) => {
    const current = listsRef.current;
    if (!current) return;
    const mode = activeMode;
    const rek = current[mode].find((r) => r.name === itemName);
    if (!rek) return;
    setMigrating(itemName);
    setTimeout(() => commitMigration(rek, mode), 250);
  };

  const commitMigration = (rek: SnapRek, mode: SnapMode) => {
    const forResult = resultRef.current;
    const current = listsRef.current;
    setMigrating((cur) => (cur === rek.name ? null : cur));
    if (!forResult || !current) return;
    const list = current[mode];
    const idx = list.findIndex((r) => r.name === rek.name);
    if (idx === -1) return; // dismissed mid-animation
    // Mark toggled off mid-animation: only still-marked cards graduate
    // (the cleared migrating state fades the card back in where it is).
    if (
      thumbSignalsRef.current[rek.name] !== "like" &&
      !savedNamesRef.current[rek.name]
    ) {
      return;
    }

    // Scroll reference: the neighbor the user reads next (below, else
    // above). When the origin list isn't on screen (mode flipped mid-
    // animation), any rendered card works — the whole visible frontier
    // sits below the trail and shifts identically.
    const refName = list[idx + 1]?.name ?? list[idx - 1]?.name ?? null;
    let refEl = refName ? cardEls.current.get(refName) ?? null : null;
    if (!refEl) {
      for (const [name, el] of Array.from(cardEls.current.entries())) {
        if (name !== rek.name) {
          refEl = el;
          break;
        }
      }
    }

    // Trail names must be excluded explicitly now — graduated cards are
    // no longer in the list that used to carry them into exclusions.
    const excludeNames = [
      forResult.detected_item.name,
      ...list.map((r) => r.name).filter((n) => n !== rek.name),
      ...trailRef.current.map((e) => e.rek.name),
      rek.name,
    ];
    const needBackfill = list.length - 1 + pendingRef.current[mode] < 5;

    compensatedCommit(refEl, () => {
      setLists((prev) => {
        if (!prev) return prev;
        const remaining = prev[mode]
          .filter((r) => r.name !== rek.name)
          .map((r, i) => ({ ...r, rank: i + 1 }));
        return { ...prev, [mode]: remaining };
      });
      setTrail((prev) =>
        prev.some((e) => e.rek.name === rek.name)
          ? prev
          : [...prev, { rek, mode }]
      );
      if (needBackfill) {
        void backfillSlot(mode, excludeNames, dismissedNamesRef.current);
      }
    });
  };

  // Toggle-off return: the card leaves the trail and re-enters the
  // frontier AT THE TOP — just across the boundary from where it sat.
  // The frontier may briefly hold six; that's the existing carried-sixth
  // policy (no dismissal, no backfill — the next dismissal's response
  // guard declines instead). The visible frontier is held pixel-stable;
  // the returning card takes the space the trail row gives up.
  const returnToFrontier = (itemName: string) => {
    const entry = trailRef.current.find((e) => e.rek.name === itemName);
    if (!entry) return;

    const firstName = listsRef.current?.[activeMode][0]?.name ?? null;
    const refEl =
      firstName && firstName !== itemName
        ? cardEls.current.get(firstName) ?? null
        : null;

    compensatedCommit(refEl, () => {
      setTrail((prev) => prev.filter((e) => e.rek.name !== itemName));
      setLists((prev) => {
        if (!prev) return prev;
        const list = prev[entry.mode];
        if (list.some((r) => r.name === itemName)) return prev;
        const next = [entry.rek, ...list].map((r, i) => ({
          ...r,
          rank: i + 1,
        }));
        return { ...prev, [entry.mode]: next };
      });
      setEntering(itemName);
    });
    // Release the entrance state a tick later so the drop-in plays.
    setTimeout(() => setEntering((cur) => (cur === itemName ? null : cur)), 30);
  };

  // Thumbs-down keeps its meaning on a trail card: record + dismiss —
  // the same grammar as thumbing down a liked frontier card. It vacates
  // no frontier slot, so there is nothing to backfill.
  const handleDislikeFromTrail = (itemName: string) => {
    if (!result) return;
    recordSnapSignal({
      itemName,
      itemCategory: result.detected_item.category,
      action: "dislike",
    });
    setThumbSignals((prev) => {
      const next = { ...prev };
      delete next[itemName];
      return next;
    });
    setSavedNames((prev) => {
      const next = { ...prev };
      delete next[itemName];
      return next;
    });
    setDismissedNames((p) => [...p, itemName]);
    const firstName = listsRef.current?.[activeMode][0]?.name ?? null;
    const refEl = firstName ? cardEls.current.get(firstName) ?? null : null;
    compensatedCommit(refEl, () => {
      setTrail((prev) => prev.filter((e) => e.rek.name !== itemName));
    });
  };

  // Thumbs mark and graduate: liking a frontier card migrates it up to
  // the trail (and backfills its slot). Second tap on the active thumb
  // un-marks — visual-only (no signal write), same as the search lane;
  // re-recording the same signal on repeat taps was data noise. When no
  // Save is still holding it, un-marking returns the card from the trail
  // to the top of the frontier (trail membership = marked, always).
  const toggleThumb = (itemName: string, action: "like" | "dislike") => {
    if (!result) return;
    if (thumbSignals[itemName] === action) {
      setThumbSignals((prev) => {
        const next = { ...prev };
        delete next[itemName];
        return next;
      });
      // No-op for the anchor — it was never in the trail.
      if (action === "like" && !savedNames[itemName]) {
        returnToFrontier(itemName);
      }
      return;
    }
    setThumbSignals((prev) => ({ ...prev, [itemName]: action }));
    recordSnapSignal({
      itemName,
      itemCategory: result.detected_item.category,
      action,
    });
    if (action === "like") migrateToTrail(itemName);
  };

  // Save marks and graduates, same as a thumb-up. Second tap un-marks —
  // visual-only (no signal write); the original save signal stands and
  // the schema is untouched. When no like is still holding it, un-saving
  // returns the card from the trail to the top of the frontier.
  const handleSave = (itemName: string) => {
    if (!result) return;
    if (savedNames[itemName]) {
      setSavedNames((prev) => {
        const next = { ...prev };
        delete next[itemName];
        return next;
      });
      if (thumbSignals[itemName] !== "like") returnToFrontier(itemName);
      return;
    }
    setSavedNames((prev) => ({ ...prev, [itemName]: true }));
    recordSnapSignal({
      itemName,
      itemCategory: result.detected_item.category,
      action: "save",
    });
    migrateToTrail(itemName);
  };

  // Thumbs-down on a ranked rek: record, dismiss with the exit animation,
  // then backfill the slot with a fresh single-card generation (text-only
  // /api/reksnap backfill branch — the vision prompt is never re-run).
  const handleDislikeRek = (rek: SnapRek) => {
    if (!result || !lists) return;

    recordSnapSignal({
      itemName: rek.name,
      itemCategory: result.detected_item.category,
      action: "dislike",
    });
    // Drop any contender mark so the item isn't marked liked AND dismissed.
    setThumbSignals((prev) => {
      const next = { ...prev };
      delete next[rek.name];
      return next;
    });
    setDismissedNames((p) => [...p, rek.name]);
    setExiting(rek.name);

    // Snapshot before removal. Two framings for the generator: what's still
    // on screen is a plain "do not repeat" list; everything thumbs-downed
    // this snap (including this card) is REJECTED — avoided AND steered away
    // from in the replacement.
    const mode = activeMode;
    const excludeNames = [
      result.detected_item.name,
      ...lists[mode].map((r) => r.name).filter((n) => n !== rek.name),
      // Graduated keeps left the list but must stay excluded.
      ...trail.map((e) => e.rek.name),
    ];
    const rejectedNames = [...dismissedNames, rek.name];

    setTimeout(() => {
      setLists((prev) => {
        if (!prev) return prev;
        const remaining = prev[mode]
          .filter((r) => r.name !== rek.name)
          .map((r, i) => ({ ...r, rank: i + 1 }));
        return { ...prev, [mode]: remaining };
      });
      setExiting(null);
      void backfillSlot(mode, excludeNames, rejectedNames);
    }, 250);
  };

  const backfillSlot = async (
    mode: SnapMode,
    excludeNames: string[],
    rejectedNames: string[]
  ) => {
    const forResult = resultRef.current;
    if (!forResult) return;

    setPending((p) => ({ ...p, [mode]: p[mode] + 1 }));
    try {
      const res = await fetch("/api/reksnap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backfill: {
            detectedItem: forResult.detected_item,
            mode,
            excludeNames,
            rejectedNames,
          },
        }),
      });
      if (!res.ok) throw new Error(`backfill ${res.status}`);
      const data = await res.json();
      const rek = data?.rek;
      if (!rek || typeof rek.name !== "string" || !rek.name.trim()) return;
      // A new snap arrived while this was in flight — the response belongs to
      // the old result; drop it.
      if (resultRef.current !== forResult) return;

      setLists((prev) => {
        if (!prev) return prev;
        const list = prev[mode];
        // Marked cards live in the trail now, so the frontier list itself
        // is the unmarked count. A carried sixth (toggle-off return)
        // parks the list at capacity and this guard declines.
        if (list.length >= 5) {
          return prev;
        }
        const key = rek.name.trim().toLowerCase();
        if (list.some((r) => r.name.trim().toLowerCase() === key)) return prev;
        return {
          ...prev,
          [mode]: [
            ...list,
            {
              name: rek.name,
              description:
                typeof rek.description === "string" ? rek.description : "",
              rank: list.length + 1,
            },
          ],
        };
      });
    } catch (err) {
      // Failed backfill: the slot just stays empty (list runs one short).
      console.error("RekSnap backfill failed:", err);
    } finally {
      if (resultRef.current === forResult) {
        setPending((p) => ({ ...p, [mode]: Math.max(0, p[mode] - 1) }));
      }
    }
  };

  // Lazy long tier for the anchor: same text-only /api/reksnap pattern as
  // backfill, same resultRef staleness guard. On failure the cache stays
  // null, so closing and re-opening retries for free.
  const fetchAnchorLong = async () => {
    const forResult = resultRef.current;
    if (!forResult) return;

    setAnchorLoading(true);
    try {
      const res = await fetch("/api/reksnap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anchorDetail: {
            name: forResult.detected_item.name,
            category: forResult.detected_item.category,
            // The displayed short, verbatim — the prompt deepens the axis
            // this text established.
            shortDescription: forResult.detected_item.description,
          },
        }),
      });
      if (!res.ok) throw new Error(`anchor detail ${res.status}`);
      const data = await res.json();
      if (typeof data?.long !== "string" || !data.long.trim()) return;
      // A new snap arrived while this was in flight — drop the response.
      if (resultRef.current !== forResult) return;
      setAnchorLong(data.long);
    } catch (err) {
      console.error("RekSnap anchor detail failed:", err);
    } finally {
      if (resultRef.current === forResult) setAnchorLoading(false);
    }
  };

  const toggleAnchorDetails = () => {
    if (!result) return;
    const opening = !anchorOpen;
    setAnchorOpen(opening);
    if (!opening) return;
    if (!anchorExpandSignaled) {
      setAnchorExpandSignaled(true);
      recordSnapSignal({
        itemName: result.detected_item.name,
        itemCategory: result.detected_item.category,
        action: "detail_expand",
      });
    }
    if (anchorLong === null && !anchorLoading) void fetchAnchorLong();
  };

  if (loading) {
    return (
      <div className="w-full flex flex-col items-center px-4 pt-2 pb-14 select-none">
        <div className="w-full max-w-xl">
          <RekSkeleton label="Reks Ray™ is reading your photo…" count={3} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full flex flex-col items-center px-4 pt-2 pb-14 select-none">
        {limitReached ? (
          <LimitCard />
        ) : (
          <div className="w-full max-w-xl">
            <div className="bg-white border border-amber-300 rounded-2xl p-4 shadow-sm">
              <div className="text-sm text-gray-800">{error}</div>
              <div className="mt-3">
                <button
                  onClick={() => onSnapAgain?.()}
                  className="px-3 py-2 rounded-xl text-sm bg-gray-900 text-white hover:opacity-90"
                >
                  <Camera size={16} className="inline-block mr-1" />
                  Snap again
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!result) {
    if (limitReached) {
      return (
        <div className="w-full flex flex-col items-center px-4 pt-2 pb-14 select-none">
          <LimitCard />
        </div>
      );
    }
    return null;
  }

  // One normalized category drives every gate below — the anchor-richness
  // gates (long tier AND completion verbs) and the recipe push-through —
  // so they can never drift apart.
  const detectedCategory = (result.detected_item.category ?? "")
    .trim()
    .toLowerCase();
  const anchorIsHealthMedical = HEALTH_MEDICAL_CATEGORIES.has(detectedCategory);
  const anchorIsMedia = MEDIA_CATEGORIES.has(detectedCategory);

  // "uses"-mode cards push through to a recipe by DEFAULT (food, beverages,
  // alcohol). We suppress only known non-recipe categories (health/medical/
  // etc. + non-consumable references) — see NON_RECIPE_CATEGORIES in
  // lib/categoryGates.ts. Exclusion list, not a food allow-list: the
  // model's category is unstable, so we can't enumerate every food word —
  // we enumerate what must NOT get a recipe. Trail cards keep the
  // push-through of their ORIGIN mode.
  const usesGetRecipes = !NON_RECIPE_CATEGORIES.has(detectedCategory);

  /* Recipe open lives ONLY on this button (not the whole card) so it
     won't collide with the swipe-to-dismiss gesture (frontier) or the
     tap-to-collapse wrapper (trail). Native <button> gives
     role/focus/Enter-Space for free. */
  const recipeButton = (dish: string) => (
    <button
      type="button"
      onClick={() =>
        onOpenRecipe?.({ dish, detectedItem: result.detected_item.name })
      }
      className="-mr-1 flex items-center gap-0.5 rounded-lg px-2 py-1.5 text-xs font-medium text-[#2D5AB5] transition hover:bg-[#2D5AB5]/10 active:scale-95"
    >
      View recipe
      <ChevronRight size={14} />
    </button>
  );

  // Completion verbs are pure link handoffs — same YouTube-search pattern as
  // trailers/recipes, and neutral Google searches for where-to-buy /
  // where-to-watch. No availability lookup, no affiliate logic. The media
  // pair (Trailer + Where-to-watch) lives in shared MediaVerbs components,
  // which the search lane's expanded cards render too.
  const showMeHowUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
    `how to use ${result.detected_item.name}`
  )}`;
  const whereToBuyUrl = `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(
    result.detected_item.name
  )}`;

  // The LEFT-zone ▶ video verb for non-media anchors ("Show me" — the verb
  // truncates, the ▶ and the how-to-use URL stay).
  const showMeVerb = (
    <a
      href={showMeHowUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:underline flex items-center gap-1"
    >
      <span>▶</span> Show me
    </a>
  );

  return (
    <div className="w-full flex flex-col items-center px-4 pt-2 pb-14 select-none">
      {limitReached && (
        <div className="w-full flex justify-center mb-4">
          <LimitCard />
        </div>
      )}

      {/* Detected item — no label: top position and the accent treatment
          (blue edge bar + tint) carry the anchor's identity. */}
      <div className="w-full max-w-xl">
        {/* The detected item is the anchor the whole result hangs off, so it
            is never dismissed — both thumbs mark in place (and toggle).
            Anchor richness (the lazy long tier + its expand affordance, and
            the completion verbs) is structurally gated for health/medical
            anchors: nothing renders, so the fetch/handoff can never fire —
            the client twin of the server-side 403 in /api/reksnap. */}
        <RekCard
          accent
          title={result.detected_item.name}
          short={result.detected_item.description}
          long={anchorLong ?? undefined}
          expandable={!anchorIsHealthMedical}
          detailsLoading={anchorLoading}
          detailsOpen={anchorOpen}
          onToggleDetails={toggleAnchorDetails}
          thumbSignal={thumbSignals[result.detected_item.name] ?? null}
          saved={!!savedNames[result.detected_item.name]}
          onThumbUp={() => toggleThumb(result.detected_item.name, "like")}
          onThumbDown={() => toggleThumb(result.detected_item.name, "dislike")}
          onSave={() => handleSave(result.detected_item.name)}
          /* Anchor verbs follow the SAME category gates as the rek cards
             (categoryGates.ts) so the two can never drift, now in fixed
             zones: health/medical → nothing at all; LEFT (▶ video verb) =
             Trailer for media, Show-me otherwise; MIDDLE (completion verb)
             = Where-to-watch for media, View-recipe on a recipe-gate pass
             (food/drink/alcohol, the rek cards' usesGetRecipes verbatim),
             else Where-to-buy. RIGHT stays empty-reserved on every snap
             card — no MLT plumbing exists in this lane. Mode-independent by
             design — the anchor is the snapped subject, so its verbs never
             flip with the pills. */
          verbLeft={
            anchorIsHealthMedical ? undefined : anchorIsMedia ? (
              <TrailerVerb name={result.detected_item.name} />
            ) : (
              showMeVerb
            )
          }
          verbMiddle={
            anchorIsHealthMedical ? undefined : anchorIsMedia ? (
              <WhereToWatchVerb name={result.detected_item.name} />
            ) : usesGetRecipes ? (
              recipeButton(result.detected_item.name)
            ) : (
              <a
                href={whereToBuyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                Buy
              </a>
            )
          }
        />

        {/* THE TRAIL — the user's decided keeps, compact, directly under
            the anchor and above the mode pills. Cross-mode: a keep from
            any list stays visible while browsing the others. Tapping a
            row expands it in place to a full RekCard; trail cards never
            get `swipeable`, so keep-protection is structural. */}
        {trail.length > 0 && (
          <RekTrail>
            {trail.map((entry) => (
              <TrailRow
                key={entry.rek.name}
                title={entry.rek.name}
                hint={entry.rek.description}
                thumbed={thumbSignals[entry.rek.name] === "like"}
                saved={!!savedNames[entry.rek.name]}
              >
                <RekCard
                  title={entry.rek.name}
                  short={entry.rek.description}
                  thumbSignal={thumbSignals[entry.rek.name] ?? null}
                  saved={!!savedNames[entry.rek.name]}
                  onThumbUp={() => toggleThumb(entry.rek.name, "like")}
                  onThumbDown={() => handleDislikeFromTrail(entry.rek.name)}
                  onSave={() => handleSave(entry.rek.name)}
                  /* Media reks carry their verbs into the trail; recipe
                     push-through keeps its ORIGIN mode. RIGHT reserved. */
                  verbLeft={
                    anchorIsMedia ? (
                      <TrailerVerb name={entry.rek.name} />
                    ) : undefined
                  }
                  verbMiddle={
                    anchorIsMedia ? (
                      <WhereToWatchVerb name={entry.rek.name} />
                    ) : entry.mode === "uses" && usesGetRecipes ? (
                      recipeButton(entry.rek.name)
                    ) : undefined
                  }
                />
              </TrailRow>
            ))}
          </RekTrail>
        )}
      </div>

      {/* Ranked reks — no header; the mode pills are the section separator */}
      <div className="w-full max-w-xl mt-5">
        {/* Mode toggle — all three lists are preloaded, so this is instant. */}
        <div className="flex justify-center gap-2 mb-3">
          {MODE_TABS.map(({ mode, label }) => {
            const active = mode === activeMode;
            return (
              <button
                key={mode}
                onClick={() => switchMode(mode)}
                aria-pressed={active}
                className={[
                  "px-3 py-1.5 rounded-full text-sm border transition-colors",
                  active
                    ? "bg-[#2D5AB5] border-[#2D5AB5] text-white"
                    : "bg-white border-gray-300 text-gray-600 hover:border-[#2D5AB5] hover:text-[#2D5AB5]",
                ].join(" ")}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="space-y-3">
          {/* The frontier — five full, unmarked candidates still being
              judged. The plain wrapper div carries the DOM handle the
              scroll-compensated migration commit measures against; all
              card animation stays transform/opacity on the RekCard so
              the wrapper's layout only ever changes inside that commit. */}
          {(lists?.[activeMode] ?? []).map((rek) => (
            <div
              key={rek.name}
              ref={(el) => {
                if (el) cardEls.current.set(rek.name, el);
                else cardEls.current.delete(rek.name);
              }}
            >
              <RekCard
                title={rek.name}
                rank={rek.rank}
                short={rek.description}
                // Swipe grammar (touch only): a committed swipe in either
                // direction dismisses + backfills (thumbs-down). Liked or
                // saved cards don't arm. The anchor card above never gets
                // swipeable — it never dismisses.
                swipeable
                thumbSignal={thumbSignals[rek.name] ?? null}
                saved={!!savedNames[rek.name]}
                onThumbUp={() => toggleThumb(rek.name, "like")}
                onThumbDown={() => handleDislikeRek(rek)}
                onSave={() => handleSave(rek.name)}
                className={[
                  "transition-all duration-300 ease-out",
                  migrating === rek.name
                    ? "opacity-0 -translate-y-2 scale-[0.97]" // graduating up to the trail
                    : entering === rek.name
                    ? "opacity-0 -translate-y-2" // dropping back in from the trail
                    : exiting === rek.name
                    ? "opacity-0 translate-x-3 scale-[0.97]" // dismissed sideways
                    : "opacity-100",
                ].join(" ")}
                /* Media anchors give every rek card always-visible media
                   verbs (the reks ARE movies/shows); otherwise the only
                   verb is uses-mode recipe push-through, in the MIDDLE
                   completion zone. RIGHT stays empty-reserved — no MLT in
                   this lane. */
                verbLeft={
                  anchorIsMedia ? <TrailerVerb name={rek.name} /> : undefined
                }
                verbMiddle={
                  anchorIsMedia ? (
                    <WhereToWatchVerb name={rek.name} />
                  ) : activeMode === "uses" && usesGetRecipes ? (
                    recipeButton(rek.name)
                  ) : undefined
                }
              />
            </div>
          ))}
          {/* One inline pulse per in-flight backfill for the visible mode —
              same single-slot swap pattern as the search lane. */}
          {Array.from({ length: pending[activeMode] }).map((_, i) => (
            <RekSkeletonCard key={`backfill-${i}`} />
          ))}
        </div>
      </div>

      {!limitReached && (
        <button
          onClick={() => onSnapAgain?.()}
          className="mt-6 px-4 py-2 rounded-xl text-sm border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"
        >
          <Camera size={16} />
          Snap another
        </button>
      )}
    </div>
  );
};

export default RekSnapResults;
