"use client";

import React, { useEffect, useState } from "react";
import { Camera, ChevronRight } from "lucide-react";

import {
  recordSnapSignal,
  type SnapSignalAction,
  type SnapMode,
} from "../lib/reksnapSignals";
import RekSkeleton from "./RekSkeleton";
import SignalButtons from "./SignalButtons";

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

// Recipe-link gate (see isFoodUse below). The vision model returns an UNSTABLE
// category for the same item (eggs came back "food" 3x and "eggs" 1x across 4
// snaps), so we no longer allow-list food words — that brittleness is the bug.
// Instead, in "uses" mode we DEFAULT to showing "View recipe ›" for anything you
// eat or drink (food, beverages, AND alcohol — a vodka "uses" snap returns
// cocktails, which ARE recipes), and SUPPRESS the link only when the category is
// in this known non-recipe set:
//   (a) health / medical / supplement / ingestible-non-food — must NEVER get a
//       recipe link (medication, vitamins, CBD/tinctures, skincare creams, etc.);
//   (b) non-consumable reference categories these snaps already return and that
//       never had recipes (movies, books, products/car-care, etc.).
// Matched by EXACT normalized (trim + lowercase) membership so short tokens can't
// collide via substring (e.g. ice "cream" food ≠ cortisone "cream"; "carrot" ≠
// "car"). Add words here as real leakers are observed (e.g. "antacid" for Tums).
const NON_RECIPE_CATEGORIES = new Set<string>([
  // (a) health / medical / supplement / ingestible-non-food
  "medication", "medications", "medicine", "medicines", "drug", "drugs",
  "pharmacy", "prescription", "otc",
  "vitamin", "vitamins", "supplement", "supplements", "probiotic", "probiotics",
  "cbd", "tincture", "tinctures", "cannabis", "hemp", "kratom",
  "skincare", "skin care", "cosmetic", "cosmetics", "beauty", "makeup",
  "cream", "creams", "lotion", "ointment", "balm", "serum", "sunscreen",
  "topical", "essential oil", "essential oils",
  "antacid",
  "health", "medical", "wellness", "first aid", "personal care", "hygiene",
  // (b) non-consumable reference categories
  "movie", "movies", "film", "films", "tv", "television", "tv show",
  "tv shows", "show", "shows", "streaming",
  "book", "books", "ebook", "magazine",
  "music", "album", "albums",
  "game", "games", "video game", "video games",
  "car care", "car-care", "carcare", "automotive", "auto", "auto care",
  "cleaning", "cleaning supplies", "cleaner", "household", "detergent", "laundry",
  "electronics", "gadget", "appliance", "appliances",
  "product", "products", "tool", "tools", "hardware",
  "clothing", "apparel", "shoes", "furniture",
]);

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
  // Last signal sent per item name, for button highlight state.
  const [signals, setSignals] = useState<Record<string, SnapSignalAction>>({});

  // Which intent list is on screen. Defaults to the model's inferred mode;
  // all three lists are already loaded, so switching is instant (no API call).
  const [activeMode, setActiveMode] = useState<SnapMode>(result?.mode ?? "similar");

  // A new snap result resets the view to its inferred mode and clears highlights.
  useEffect(() => {
    if (result) {
      setActiveMode(result.mode);
      setSignals({});
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

  const sendSignal = (itemName: string, action: SnapSignalAction) => {
    if (!result) return;
    setSignals((prev) => ({ ...prev, [itemName]: action }));
    recordSnapSignal({
      itemName,
      itemCategory: result.detected_item.category,
      action,
    });
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

  return (
    <div className="w-full flex flex-col items-center px-4 pt-2 pb-14 select-none">
      {limitReached && (
        <div className="w-full flex justify-center mb-4">
          <LimitCard />
        </div>
      )}

      {/* Detected item */}
      <div className="w-full max-w-xl">
        <h3 className="text-lg font-semibold text-center mb-3">Your Rek</h3>
        <div className="bg-white border border-blue-300 rounded-2xl p-4 shadow-md">
          <div className="flex justify-between items-start mb-2">
            <span className="font-semibold text-[17px]">
              {result.detected_item.name}
            </span>
            <SignalButtons
              variant="thumbs"
              current={signals[result.detected_item.name]}
              onSignal={(a) => sendSignal(result.detected_item.name, a)}
            />
          </div>
          <p className="text-[15px] text-gray-700 leading-relaxed">
            {result.detected_item.description}
          </p>
          <SignalButtons
            variant="save"
            current={signals[result.detected_item.name]}
            onSignal={(a) => sendSignal(result.detected_item.name, a)}
          />
        </div>
      </div>

      {/* Ranked reks */}
      <div className="w-full max-w-xl mt-8">
        <h3 className="text-lg font-semibold text-center mb-3">Your Reks</h3>

        {/* Mode toggle — all three lists are preloaded, so this is instant. */}
        <div className="flex justify-center gap-2 mb-4">
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
          {result.results[activeMode].map((rek) => {
            // "uses"-mode cards push through to a recipe by DEFAULT (food,
            // beverages, alcohol). We suppress only known non-recipe categories
            // (health/medical/etc. + non-consumable references) — see
            // NON_RECIPE_CATEGORIES above. Exclusion list, not a food allow-list:
            // the model's category is unstable, so we can't enumerate every food
            // word — we enumerate the things that must NOT get a recipe instead.
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
              <div
                key={`${rek.rank}-${rek.name}`}
                className="bg-white border border-gray-300 rounded-2xl p-4 shadow-sm"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="font-semibold text-[17px]">{rek.name}</span>
                  {/* Signal controls own their taps so they never open the modal. */}
                  <div
                    className="flex items-center gap-2 ml-2 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-xs text-gray-400 font-medium mr-1">
                      #{rek.rank}
                    </span>
                    <SignalButtons
                      variant="thumbs"
                      current={signals[rek.name]}
                      onSignal={(a) => sendSignal(rek.name, a)}
                    />
                  </div>
                </div>
                <p className="text-[15px] text-gray-700 leading-relaxed">
                  {rek.description}
                </p>
                <div onClick={(e) => e.stopPropagation()}>
                  <SignalButtons
                    variant="save"
                    current={signals[rek.name]}
                    onSignal={(a) => sendSignal(rek.name, a)}
                  />
                </div>

                {/* Recipe open lives ONLY on this button (not the whole card)
                    so it won't collide with the coming swipe-to-dismiss gesture.
                    Native <button> gives role/focus/Enter-Space for free. */}
                {isFoodUse && (
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={openRecipe}
                      className="-mr-1 flex items-center gap-0.5 rounded-lg px-2 py-1.5 text-xs font-medium text-[#2D5AB5] transition hover:bg-[#2D5AB5]/10 active:scale-95"
                    >
                      View recipe
                      <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
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
