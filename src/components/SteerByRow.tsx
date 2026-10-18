"use client";

// S12b — "Steer by": the category's go-tos as one chip row above the
// results, nearest first, then most recent. The lit chip is the go-to the
// set on screen is steered by; one tap on another re-runs the results
// steered by it. Hidden when the category has no go-tos. Same bubble as
// the mood chips (SearchBar).

import React from "react";

const bubble = (active: boolean) =>
  [
    "shrink-0 rounded-full border px-3 py-1.5 text-[13px] transition-colors",
    active
      ? "border-[#2D5AB5] bg-[#2D5AB5]/5 text-[#2D5AB5]"
      : "border-gray-300 bg-white text-gray-800 hover:border-gray-400",
  ].join(" ");

const SteerByRow: React.FC<{
  names: string[];
  selected: string | null;
  busy?: boolean;
  onSteer: (name: string) => void;
}> = ({ names, selected, busy, onSteer }) => {
  if (names.length === 0) return null;
  return (
    <div className="w-full max-w-xl mb-3" aria-label="Steer by">
      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: "thin" }}>
        <span className="shrink-0 text-[13px] text-gray-300 sm:text-gray-600">Steer by</span>
        {names.map((n) => (
          <button
            key={n}
            type="button"
            disabled={busy}
            aria-pressed={selected === n}
            onClick={() => onSteer(n)}
            className={bubble(selected === n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
};

export default SteerByRow;
