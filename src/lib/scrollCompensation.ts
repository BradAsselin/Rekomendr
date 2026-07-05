"use client";

import { flushSync } from "react-dom";

/* ------------------------------------------------------------------
   SCROLL-COMPENSATED LAYOUT COMMIT
   The named risk of graduation-upward: a card migrating out of the
   frontier changes layout ABOVE whatever the user is looking at, which
   would lurch the page. The rule that makes this tractable: all
   migration animation is transform/opacity (layout-inert); actual
   layout changes happen exactly once, inside this helper, in a single
   compensated frame.

   Measure, don't estimate: hold one on-screen reference element (the
   frontier card beside the migration) pixel-stable across the commit.
   flushSync applies the React state change synchronously, the
   reference is re-measured, and scrollTop is nudged by the real delta
   — wrapping text, borders, and gaps all come out in the measurement.
   Runs before paint, so the layout snap and the scroll adjustment land
   in the same frame; there is no visible intermediate state.
------------------------------------------------------------------- */
export function compensatedCommit(
  referenceEl: HTMLElement | null,
  mutate: () => void
): void {
  if (!referenceEl || !referenceEl.isConnected) {
    flushSync(mutate);
    return;
  }
  const before = referenceEl.getBoundingClientRect().top;
  flushSync(mutate);
  // The reference must survive the commit; if it left the tree there is
  // nothing to hold stable (callers pick elements that stay mounted).
  if (!referenceEl.isConnected) return;
  const delta = referenceEl.getBoundingClientRect().top - before;
  if (delta !== 0) {
    // The app scrolls the document. scrollTop clamps at 0 naturally, so
    // an unscrolled page simply shows the honest insert under the anchor.
    const scroller = document.scrollingElement ?? document.documentElement;
    scroller.scrollTop += delta;
  }
}
