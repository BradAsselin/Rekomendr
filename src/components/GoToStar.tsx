"use client";

// S12 — the go-to star for movies, shows and books: the same star wine
// cards carry (S8b), in the same place (left of Save), separate from Save.
// One tap stars, one tap on the lit star un-stars; many go-tos per
// category. Renders nothing for a category without go-tos (the allow-list
// in goToCategory.ts — health never gets one).

import React, { useEffect, useState } from "react";
import { Star } from "lucide-react";

import { goToCategoryFor } from "../lib/goToCategory";
import { isGoTo, onGoTosChange, toggleGoTo, type StarInput } from "../lib/goTos";

// Subscribed state for one title (the star, the touchstone label, the
// anchor's "+ More like this" all follow it).
export function useIsGoTo(category: unknown, name: string): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(isGoTo(category, name));
    return onGoTosChange(() => setOn(isGoTo(category, name)));
  }, [category, name]);
  return on;
}

const GoToStar: React.FC<{ item: StarInput; size?: number; onStar?: () => void }> = ({
  item,
  size = 18,
  onStar,
}) => {
  const on = useIsGoTo(item.category, item.name);
  if (!goToCategoryFor(item.category)) return null;
  return (
    <button
      type="button"
      aria-label={on ? "Your go-to (tap to unstar)" : "Make this my go-to"}
      aria-pressed={on}
      title={on ? "Your go-to" : "Make it my go-to"}
      onClick={(e) => {
        e.stopPropagation();
        if (!on) onStar?.();
        void toggleGoTo(item);
      }}
      className="p-1 -m-1 transition active:scale-90"
    >
      <Star
        size={size}
        strokeWidth={1.8}
        className={on ? "fill-amber-400 text-amber-500" : "text-gray-400 hover:text-amber-500"}
      />
    </button>
  );
};

export default GoToStar;
