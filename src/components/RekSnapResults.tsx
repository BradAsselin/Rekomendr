"use client";

import React from "react";
import { Camera } from "lucide-react";

export type SnapRek = {
  name: string;
  description: string;
  rank: number;
};

export type SnapResult = {
  detected_item: { name: string; description: string };
  reks: SnapRek[];
};

type Props = {
  loading: boolean;
  result: SnapResult | null;
  error?: string | null;
  onSnapAgain?: () => void;
};

const RekSnapResults: React.FC<Props> = ({
  loading,
  result,
  error,
  onSnapAgain,
}) => {
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
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="w-full flex flex-col items-center px-4 pt-2 pb-14 select-none">
      {/* Detected item */}
      <div className="w-full max-w-xl">
        <h3 className="text-lg font-semibold text-center mb-3">Your Rek</h3>
        <div className="bg-white border border-blue-300 rounded-2xl p-4 shadow-md">
          <div className="font-semibold text-[17px] mb-2">
            {result.detected_item.name}
          </div>
          <p className="text-[15px] text-gray-700 leading-relaxed">
            {result.detected_item.description}
          </p>
        </div>
      </div>

      {/* Ranked reks */}
      <div className="w-full max-w-xl mt-8">
        <h3 className="text-lg font-semibold text-center mb-3">Your Reks</h3>
        <div className="space-y-3">
          {result.reks.map((rek) => (
            <div
              key={`${rek.rank}-${rek.name}`}
              className="bg-white border border-gray-300 rounded-2xl p-4 shadow-sm"
            >
              <div className="flex justify-between items-start mb-2">
                <span className="font-semibold text-[17px]">{rek.name}</span>
                <span className="text-xs text-gray-400 font-medium mt-1 ml-2 shrink-0">
                  #{rek.rank}
                </span>
              </div>
              <p className="text-[15px] text-gray-700 leading-relaxed">
                {rek.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={() => onSnapAgain?.()}
        className="mt-6 px-4 py-2 rounded-xl text-sm border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"
      >
        <Camera size={16} />
        Snap another
      </button>
    </div>
  );
};

export default RekSnapResults;
