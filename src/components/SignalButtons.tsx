"use client";

import React from "react";
import { ThumbsUp, ThumbsDown, Bookmark } from "lucide-react";

import type { SnapSignalAction } from "../lib/reksnapSignals";

// Presentational taste-signal buttons shared by snap result cards and the
// recipe modal. State (which signal is active) and the reksnap_signals write
// live in the parent, passed in via `current` + `onSignal`, so the existing
// "one active signal per item" highlight behavior is preserved exactly.
type Props = {
  variant: "thumbs" | "save";
  current?: SnapSignalAction;
  onSignal: (action: SnapSignalAction) => void;
  // Overrides the default wrapper classes. RekCard places the save variant
  // inside its own bottom flex row, where the default mt-3 would misalign it;
  // all other callers omit this and render exactly as before.
  className?: string;
};

// Active thumbs FILL the icon (same grammar as the Save bookmark) so the
// state reads at a glance: up fills app blue, down fills a muted dark.
const thumbClass = (active: boolean, activeClasses: string) =>
  [
    "p-1 rounded-full border",
    active
      ? activeClasses
      : "border-gray-400 text-gray-500 hover:border-black hover:text-black",
  ].join(" ");

const SignalButtons: React.FC<Props> = ({
  variant,
  current,
  onSignal,
  className,
}) => {
  if (variant === "thumbs") {
    return (
      <div className={className ?? "flex items-center gap-2"}>
        <button
          onClick={() => onSignal("like")}
          className={thumbClass(
            current === "like",
            "border-[#2D5AB5] text-[#2D5AB5]"
          )}
          aria-label="Thumbs up"
        >
          <ThumbsUp size={18} fill={current === "like" ? "#2D5AB5" : "none"} />
        </button>

        <button
          onClick={() => onSignal("dislike")}
          className={thumbClass(
            current === "dislike",
            "border-gray-700 text-gray-700"
          )}
          aria-label="Thumbs down"
        >
          <ThumbsDown
            size={18}
            fill={current === "dislike" ? "#374151" : "none"}
          />
        </button>
      </div>
    );
  }

  return (
    <div className={className ?? "flex items-center gap-4 text-sm text-gray-700 mt-3"}>
      <button
        onClick={() => onSignal("save")}
        className="hover:underline flex items-center gap-1"
      >
        <Bookmark size={16} fill={current === "save" ? "#374151" : "none"} />
        {current === "save" ? "Saved" : "Save"}
      </button>
    </div>
  );
};

export default SignalButtons;
