'use client';
import React, { useEffect, useState } from 'react';
import { Camera, Mic } from 'lucide-react';

// S24b — the home screen's big button, split in two: Say it starts voice
// (the search box's own mic), Snap it opens the camera, and the Reks Ray
// line beneath. S26a — the rotating snap tips are gone from home;
// SnapTips.tsx stays for its harnesses but renders nowhere.
// S29 — one centered rounded square split by a fine inset line (left Say
// it, right Snap it; each half its own button, same actions), 260px (200px
// on a short screen), 48px under the chips. The per-button hints are gone;
// under the square one nudge line rotates every 5s with a dot per line.
// The 48px counts from the chips: the bar's 11px progress strip sits
// between, so the margin here is 48 − 11 − the wrapper's mt-8 (mt-5 short).

type Props = { onSay?: () => void; onSnap?: () => void; category?: string };

// Brad-approved wording (2026-10-31).
export const NUDGES = [
  'Try saying ‘a cozy mystery for tonight’',
  'Snap a wine shelf and we’ll pick the best bottle on it',
  'Snap the TV screen to find what’s like it',
  'Say a movie you loved, and we’ll find its cousins',
];
const NUDGE_MS = 5000;

const HALF =
  'flex h-full flex-col items-center justify-center gap-2 transition-colors active:bg-white/10 focus-visible:bg-white/10 outline-none';

export default function SayOrSnap({ onSay, onSnap }: Props) {
  const [nudge, setNudge] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setNudge((n) => (n + 1) % NUDGES.length), NUDGE_MS);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div className="flex flex-1 flex-col items-center w-full mt-[5px] [@media(max-height:700px)]:mt-[17px]">
      <div
        className="relative grid size-[260px] grid-cols-2 overflow-hidden rounded-[34px] bg-[#2D5AB5] shadow-[0_10px_30px_rgba(0,0,0,0.35)] [@media(max-height:700px)]:size-[200px]"
        data-testid="say-snap-square"
      >
        <button type="button" onClick={onSay} className={HALF} data-testid="say-it">
          <Mic size={44} strokeWidth={1.5} color="white" aria-hidden="true" />
          <span className="text-white font-medium text-lg tracking-wide">Say it</span>
        </button>
        <button type="button" onClick={onSnap} className={HALF} data-testid="snap-it">
          <Camera size={44} strokeWidth={1.5} color="white" aria-hidden="true" />
          <span className="text-white font-medium text-lg tracking-wide">Snap it</span>
        </button>
        <span
          aria-hidden="true"
          data-testid="say-snap-divider"
          className="pointer-events-none absolute left-1/2 top-[18%] bottom-[18%] w-px -translate-x-1/2 bg-white/35"
        />
      </div>
      <p className="mt-4 min-h-[40px] max-w-[300px] text-center text-[14px] leading-5 text-gray-400" data-testid="home-nudge">
        {NUDGES[nudge]}
      </p>
      <div className="mt-2 flex gap-1.5" aria-hidden="true" data-testid="home-nudge-dots">
        {NUDGES.map((_, i) => (
          <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === nudge ? 'bg-gray-300' : 'bg-gray-600'}`} />
        ))}
      </div>
      <p className="mt-auto pt-3 text-[11px] text-gray-400">powered by Reks Ray™</p>
    </div>
  );
}
