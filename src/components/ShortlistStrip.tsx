"use client";

import React, { useState } from "react";

// THE SHORTLIST STRIP (S1) — "the pen made visible".
//
// Liked-but-not-watched titles for the active category, newest first, in a
// compact horizontal strip above the results. Its whole job is RECALL: two
// months of taste memory had been used only to subtract, and this is the
// first surface that gives what the user already loves somewhere to live.
//
// Affordance budget (charter §2.6 — one new tap target per feature, and
// modes are forbidden): the COLLAPSED strip adds exactly one — the chip.
// "Watched it" lives inside the expanded chip, never on the strip itself,
// so the collapsed surface grows by one tap target and no more.
//
// Position grammar (charter §2.5) is untouched: the decided trail stays
// above the undecided frontier. The strip is a third band above both —
// memory, not a decision being made now.
//
// Media titles keep their title→Google handoff (the August decision), and
// it is an <a> SIBLING of the expand button: a link nested inside a button
// is invalid HTML and misfires. Same pattern as TrailRow.

export type ShortlistItem = {
  title: string;
  year: number | null;
  likedAt: string | null;
};

type Props = {
  items: ShortlistItem[];
  // Google info URL for a media title; undefined for non-media categories,
  // which get no handoff (same gate as the frontier's media verbs).
  titleHref?: (title: string) => string | undefined;
  // Absent for categories with no "finished" verb (Wine, Books today) —
  // the expanded chip then shows the memory line alone.
  onWatched?: (item: ShortlistItem) => void;
  // Keyed by title — the write is in flight for this chip.
  pendingTitle?: string | null;
  // Keyed by title — the last write for this chip did not land. Honest
  // over quiet: the chip stays, and says so.
  failedTitle?: string | null;
  // Rendered under the expanded chip, e.g. "You liked this in July."
  markerFor?: (item: ShortlistItem) => string | null;
};

const ShortlistStrip: React.FC<Props> = ({
  items,
  titleHref,
  onWatched,
  pendingTitle,
  failedTitle,
  markerFor,
}) => {
  const [openTitle, setOpenTitle] = useState<string | null>(null);

  if (items.length === 0) return null;

  const open = items.find((i) => i.title === openTitle) ?? null;
  const href = open && titleHref ? titleHref(open.title) : undefined;
  const marker = open && markerFor ? markerFor(open) : null;

  return (
    <div className="w-full max-w-xl">
      {/* The band's own quiet label. Not a control — the strip must not
          read as a filter or a mode. */}
      <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-1.5 px-0.5">
        Your shortlist
      </div>

      <div
        className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
        // Horizontal scroll only; the page keeps its own vertical scroll.
        style={{ scrollbarWidth: "thin" }}
      >
        {items.map((item) => {
          const isOpen = item.title === openTitle;
          return (
            <button
              key={`${item.title}-${item.year ?? ""}`}
              type="button"
              onClick={() => setOpenTitle(isOpen ? null : item.title)}
              className={[
                "shrink-0 max-w-[60vw] truncate rounded-full border px-3 py-1.5 text-[13px] transition-colors",
                isOpen
                  ? "border-[#2D5AB5] bg-[#2D5AB5]/5 text-[#2D5AB5]"
                  : "border-gray-300 bg-white text-gray-800 hover:border-gray-400",
              ].join(" ")}
            >
              {item.title}
            </button>
          );
        })}
      </div>

      {/* EXPAND-IN-PLACE. No copy is generated for a shortlist entry —
          the app never saved a blurb for it, and inventing one here would
          be a second generation site for a strip that is meant to be a
          memory, not a pitch. What it shows is what is true: when it was
          liked, where to go read about it, and the one verdict that
          retires it. */}
      {open && (
        <div className="mt-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[15px] font-semibold text-gray-900 hover:underline"
                >
                  {open.year != null ? `${open.title} (${open.year})` : open.title}
                </a>
              ) : (
                <span className="text-[15px] font-semibold text-gray-900">
                  {open.year != null ? `${open.title} (${open.year})` : open.title}
                </span>
              )}
              {marker && (
                <div className="mt-0.5 text-[13px] text-gray-500">{marker}</div>
              )}
            </div>

            {onWatched && (
              <button
                type="button"
                disabled={pendingTitle === open.title}
                onClick={() => onWatched(open)}
                className="shrink-0 rounded-lg border border-gray-300 px-2.5 py-1 text-[13px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {pendingTitle === open.title ? "Saving…" : "Watched it"}
              </button>
            )}
          </div>

          {/* Plain voice: this is machinery reporting on itself, never
              Reks Ray. The tap did not persist and the chip is still
              here — say so rather than let it look done. */}
          {failedTitle === open.title && (
            <div className="mt-2 text-[13px] text-amber-700">
              Couldn’t save that just yet — it’s still on your shortlist.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ShortlistStrip;
