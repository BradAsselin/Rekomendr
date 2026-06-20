"use client";

import React from "react";

/* ------------------------------------------------------------------
   SHARED "REKS RAY IS WORKING" LOADING STATE
   - One pulsing skeleton card previews the shape of a result row.
   - RekSkeleton stacks N of them under a context-aware header.
   - Used for every AI generation moment: RekSnap, fresh AI search,
     and "+ More like this". The single-card backfill swap uses
     RekSkeletonCard on its own.
   - Header text is legible on both the dark mobile bg (#0b1725) and
     the white sm+ bg — the app has no Tailwind dark-mode, the dark
     background is just the mobile breakpoint (see app/layout.tsx).
------------------------------------------------------------------- */

export function RekSkeletonCard() {
  return (
    <div className="bg-white border border-gray-300 rounded-2xl p-4 shadow-sm animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-1/2 mb-3" />
      <div className="h-3 bg-gray-100 rounded w-full mb-2" />
      <div className="h-3 bg-gray-100 rounded w-3/4" />
    </div>
  );
}

export function RekSkeletonHeader({ label }: { label: string }) {
  return (
    <div className="mb-3 text-sm font-medium animate-pulse text-gray-100 sm:text-gray-700">
      {label}
    </div>
  );
}

type RekSkeletonProps = {
  /** Context-aware header line in the friendly Reks Ray™ voice. */
  label: string;
  /** How many skeleton cards to preview. */
  count?: number;
};

export default function RekSkeleton({ label, count = 5 }: RekSkeletonProps) {
  return (
    <div className="w-full">
      <RekSkeletonHeader label={label} />
      <div className="space-y-3">
        {Array.from({ length: count }).map((_, i) => (
          <RekSkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
