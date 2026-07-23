"use client";

import React, { useEffect, useState } from "react";
import { Bookmark, ThumbsUp } from "lucide-react";

// The trail: the user's decided keeps, compact, accumulating at the top —
// directly under the anchor (snap lane) / above the results (search lane).
// Spatial grammar: top of page = the decided trail; below = the undecided
// frontier of five full cards. Marked cards graduate UP into this section
// in collapsed form; tapping a row expands it in place (children = a full
// RekCard with live buttons); tapping the card's non-control area collapses
// it again (RekCard's control rows stopPropagation, so buttons stay safe).
//
// Same contract as RekCard: NO signal logic lives here. Parents own every
// handler and pass the expanded card in as children. Trail cards are never
// given `swipeable`, so swipe protection for keeps is structural, not
// conditional.

type TrailRowProps = {
  title: string;
  // One-line hint of the description — truncated, never wraps.
  hint: string;
  // State-at-a-glance icons mirror SignalButtons' fill grammar
  // (filled = active). A row can show both: thumbed AND saved.
  thumbed: boolean;
  saved: boolean;
  // Right-side slot for a per-card action (snap lane: the compact chain
  // affordance). Rendered as a SIBLING of the expand button — an
  // interactive control nested inside a button is invalid HTML and
  // misfires — so the slot's contents own their own tap.
  trailing?: React.ReactNode;
  // Media titles link out (Google info page, new tab). Same sibling
  // pattern as `trailing`: the title leaves the expand button and becomes
  // an <a> beside it — a link nested inside a button is invalid HTML.
  // The rest of the row (hint + icons) remains the expand surface.
  titleHref?: string;
  // The expanded, full-form card (a RekCard), rendered in place on tap.
  children: React.ReactNode;
};

export const TrailRow: React.FC<TrailRowProps> = ({
  title,
  hint,
  thumbed,
  saved,
  trailing,
  titleHref,
  children,
}) => {
  const [open, setOpen] = useState(false);
  // Mount entrance is transform/opacity only, so an arriving row never
  // shifts layout mid-animation — the one layout change happened in the
  // scroll-compensated commit that mounted it (see scrollCompensation).
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className={[
        "transition-all duration-200 ease-out",
        entered ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1",
      ].join(" ")}
    >
      {open ? (
        <div onClick={() => setOpen(false)}>{children}</div>
      ) : (
        <div className="w-full flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm hover:border-gray-400 transition-colors">
          {/* Media title: an <a> SIBLING of the expand button (a link inside
              a button is invalid HTML — same rule as `trailing`). Capped so
              the hint keeps a usable expand surface beside it. */}
          {titleHref && (
            <a
              href={titleHref}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 max-w-[55%] truncate text-[14px] font-medium text-gray-900 hover:underline"
            >
              {title}
            </a>
          )}
          {/* The expand tap surface — everything except the trailing action
              (and, on media rows, the title link). */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="min-w-0 flex-1 flex items-center gap-2 text-left"
          >
            <span className="min-w-0 flex-1 truncate text-[14px]">
              {!titleHref && (
                <span className="font-medium text-gray-900">{title}</span>
              )}
              <span className="text-gray-500">
                {titleHref ? `— ${hint}` : ` — ${hint}`}
              </span>
            </span>
            <span className="flex items-center gap-1.5 shrink-0 text-gray-600">
              {thumbed && (
                <ThumbsUp size={14} fill="#2D5AB5" className="text-[#2D5AB5]" />
              )}
              {saved && (
                <Bookmark size={14} fill="#374151" className="text-gray-700" />
              )}
            </span>
          </button>
          {trailing && (
            <span className="shrink-0 flex items-center">{trailing}</span>
          )}
        </div>
      )}
    </div>
  );
};

const RekTrail: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mt-3 space-y-2">{children}</div>
);

export default RekTrail;
