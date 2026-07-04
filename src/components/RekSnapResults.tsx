"use client";

import React, { useEffect, useRef, useState } from "react";
import { Camera, ChevronRight } from "lucide-react";

import {
  HEALTH_MEDICAL_CATEGORIES,
  NON_RECIPE_CATEGORIES,
} from "../lib/categoryGates";
import { recordSnapSignal, type SnapMode } from "../lib/reksnapSignals";
import RekCard from "./RekCard";
import RekSkeleton, { RekSkeletonCard } from "./RekSkeleton";

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

  // Local copy of the three lists so thumbs-down can dismiss + backfill.
  // Reset from the prop whenever a new snap result arrives.
  const [lists, setLists] = useState<Record<SnapMode, SnapRek[]> | null>(
    result?.results ?? null
  );
  // Names dismissed this snap — excluded from every backfill generation.
  const [dismissedNames, setDismissedNames] = useState<string[]>([]);
  // Card mid-exit-animation (keyed by name; names are unique per list).
  const [exiting, setExiting] = useState<string | null>(null);
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
      setLists(result.results);
      setDismissedNames([]);
      setExiting(null);
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

  // Thumbs mark in place and toggle: second tap on the active thumb un-marks.
  // Un-marking is visual-only (no signal write) — same as the search lane;
  // re-recording the same signal on repeat taps was data noise.
  const toggleThumb = (itemName: string, action: "like" | "dislike") => {
    if (!result) return;
    if (thumbSignals[itemName] === action) {
      setThumbSignals((prev) => {
        const next = { ...prev };
        delete next[itemName];
        return next;
      });
      return;
    }
    setThumbSignals((prev) => ({ ...prev, [itemName]: action }));
    recordSnapSignal({
      itemName,
      itemCategory: result.detected_item.category,
      action,
    });
  };

  const handleSave = (itemName: string) => {
    if (!result) return;
    setSavedNames((prev) => ({ ...prev, [itemName]: true }));
    recordSnapSignal({
      itemName,
      itemCategory: result.detected_item.category,
      action: "save",
    });
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
        if (list.length >= 5) return prev;
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

  // One normalized membership check drives every anchor-richness gate below
  // (long tier AND completion verbs), so they can never drift apart.
  const anchorIsHealthMedical = HEALTH_MEDICAL_CATEGORIES.has(
    (result.detected_item.category ?? "").trim().toLowerCase()
  );

  // Completion verbs are pure link handoffs — same YouTube-search pattern as
  // trailers/recipes, and a neutral Google Shopping search for where-to-buy.
  // No availability lookup, no affiliate logic.
  const showMeHowUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
    `how to use ${result.detected_item.name}`
  )}`;
  const whereToBuyUrl = `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(
    result.detected_item.name
  )}`;

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
          completionActions={
            anchorIsHealthMedical ? undefined : (
              <>
                <a
                  href={showMeHowUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline flex items-center gap-1"
                >
                  <span>▶</span> Show me how
                </a>
                <a
                  href={whereToBuyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  Where to buy
                </a>
              </>
            )
          }
        />
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
          {(lists?.[activeMode] ?? []).map((rek) => {
            // "uses"-mode cards push through to a recipe by DEFAULT (food,
            // beverages, alcohol). We suppress only known non-recipe categories
            // (health/medical/etc. + non-consumable references) — see
            // NON_RECIPE_CATEGORIES in lib/categoryGates.ts. Exclusion list, not
            // a food allow-list: the model's category is unstable, so we can't
            // enumerate every food word — we enumerate what must NOT get a recipe.
            const category = (result.detected_item.category ?? "")
              .trim()
              .toLowerCase();
            const isFoodUse =
              activeMode === "uses" && !NON_RECIPE_CATEGORIES.has(category);

            const openRecipe = () =>
              onOpenRecipe?.({
                dish: rek.name,
                detectedItem: result.detected_item.name,
              });

            return (
              <RekCard
                key={rek.name}
                title={rek.name}
                rank={rek.rank}
                short={rek.description}
                thumbSignal={thumbSignals[rek.name] ?? null}
                saved={!!savedNames[rek.name]}
                onThumbUp={() => toggleThumb(rek.name, "like")}
                onThumbDown={() => handleDislikeRek(rek)}
                onSave={() => handleSave(rek.name)}
                className={[
                  "transition-all duration-300 ease-out",
                  exiting === rek.name
                    ? "opacity-0 translate-x-3 scale-[0.97]"
                    : "opacity-100",
                ].join(" ")}
                completionActions={
                  /* Recipe open lives ONLY on this button (not the whole card)
                     so it won't collide with the coming swipe-to-dismiss gesture.
                     Native <button> gives role/focus/Enter-Space for free. */
                  isFoodUse ? (
                    <button
                      type="button"
                      onClick={openRecipe}
                      className="-mr-1 flex items-center gap-0.5 rounded-lg px-2 py-1.5 text-xs font-medium text-[#2D5AB5] transition hover:bg-[#2D5AB5]/10 active:scale-95"
                    >
                      View recipe
                      <ChevronRight size={14} />
                    </button>
                  ) : undefined
                }
              />
            );
          })}
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
