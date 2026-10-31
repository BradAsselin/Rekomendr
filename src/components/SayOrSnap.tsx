'use client';
import React from 'react';
import { Camera, Mic } from 'lucide-react';

// S24b — the home screen's big button, split in two: Say it starts voice
// (the search box's own mic), Snap it opens the camera. Each has its one
// approved hint underneath, and the Reks Ray line beneath the pair.
// S26a — the rotating snap tips are gone from home (Brad's S25 brief, item
// 8); SnapTips.tsx stays for its harnesses but renders nowhere.

type Props = { onSay?: () => void; onSnap?: () => void; category?: string };

const BIG =
  'w-full rounded-[24px] bg-[#2D5AB5] flex flex-col items-center justify-center gap-2 shadow-xl active:scale-95 transition-transform aspect-square';

export default function SayOrSnap({ onSay, onSnap }: Props) {
  return (
    <div className="flex flex-col items-center w-full mt-2">
      <div className="grid w-full max-w-[340px] grid-cols-2 gap-4">
        <div className="flex flex-col items-center">
          <button type="button" onClick={onSay} className={BIG} data-testid="say-it">
            <Mic size={44} strokeWidth={1.5} color="white" aria-hidden="true" />
            <span className="text-white font-medium text-lg tracking-wide">Say it</span>
          </button>
          <p className="mt-2 text-center text-[12px] text-gray-400">Something fun and funny</p>
        </div>
        <div className="flex flex-col items-center">
          <button type="button" onClick={onSnap} className={BIG} data-testid="snap-it">
            <Camera size={44} strokeWidth={1.5} color="white" aria-hidden="true" />
            <span className="text-white font-medium text-lg tracking-wide">Snap it</span>
          </button>
          <p className="mt-2 text-center text-[12px] text-gray-400">A poster, a shelf, the TV</p>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-gray-400">powered by Reks Ray™</p>
    </div>
  );
}
