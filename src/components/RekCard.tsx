"use client";

import React from "react";
import { Heart } from "lucide-react";

import SignalButtons from "./SignalButtons";
import type { SnapSignalAction } from "../lib/reksnapSignals";

// One shared presentational rek card — the single skeleton both lanes render
// onto (snap-origin and search-origin). Four zones:
//   1. Top row: optional genre/category line, then title (+ year) left,
//      optional #rank + thumbs right.
//   2. Description: `short`, with a "Show details" expander ONLY when `long`
//      exists (search cards have long; snap cards don't).
//   3. Bottom-left (affinity): Save, plus heart/favorite when the lane
//      supports it (search only for now).
//   4. Bottom-right (completion verb): whatever the parent passes — search
//      sends "+ More like this" + "Trailer", snap food-uses sends
//      "View recipe ›".
// NO signal logic lives here. Parents own handlers and pipelines:
// RekSnapResults keeps recordSnapSignal/reksnap_signals with
// highlight-in-place; ResultsV4 keeps its remove+backfill+userPrefs behavior.

// Long descriptions are previewed, not dumped — same cap search cards
// always used.
const LONG_PREVIEW_MAX = 420;

type Props = {
  title: string;
  // Appended as "(year)" when present (search cards have it, snap doesn't).
  year?: number;
  // When set, the title renders as an external link (search's Google link).
  titleHref?: string;
  // Rendered above the title row (search's DescriptorLine). Omit for snap.
  genreLine?: React.ReactNode;
  // Snap cards show their list position next to the thumbs.
  rank?: number;
  short: string;
  // Presence of `long` is what enables the "Show details" affordance.
  long?: string;
  // Details expansion is controlled by the parent so lanes can keep their
  // existing semantics (ResultsV4 allows one open card at a time).
  detailsOpen?: boolean;
  onToggleDetails?: () => void;
  // Highlight state for thumbs/save — one active signal per card. Snap sets
  // any of the actions; search sets only "like" (contender mark). Search's
  // Save still removes the card, so the single-value shape never has to show
  // like + save at once there.
  signal?: SnapSignalAction;
  onThumbUp: () => void;
  onThumbDown: () => void;
  onSave: () => void;
  // Heart renders only when the lane provides a handler.
  onHeart?: () => void;
  isFavorite?: boolean;
  // Bottom-right completion-verb slot.
  completionActions?: React.ReactNode;
  // Emphasized chrome for the snap detected-item card.
  accent?: boolean;
  // Extra root classes/styles — ResultsV4 threads its stagger animation here.
  className?: string;
  style?: React.CSSProperties;
};

const RekCard: React.FC<Props> = ({
  title,
  year,
  titleHref,
  genreLine,
  rank,
  short,
  long,
  detailsOpen,
  onToggleDetails,
  signal,
  onThumbUp,
  onThumbDown,
  onSave,
  onHeart,
  isFavorite,
  completionActions,
  accent,
  className,
  style,
}) => {
  const titleText = year != null ? `${title} (${year})` : title;

  return (
    <div
      className={[
        "rounded-2xl p-4",
        // Accent must read against the dark mobile bg (#0b1725), where a thin
        // blue border vanishes: brand-blue left-edge bar + light interior tint.
        accent
          ? "bg-blue-50 border border-blue-300 border-l-4 border-l-[#2D5AB5] shadow-md"
          : "bg-white border border-gray-300 shadow-sm",
        className ?? "",
      ]
        .join(" ")
        .trim()}
      style={style}
    >
      {genreLine}

      {/* TITLE + THUMBS */}
      <div className="flex justify-between items-start mb-2">
        {titleHref ? (
          <a
            href={titleHref}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[17px] hover:underline"
          >
            {titleText}
          </a>
        ) : (
          <span className="font-semibold text-[17px]">{titleText}</span>
        )}

        {/* Signal controls own their taps so they never trigger card-level
            gestures (future swipe-to-dismiss). */}
        <div
          className="flex items-center gap-2 ml-2 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {rank != null && (
            <span className="text-xs text-gray-400 font-medium mr-1">
              #{rank}
            </span>
          )}
          <SignalButtons
            variant="thumbs"
            current={signal}
            onSignal={(a) => (a === "like" ? onThumbUp() : onThumbDown())}
          />
        </div>
      </div>

      {/* SHORT DESCRIPTION + EXPAND (expand only when a long body exists) */}
      <p className="text-[15px] text-gray-700 mb-2 leading-relaxed">
        {short}
        {long && (
          <>
            {" "}
            <button
              onClick={onToggleDetails}
              className="text-xs text-gray-500 hover:underline"
            >
              {detailsOpen ? "Hide details" : "Show details"}
            </button>
          </>
        )}
      </p>

      {long && detailsOpen && (
        <p className="text-sm text-gray-600 mb-3">
          {long.length > LONG_PREVIEW_MAX
            ? long.slice(0, LONG_PREVIEW_MAX).trim() + "…"
            : long}
        </p>
      )}

      {/* AFFINITY (left) + COMPLETION VERBS (right) */}
      <div
        className="mt-3 flex items-center justify-between"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-4">
          <SignalButtons
            variant="save"
            current={signal}
            onSignal={() => onSave()}
            className="flex items-center gap-4 text-sm text-gray-700"
          />
          {onHeart && (
            <button
              onClick={onHeart}
              className="p-1 rounded-full border border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-500 transition"
            >
              <Heart
                size={18}
                strokeWidth={1.6}
                fill={isFavorite ? "#666666" : "none"}
              />
            </button>
          )}
        </div>

        {completionActions && (
          <div className="flex items-center gap-4 text-sm text-gray-700">
            {completionActions}
          </div>
        )}
      </div>
    </div>
  );
};

export default RekCard;
