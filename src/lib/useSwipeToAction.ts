"use client";

import { useRef } from "react";

/* ------------------------------------------------------------------
   SWIPE-TO-ACTION (touch only)
   - Left = the card's thumbs-down, right = the card's Save; the hook
     calls the SAME handlers the buttons use — no new signal paths.
   - Scroll coexistence: the card root gets touch-action: pan-y (the
     caller adds the class), so vertical panning stays native. Past a
     10px slop the gesture direction-locks ONCE — horizontal arms the
     swipe, vertical cedes the touch to the scroller for good.
   - Tap safety: under slop nothing arms, so taps on buttons inside the
     card work untouched. Once armed, a click-capture guard swallows
     exactly one click so a short swipe can never misfire as a tap.
   - Desktop: pointers that aren't touch never arm — thumbs remain the
     desktop grammar.
   - Visuals are imperative inline styles (transform/opacity) so the
     drag never re-renders React and never fights the lanes' class
     transitions (inline transition overrides them while active).
------------------------------------------------------------------- */

const SLOP_PX = 10; // movement before tap-vs-gesture is decided
const DIRECTION_RATIO = 1.2; // |dx| must beat |dy| by this to arm
const COMMIT_FRACTION = 0.3; // of card width — release past this commits
const FLICK_MIN_PX = 48; // a fast short swipe also commits…
const FLICK_VELOCITY = 0.5; // …at this average speed (px/ms)
const SNAPBACK_MS = 200;
const EXIT_MS = 200;

type Phase = "idle" | "pending" | "armed" | "scroll";

type SwipeOptions = {
  enabled: boolean;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  // Whether a committed right-swipe flings the card off (search: Save
  // dismisses) or springs back in place (snap: Save marks in place).
  rightExits: boolean;
};

export type SwipeHandlers = {
  onPointerDown: React.PointerEventHandler<HTMLDivElement>;
  onPointerMove: React.PointerEventHandler<HTMLDivElement>;
  onPointerUp: React.PointerEventHandler<HTMLDivElement>;
  onPointerCancel: React.PointerEventHandler<HTMLDivElement>;
  onClickCapture: React.MouseEventHandler<HTMLDivElement>;
};

function snapBack(el: HTMLElement) {
  el.style.transition = `transform ${SNAPBACK_MS}ms ease-out, opacity ${SNAPBACK_MS}ms ease-out`;
  el.style.transform = "translateX(0px)";
  el.style.opacity = "1";
  // Hand style ownership back to the lane's classes once settled.
  setTimeout(() => {
    el.style.removeProperty("transition");
    el.style.removeProperty("transform");
    el.style.removeProperty("opacity");
  }, SNAPBACK_MS);
}

function flingOff(el: HTMLElement, sign: -1 | 1) {
  // No cleanup: the lane's handler removes the card ~250ms later, so the
  // element leaves the tree right as the fling completes.
  el.style.transition = `transform ${EXIT_MS}ms ease-out, opacity ${EXIT_MS}ms ease-out`;
  el.style.transform = `translateX(${sign * 110}%)`;
  el.style.opacity = "0";
}

export function useSwipeToAction({
  enabled,
  onSwipeLeft,
  onSwipeRight,
  rightExits,
}: SwipeOptions): SwipeHandlers {
  const phaseRef = useRef<Phase>("idle");
  const originRef = useRef({ x: 0, y: 0, t: 0 });
  const suppressClickRef = useRef(false);

  const onPointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (!enabled || e.pointerType !== "touch") return;
    if (phaseRef.current !== "idle") return;
    phaseRef.current = "pending";
    suppressClickRef.current = false;
    originRef.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
  };

  const onPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
    const phase = phaseRef.current;
    if (phase === "idle" || phase === "scroll") return;
    if (e.pointerType !== "touch") return;

    const dx = e.clientX - originRef.current.x;
    const dy = e.clientY - originRef.current.y;

    if (phase === "pending") {
      if (Math.hypot(dx, dy) < SLOP_PX) return;
      // One decision per touch — a scroll never becomes a swipe later.
      if (Math.abs(dx) > Math.abs(dy) * DIRECTION_RATIO) {
        phaseRef.current = "armed";
        suppressClickRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      } else {
        phaseRef.current = "scroll";
        return;
      }
    }

    const el = e.currentTarget;
    const width = el.offsetWidth || 1;
    const progress = Math.min(
      Math.abs(dx) / (width * COMMIT_FRACTION),
      1
    );
    el.style.transition = "none";
    el.style.transform = `translateX(${dx}px)`;
    el.style.opacity = String(1 - 0.4 * progress);
  };

  const onPointerUp: React.PointerEventHandler<HTMLDivElement> = (e) => {
    const phase = phaseRef.current;
    phaseRef.current = "idle";
    if (phase !== "armed") return;

    const el = e.currentTarget;
    const dx = e.clientX - originRef.current.x;
    const width = el.offsetWidth || 1;
    const elapsed = Math.max(e.timeStamp - originRef.current.t, 1);
    const avgVelocity = Math.abs(dx) / elapsed;

    const commit =
      Math.abs(dx) >= width * COMMIT_FRACTION ||
      (Math.abs(dx) >= FLICK_MIN_PX && avgVelocity >= FLICK_VELOCITY);

    if (!commit) {
      snapBack(el);
      return;
    }

    if (dx < 0) {
      flingOff(el, -1);
      onSwipeLeft();
    } else if (rightExits) {
      flingOff(el, 1);
      onSwipeRight();
    } else {
      snapBack(el);
      onSwipeRight();
    }
  };

  const onPointerCancel: React.PointerEventHandler<HTMLDivElement> = (e) => {
    // The browser reclaimed the touch (e.g. scroll took over) — abort.
    if (phaseRef.current === "armed") snapBack(e.currentTarget);
    phaseRef.current = "idle";
  };

  const onClickCapture: React.MouseEventHandler<HTMLDivElement> = (e) => {
    // An armed gesture consumed this touch — its release must not also
    // click whatever control the swipe started on.
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClickCapture,
  };
}
