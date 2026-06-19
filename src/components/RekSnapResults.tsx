"use client";

import React, { useEffect, useState } from "react";
import { Camera, ThumbsUp, ThumbsDown, Bookmark } from "lucide-react";

import {
  recordSnapSignal,
  type SnapSignalAction,
  type SnapMode,
} from "../lib/reksnapSignals";

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

  const signalButtons = (itemName: string) => {
    const current = signals[itemName];

    const thumbClass = (active: boolean) =>
      [
        "p-1 rounded-full border",
        active
          ? "border-black text-black"
          : "border-gray-400 text-gray-500 hover:border-black hover:text-black",
      ].join(" ");

    return {
      thumbs: (
        <div className="flex items-center gap-2">
          <button
            onClick={() => sendSignal(itemName, "like")}
            className={thumbClass(current === "like")}
            aria-label="Thumbs up"
          >
            <ThumbsUp size={18} />
          </button>

          <button
            onClick={() => sendSignal(itemName, "dislike")}
            className={thumbClass(current === "dislike")}
            aria-label="Thumbs down"
          >
            <ThumbsDown size={18} />
          </button>
        </div>
      ),
      save: (
        <div className="flex items-center gap-4 text-sm text-gray-700 mt-3">
          <button
            onClick={() => sendSignal(itemName, "save")}
            className="hover:underline flex items-center gap-1"
          >
            <Bookmark
              size={16}
              fill={current === "save" ? "#374151" : "none"}
            />
            {current === "save" ? "Saved" : "Save"}
          </button>
        </div>
      ),
    };
  };

  if (loading) {
    return (
      <div className="w-full flex flex-col items-center px-4 pt-2 pb-14 select-none">
        <div className="text-sm text-gray-600 mb-2 animate-pulse">
          Reks Ray™ is reading your photo…
        </div>
        <div className="w-full max-w-xl space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="bg-white border border-gray-300 rounded-2xl p-4 shadow-sm animate-pulse"
            >
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-3" />
              <div className="h-3 bg-gray-100 rounded w-full mb-2" />
              <div className="h-3 bg-gray-100 rounded w-3/4" />
            </div>
          ))}
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

  const detectedButtons = signalButtons(result.detected_item.name);

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
            {detectedButtons.thumbs}
          </div>
          <p className="text-[15px] text-gray-700 leading-relaxed">
            {result.detected_item.description}
          </p>
          {detectedButtons.save}
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
            const buttons = signalButtons(rek.name);
            return (
              <div
                key={`${rek.rank}-${rek.name}`}
                className="bg-white border border-gray-300 rounded-2xl p-4 shadow-sm"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="font-semibold text-[17px]">{rek.name}</span>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    <span className="text-xs text-gray-400 font-medium mr-1">
                      #{rek.rank}
                    </span>
                    {buttons.thumbs}
                  </div>
                </div>
                <p className="text-[15px] text-gray-700 leading-relaxed">
                  {rek.description}
                </p>
                {buttons.save}
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
