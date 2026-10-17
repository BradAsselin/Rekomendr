'use client';

// S10 — the line under the RekSnap button: one tip at a time, a soft fade
// every few seconds. Brad approved this wording as written (2026-10-17);
// two of his tips are held back until the app does them reliably — the
// restaurant wine list (reads the list, but anchors on a random bottle and
// calls menu prices "on this shelf") and the TV (a cable info banner reads
// as "Show S5 E14 …", so TMDb misses and there's no where-to-stream).
// Rotation pauses while touched (and for one interval after). Reduced motion: no animation, no timer;
// the tip moves on once per visit instead.

import React, { useEffect, useRef, useState } from 'react';

export type SnapTip = { snap: string; rest: string; categories?: string[] };

export const SNAP_TIPS: SnapTip[] = [
  { snap: 'Snap a wine shelf', rest: ' to compare every bottle at once', categories: ['Wine'] },
  { snap: 'Snap a label', rest: ' to see how it stacks up to your go-to' },
  {
    snap: 'Snap a movie poster',
    rest: ' for the trailer and where to watch',
    categories: ['Movies', 'TV Shows'],
  },
  { snap: 'Snap your cart', rest: ' to keep track of what you bought' },
  { snap: 'Snap it, then send it.', rest: ' Friends see the card, no app needed', categories: ['Books'] },
];

export const TIP_INTERVAL_MS = 4500;
const FADE_MS = 400;
const VISIT_KEY = 'rekomendr.snap_tip_visit';
const VISIT_SEEN = 'rekomendr.snap_tip_counted';

// The tip that matches the bar's category; the first tip otherwise.
export function tipIndexFor(category: string | undefined): number {
  const i = SNAP_TIPS.findIndex((t) => !!category && t.categories?.includes(category));
  return i < 0 ? 0 : i;
}

// Reduced motion: count visits (once per browser session), so each visit
// starts one tip further on from the category's own. Storage can throw or
// come back empty; the category's tip is the fallback.
function visitOffset(): number {
  try {
    let n = Number(localStorage.getItem(VISIT_KEY) || '0') || 0;
    if (!sessionStorage.getItem(VISIT_SEEN)) {
      sessionStorage.setItem(VISIT_SEEN, '1');
      n += 1;
      localStorage.setItem(VISIT_KEY, String(n));
    }
    return Math.max(0, n - 1);
  } catch {
    return 0;
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export default function SnapTips({ category }: { category?: string }) {
  const [index, setIndex] = useState(() => tipIndexFor(category));
  const [shown, setShown] = useState(true);
  const [reduced, setReduced] = useState(false);
  // Touching the line holds the tip; after release it stays one full
  // interval before the next fade.
  const paused = useRef(false);
  const touchedAt = useRef(0);

  // The bar's category picks the starting tip (and re-picks on change).
  useEffect(() => {
    const base = tipIndexFor(category);
    const r = prefersReducedMotion();
    setReduced(r);
    setIndex(r ? (base + visitOffset()) % SNAP_TIPS.length : base);
    setShown(true);
  }, [category]);

  useEffect(() => {
    if (reduced) return;
    let fade: ReturnType<typeof setTimeout> | undefined;
    const tick = setInterval(() => {
      if (paused.current || Date.now() - touchedAt.current < TIP_INTERVAL_MS) return;
      setShown(false);
      fade = setTimeout(() => {
        setIndex((i) => (i + 1) % SNAP_TIPS.length);
        setShown(true);
      }, FADE_MS);
    }, TIP_INTERVAL_MS);
    return () => {
      clearInterval(tick);
      if (fade) clearTimeout(fade);
    };
  }, [reduced, category]);

  const tip = SNAP_TIPS[index];
  const hold = () => {
    paused.current = true;
  };
  const release = () => {
    if (!paused.current) return;
    paused.current = false;
    touchedAt.current = Date.now();
  };

  return (
    <p
      className="mt-2 min-h-[2.75rem] max-w-[19rem] px-4 text-center text-[13px] leading-snug [text-wrap:balance]"
      style={reduced ? undefined : { transition: `opacity ${FADE_MS}ms ease`, opacity: shown ? 1 : 0 }}
      onPointerDown={hold}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      data-tip-index={index}
    >
      <span className="font-semibold text-gray-100">{tip.snap}</span>
      <span className="font-normal text-gray-300">{tip.rest}</span>
    </p>
  );
}
