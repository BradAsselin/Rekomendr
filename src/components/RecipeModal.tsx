"use client";

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";

import RekSkeleton from "./RekSkeleton";
import SignalButtons from "./SignalButtons";
import { recordSnapSignal, type SnapSignalAction } from "../lib/reksnapSignals";

// Shape returned by /api/recipe. safety_note is null for benign dishes.
type Recipe = {
  title: string;
  intro: string;
  ingredients: string[];
  steps: string[];
  safety_note: string | null;
};

type Props = {
  dish: string;
  detectedItem?: string;
  onClose: () => void;
};

const RecipeModal: React.FC<Props> = ({ dish, detectedItem, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState(false);
  // Drives the bottom-sheet slide-up; flips true after first paint.
  const [shown, setShown] = useState(false);
  // Active taste signal for this recipe — same one-active-per-item model
  // the snap cards use (Save overwrites a prior thumb highlight).
  const [signal, setSignal] = useState<SnapSignalAction | undefined>(undefined);

  // Trigger the slide-up on mount.
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Fetch the recipe when the modal opens (dish + detectedItem identify it).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setRecipe(null);
    setSignal(undefined);

    (async () => {
      try {
        const res = await fetch("/api/recipe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dish, detectedItem }),
        });
        if (!res.ok) throw new Error(`recipe ${res.status}`);
        const data = (await res.json()) as Recipe;
        if (!cancelled) setRecipe(data);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dish, detectedItem]);

  const handleSignal = (action: SnapSignalAction) => {
    setSignal(action);
    // Same reksnap_signals write path as the snap cards; the dish title is
    // the item name, category is food (recipe push-through is food-only).
    recordSnapSignal({ itemName: dish, itemCategory: "food", action });
  };

  // "Show me how" always works, even when the recipe fetch failed.
  const showMeHowUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
    dish + " recipe"
  )}`;

  const showMeHow = (
    <a
      href={showMeHowUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-semibold bg-[#2D5AB5] text-white hover:opacity-90"
    >
      + Show me how
    </a>
  );

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop — tap to dismiss */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Bottom sheet */}
      <div
        className={[
          "relative w-full max-w-xl bg-white rounded-t-2xl shadow-2xl",
          "max-h-[88vh] overflow-y-auto",
          "transition-transform duration-300 ease-out",
          shown ? "translate-y-0" : "translate-y-full",
        ].join(" ")}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 p-1.5 rounded-full text-gray-500 hover:text-black hover:bg-gray-100"
        >
          <X size={20} />
        </button>

        <div className="px-5 pt-6 pb-8">
          {loading ? (
            <RekSkeleton label="Reks Ray™ is writing your recipe…" count={3} />
          ) : error ? (
            <div className="pt-4">
              <p className="text-[15px] text-gray-800 font-medium">
                Couldn’t load that recipe.
              </p>
              <p className="text-sm text-gray-500 mt-1 mb-4">
                You can still watch how it’s made.
              </p>
              {showMeHow}
            </div>
          ) : recipe ? (
            <>
              <h2 className="text-xl font-bold pr-8">{recipe.title}</h2>
              <p className="text-[15px] text-gray-700 mt-1 leading-relaxed">
                {recipe.intro}
              </p>

              {/* Prominent — carries extra weight on high-stakes dishes where
                  the in-app steps are intentionally thin. */}
              <div className="mt-4">{showMeHow}</div>

              <h3 className="text-sm font-semibold text-gray-900 mt-6 mb-2">
                Ingredients
              </h3>
              <ul className="list-disc pl-5 space-y-1 text-[15px] text-gray-700">
                {recipe.ingredients.map((ing, i) => (
                  <li key={i}>{ing}</li>
                ))}
              </ul>

              <h3 className="text-sm font-semibold text-gray-900 mt-6 mb-2">
                Steps
              </h3>
              <ol className="list-decimal pl-5 space-y-2 text-[15px] text-gray-700">
                {recipe.steps.map((step, i) => (
                  <li key={i} className="leading-relaxed">
                    {step}
                  </li>
                ))}
              </ol>

              {/* safety_note only when present (null for benign dishes). */}
              {recipe.safety_note && (
                <div className="mt-6 bg-amber-50 border border-amber-300 rounded-xl p-3">
                  <p className="text-[13px] text-amber-900 leading-relaxed">
                    {recipe.safety_note}
                  </p>
                </div>
              )}

              {/* Taste signals — same reksnap_signals write path as snap cards. */}
              <div className="mt-6">
                <SignalButtons
                  variant="thumbs"
                  current={signal}
                  onSignal={handleSignal}
                />
                <SignalButtons
                  variant="save"
                  current={signal}
                  onSignal={handleSignal}
                />
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default RecipeModal;
