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
};

const thumbClass = (active: boolean) =>
  [
    "p-1 rounded-full border",
    active
      ? "border-black text-black"
      : "border-gray-400 text-gray-500 hover:border-black hover:text-black",
  ].join(" ");

const SignalButtons: React.FC<Props> = ({ variant, current, onSignal }) => {
  if (variant === "thumbs") {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => onSignal("like")}
          className={thumbClass(current === "like")}
          aria-label="Thumbs up"
        >
          <ThumbsUp size={18} />
        </button>

        <button
          onClick={() => onSignal("dislike")}
          className={thumbClass(current === "dislike")}
          aria-label="Thumbs down"
        >
          <ThumbsDown size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 text-sm text-gray-700 mt-3">
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
