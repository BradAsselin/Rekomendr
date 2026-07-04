"use client";

import React from "react";
import { Heart } from "lucide-react";

import { useSwipeToAction } from "../lib/useSwipeToAction";
import SignalButtons from "./SignalButtons";

// One shared presentational rek card — the single skeleton both lanes render
// onto (snap-origin and search-origin). Four zones:
//   1. Top row: optional genre/category line, then title (+ year) left,
//      optional #rank + thumbs right.
//   2. Description: `short`, with a "Show details" expander when `long`
//      exists (search cards arrive with it) or when the parent marks the card
//      `expandable` and lazy-loads `long` on first expand (snap anchor).
//   3. Bottom-left (affinity): Save, plus heart/favorite when the lane
//      supports it (search only for now).
//   4. Bottom-right (completion verb): whatever the parent passes — search
//      sends "+ More like this" + "Trailer", snap food-uses sends
//      "View recipe ›".
// NO signal logic lives here. Parents own handlers and pipelines — both lanes
// share the gesture grammar (thumbs-up marks in place + toggles, thumbs-down
// dismisses + backfills, Save marks) but keep their own write paths:
// RekSnapResults → recordSnapSignal/reksnap_signals, ResultsV4 → userPrefs.

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
  // Presence of `long` enables the "Show details" affordance (search cards
  // arrive with long preloaded).
  long?: string;
  // Lazy lane: renders the "Show details" affordance even when `long` hasn't
  // arrived yet (snap anchor fetches its long tier on first expand).
  expandable?: boolean;
  // While the parent is fetching `long`, the expanded area shows the same
  // pulse treatment as RekSkeletonCard.
  detailsLoading?: boolean;
  // Details expansion is controlled by the parent so lanes can keep their
  // existing semantics (ResultsV4 allows one open card at a time).
  detailsOpen?: boolean;
  onToggleDetails?: () => void;
  // Highlight state, split so a card can be thumbed AND saved at once:
  // thumbs are one-active-within-thumbs, Save is independent.
  thumbSignal?: "like" | "dislike" | null;
  saved?: boolean;
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
  // Touch-only swipe gestures: left = onThumbDown, right = onSave — the
  // same handlers the buttons call, no new signal paths. Explicit opt-in
  // per card; the anchor never gets it (it never dismisses).
  swipeable?: boolean;
  // Whether a committed right-swipe flings the card off (search: Save
  // dismisses + backfills) or springs back in place (snap: Save marks).
  swipeRightExits?: boolean;
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
  expandable,
  detailsLoading,
  detailsOpen,
  onToggleDetails,
  thumbSignal,
  saved,
  onThumbUp,
  onThumbDown,
  onSave,
  onHeart,
  isFavorite,
  completionActions,
  accent,
  swipeable,
  swipeRightExits,
  className,
  style,
}) => {
  const titleText = year != null ? `${title} (${year})` : title;

  const swipeHandlers = useSwipeToAction({
    enabled: !!swipeable,
    onSwipeLeft: onThumbDown,
    onSwipeRight: onSave,
    rightExits: !!swipeRightExits,
  });

  return (
    <div
      {...(swipeable ? swipeHandlers : {})}
      className={[
        "rounded-2xl",
        // pan-y keeps vertical scroll native while the hook owns
        // horizontal gestures (see useSwipeToAction).
        swipeable ? "touch-pan-y" : "",
        // Accent = frame, not fill: white interior like every card (text keeps
        // full contrast), emphasis carried by one uniform deep-navy 3px frame,
        // one step more elevation and padding.
        accent
          ? "p-5 bg-white border-[3px] border-[#1E3A8A] shadow-lg"
          : "p-4 bg-white border border-gray-300 shadow-sm",
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
            className={`font-semibold ${accent ? "text-lg" : "text-[17px]"} hover:underline`}
          >
            {titleText}
          </a>
        ) : (
          <span className={`font-semibold ${accent ? "text-lg" : "text-[17px]"}`}>
            {titleText}
          </span>
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
            current={thumbSignal ?? undefined}
            onSignal={(a) => (a === "like" ? onThumbUp() : onThumbDown())}
          />
        </div>
      </div>

      {/* SHORT DESCRIPTION + EXPAND (expand when a long body exists, or when
          the parent lazy-loads one on first expand) */}
      <p
        className={`${accent ? "text-base text-gray-800" : "text-[15px] text-gray-700"} mb-2 leading-relaxed`}
      >
        {short}
        {(long || expandable) && (
          <>
            {" "}
            <button
              onClick={onToggleDetails}
              className={`text-xs ${accent ? "text-gray-600" : "text-gray-500"} hover:underline`}
            >
              {detailsOpen ? "Hide details" : "Show details"}
            </button>
          </>
        )}
      </p>

      {/* Same pulse-line treatment as RekSkeletonCard — the app's one wait
          state for AI generation moments. */}
      {detailsOpen && detailsLoading && (
        <div className="mb-3 animate-pulse">
          <div
            className={`h-3 ${accent ? "bg-blue-200" : "bg-gray-100"} rounded w-full mb-2`}
          />
          <div
            className={`h-3 ${accent ? "bg-blue-200" : "bg-gray-100"} rounded w-3/4`}
          />
        </div>
      )}

      {/* Long tier matches the short's treatment — the payoff never carries
          less weight than the teaser. */}
      {long && detailsOpen && !detailsLoading && (
        <p
          className={`${accent ? "text-base text-gray-800" : "text-[15px] text-gray-700"} leading-relaxed mb-3`}
        >
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
            current={saved ? "save" : undefined}
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
