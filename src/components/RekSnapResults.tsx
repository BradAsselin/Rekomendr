"use client";

import React, { useEffect, useState } from "react";
import { Camera } from "lucide-react";

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
                <SignalButtons
                  variant="save"
                  current={signals[rek.name]}
                  onSignal={(a) => sendSignal(rek.name, a)}
                />
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
