'use client';

// S10 — the line under the RekSnap button: one tip at a time, a soft fade
// every few seconds. Brad approved this wording as written (2026-10-17).
// S11 — context-aware: "Snap your cart" only on the Wine bar (hauls are
// wine-only); the label tip names the go-to only once one is starred
// (otherwise "how it compares", Brad-approved); the TV tip is back now a
// cable banner's "S5 E14 …" no longer hides the show from TMDb. Still held
// back: the restaurant wine list (needs its own mode — session log).
// Rotation pauses while touched (and for one interval after). Reduced
// motion: no animation, no timer; the tip moves on once per visit instead.

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { getWineFavorite, onWineFavoriteChange } from '../lib/wineVisit';

export type SnapTip = { id: string; snap: string; rest: string; starts?: string[] };

// The tips that apply right now, in rotation order. `starts`: the bar
// categories that open on this tip.
export function tipsFor(category: string | undefined, hasGoTo: boolean): SnapTip[] {
  const wine = category === 'Wine';
  const tips: (SnapTip | null)[] = [
    { id: 'shelf', snap: 'Snap a wine shelf', rest: ' to compare every bottle at once', starts: ['Wine'] },
    hasGoTo
      ? { id: 'label-goto', snap: 'Snap a label', rest: ' to see how it stacks up to your go-to' }
      : { id: 'label', snap: 'Snap a label', rest: ' to see how it compares' },
    { id: 'poster', snap: 'Snap a movie poster', rest: ' for the trailer and where to watch', starts: ['Movies'] },
    { id: 'tv', snap: 'Snap the TV', rest: " to see what's playing and where to stream it", starts: ['TV Shows'] },
    wine ? { id: 'cart', snap: 'Snap your cart', rest: ' to keep track of what you bought' } : null,
    { id: 'send', snap: 'Snap it, then send it.', rest: ' Friends see the card, no app needed', starts: ['Books'] },
  ];
  return tips.filter((t): t is SnapTip => t !== null);
}

export const TIP_INTERVAL_MS = 4500;
const FADE_MS = 400;
const VISIT_KEY = 'rekomendr.snap_tip_visit';
const VISIT_SEEN = 'rekomendr.snap_tip_counted';

// The tip that matches the bar's category; the first tip otherwise.
export function tipIndexFor(tips: SnapTip[], category: string | undefined): number {
  const i = tips.findIndex((t) => !!category && t.starts?.includes(category));
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
  const [hasGoTo, setHasGoTo] = useState(false);
  const tips = useMemo(() => tipsFor(category, hasGoTo), [category, hasGoTo]);
  const [index, setIndex] = useState(() => tipIndexFor(tips, category));
  const [shown, setShown] = useState(true);
  const [reduced, setReduced] = useState(false);
  // Touching the line holds the tip; after release it stays one full
  // interval before the next fade.
  const paused = useRef(false);
  const touchedAt = useRef(0);

  // The go-to lives in localStorage (and changes when a star is tapped).
  useEffect(() => {
    const read = () => setHasGoTo(!!getWineFavorite());
    read();
    return onWineFavoriteChange(read);
  }, []);

  // The bar's category picks the starting tip (and re-picks on change).
  useEffect(() => {
    const list = tipsFor(category, false);
    const base = tipIndexFor(list, category);
    const r = prefersReducedMotion();
    setReduced(r);
    setIndex(r ? (base + visitOffset()) % list.length : base);
    setShown(true);
  }, [category]);

  useEffect(() => {
    if (reduced) return;
    let fade: ReturnType<typeof setTimeout> | undefined;
    const tick = setInterval(() => {
      if (paused.current || Date.now() - touchedAt.current < TIP_INTERVAL_MS) return;
      setShown(false);
      fade = setTimeout(() => {
        setIndex((i) => (i + 1) % tips.length);
        setShown(true);
      }, FADE_MS);
    }, TIP_INTERVAL_MS);
    return () => {
      clearInterval(tick);
      if (fade) clearTimeout(fade);
    };
  }, [reduced, tips]);

  const tip = tips[index % tips.length];
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
      data-tip-index={index % tips.length}
      data-tip={tip.id}
    >
      <span className="font-semibold text-gray-100">{tip.snap}</span>
      <span className="font-normal text-gray-300">{tip.rest}</span>
    </p>
  );
}
