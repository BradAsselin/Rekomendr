"use client";

import React, { cloneElement, isValidElement } from "react";

import { useSwipeToAction } from "../lib/useSwipeToAction";
import SignalButtons from "./SignalButtons";

// One shared presentational rek card — the single skeleton both lanes render
// onto (snap-origin and search-origin). Three zones:
//   1. Top row: optional genre/category line, then title (+ year) left —
//      the title doubles as the details toggle — and the verdict cluster
//      right: optional #rank, Save (icon-only bookmark), then thumbs. Save
//      is the single keep verb on every card, both lanes.
//   2. Description: `short`, with a "Show details" expander when `long`
//      exists (search cards arrive with it) or when the parent marks the card
//      `expandable` and lazy-loads `long` on first expand (snap anchor).
//   3. Bottom verb row, three FIXED zones: LEFT = the ▶ video verb
//      (Show me / Trailer), MIDDLE = the category completion verb
//      (View recipe / Watch / Buy), RIGHT = "+ More like this" — search
//      MLT or the snap chain/re-roll; health/medical cards get no verbs.
// NO signal logic lives here. Parents own handlers and pipelines — both lanes
// share the gesture grammar (thumbs-up marks in place + toggles, thumbs-down
// dismisses + backfills, Save marks) but keep their own write paths:
// RekSnapResults → recordSnapSignal/reksnap_signals, ResultsV4 → userPrefs.

type Props = {
  title: string;
  // Appended as "(year)" when present (search cards have it, snap doesn't).
  year?: number;
  // Rendered above the title row (search's DescriptorLine). Omit for snap.
  genreLine?: React.ReactNode;
  // S1 — the freshness slot's quiet memory line ("You liked this in
  // July."), rendered directly under the title. Presentational only: no
  // tap target, no icon, no colour — the card must read as an answer,
  // never as a badge (charter §2.5). Unset on every other card.
  markerLine?: string;
  // S12b — the same quiet line, with a tap target in it (the touchstone's
  // "A classic to steer by ☆"). Unset everywhere else.
  markerSlot?: React.ReactNode;
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
  // Media titles link out (Google info page, new tab) instead of toggling
  // details — expand stays reachable via the "Show details" text button,
  // which renders independently of the title. Unset = the original
  // title-as-toggle (or plain span) behavior, untouched.
  titleHref?: string;
  // S3.0 — an always-visible line under the description (the media
  // anchor's "where to watch" answer). Rendered between the read moment
  // and the verb row; unset on every other card.
  infoSlot?: React.ReactNode;
  // Highlight state, split so a card can be thumbed AND saved at once:
  // thumbs are one-active-within-thumbs, Save is independent.
  thumbSignal?: "like" | "dislike" | null;
  saved?: boolean;
  onThumbUp: () => void;
  onThumbDown: () => void;
  onSave: () => void;
  // The three fixed verb zones (see header). Zones hold their position even
  // when neighbors are empty; the row renders only if at least one is set.
  verbLeft?: React.ReactNode;
  verbMiddle?: React.ReactNode;
  verbRight?: React.ReactNode;
  // S1 — an action that exists ONLY while the card is expanded. Kept out
  // of the three verb zones on purpose: those are LEFT learn / MIDDLE
  // complete / RIGHT continue (charter §2.5). (S16 moved "Watched it" out
  // of here to `watchedSlot`; nothing uses this slot today.)
  detailAction?: React.ReactNode;
  // S16 — "Watched" (Movies/TV/Books): bottom-left, always visible. A
  // verdict, so it stays out of the three verb zones; it shares the
  // bottom row with Share (Share right) so the card grows no new row.
  // With no Share on the card it gets that row to itself.
  watchedSlot?: React.ReactNode;
  // S16 — a watched card dims slightly (still readable); the Watched
  // control itself stays at full contrast.
  dimmed?: boolean;
  // Emphasized chrome for the snap detected-item card.
  accent?: boolean;
  // Touch-only swipe: a committed swipe in EITHER direction fires
  // onThumbDown — the same dismiss the button calls, no new signal
  // paths. Explicit opt-in per card; the anchor never gets it (it never
  // dismisses). Marked cards (thumbSignal "like" or saved) don't arm,
  // so they can't be flung by accident.
  swipeable?: boolean;
  // Extra root classes/styles — ResultsV4 threads its stagger animation here.
  className?: string;
  style?: React.CSSProperties;
  // S6 — the card's Share row (ShareRow), last thing on the card, under
  // the verbs. Absent when the rek can't be shared.
  shareSlot?: React.ReactNode;
  // S8b — wine cards: a short comparison that LEADS the description ("vs.
  // your Caymus Bonanza: drier, less vanilla, similar body"), and the star
  // (the go-to mark), first in the verdict cluster. Both unset elsewhere.
  shortLead?: string;
  starSlot?: React.ReactNode;
};

const RekCard: React.FC<Props> = ({
  title,
  year,
  genreLine,
  markerLine,
  markerSlot,
  rank,
  short,
  long,
  expandable,
  detailsLoading,
  detailsOpen,
  onToggleDetails,
  titleHref,
  infoSlot,
  thumbSignal,
  saved,
  onThumbUp,
  onThumbDown,
  onSave,
  verbLeft,
  verbMiddle,
  verbRight,
  detailAction,
  watchedSlot,
  dimmed,
  accent,
  swipeable,
  className,
  style,
  shareSlot,
  shortLead,
  starSlot,
}) => {
  const titleText = year != null ? `${title} (${year})` : title;

  const swipeHandlers = useSwipeToAction({
    // Protection rule: a liked or saved card never arms.
    enabled: !!swipeable && thumbSignal !== "like" && !saved,
    onSwipe: onThumbDown,
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
      <div className={dimmed ? "opacity-70 transition-opacity" : "transition-opacity"}>
      {genreLine}

      {/* TITLE + THUMBS — media titles link out to their Google info page
          (new tab; expand stays on "Show details" below). Otherwise the
          title is the expand toggle wherever a long tier exists (or will
          lazy-load); cards with no long tier keep a plain title. */}
      <div className="flex justify-between items-start mb-2">
        {titleHref ? (
          <a
            href={titleHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              // Inside a trail row the card body is tap-to-collapse; the
              // title handoff must not double as a collapse.
              e.stopPropagation();
            }}
            className={`font-semibold ${accent ? "text-lg" : "text-[17px]"} text-left hover:underline`}
          >
            {titleText}
          </a>
        ) : (long || expandable) && onToggleDetails ? (
          <button
            type="button"
            onClick={(e) => {
              // Inside a trail row the card body is tap-to-collapse; the
              // title toggle must not double as a collapse.
              e.stopPropagation();
              onToggleDetails();
            }}
            className={`font-semibold ${accent ? "text-lg" : "text-[17px]"} text-left hover:underline`}
          >
            {titleText}
          </button>
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
          {starSlot}
          {rank != null && (
            <span className="text-xs text-gray-600 font-medium mr-1">
              #{rank}
            </span>
          )}
          {/* Save sits left of the thumbs with widened spacing (mr-2 on top
              of the cluster gap ≈ 16px) — adjacent verdicts, never crowding
              the thumb-up. */}
          <SignalButtons
            variant="save"
            iconOnly
            current={saved ? "save" : undefined}
            onSignal={() => onSave()}
            className="mr-2"
          />
          <SignalButtons
            variant="thumbs"
            current={thumbSignal ?? undefined}
            onSignal={(a) => (a === "like" ? onThumbUp() : onThumbDown())}
          />
        </div>
      </div>

      {/* S1 — the resurfacing marker. One quiet grey line under the title,
          no chrome of its own (charter §7 call #2, marked: default). */}
      {markerLine && (
        <div className="-mt-1 mb-2 text-[13px] text-gray-600">{markerLine}</div>
      )}
      {markerSlot && (
        <div className="-mt-1 mb-2 text-[13px] text-gray-600" onClick={(e) => e.stopPropagation()}>
          {markerSlot}
        </div>
      )}

      {/* SHORT DESCRIPTION + EXPAND (expand when a long body exists, or when
          the parent lazy-loads one on first expand) */}
      <p
        className={`${accent ? "text-base" : "text-[15px]"} font-normal text-gray-900 mb-2 leading-relaxed`}
      >
        {shortLead && <span className="font-medium">{shortLead} </span>}
        {short}
        {(long || expandable) && (
          <>
            {" "}
            <button
              onClick={(e) => {
                // Inside a trail row the card body is tap-to-collapse; the
                // details toggle must not double as a collapse.
                e.stopPropagation();
                onToggleDetails?.();
              }}
              className="text-xs text-gray-600 hover:underline"
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
          className={`${accent ? "text-base" : "text-[15px]"} font-normal text-gray-900 leading-relaxed mb-3`}
        >
          {long}
        </p>
      )}

      {/* S1 — expanded-only verdict action ("Watched it"). Sits below the
          read moment and above the completion verbs, so it never competes
          with them for a zone. */}
      {detailsOpen && !detailsLoading && detailAction && (
        <div className="mb-1" onClick={(e) => e.stopPropagation()}>
          {detailAction}
        </div>
      )}

      {infoSlot}

      {/* COMPLETION VERBS — three fixed zones. A grid keeps each verb's
          position stable when neighbors are empty; the row disappears
          entirely only when all three are (health/medical: zero verbs). */}
      {(verbLeft || verbMiddle || verbRight) && (
        <div
          className="mt-3 grid grid-cols-3 items-center text-sm text-gray-800"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-start">{verbLeft}</div>
          <div className="flex justify-center">{verbMiddle}</div>
          <div className="flex justify-end">{verbRight}</div>
        </div>
      )}
      </div>

      {/* S16 — the bottom row: Watched left, Share right (ShareRow's
          `leading` slot keeps its name form and notices full width). */}
      {watchedSlot && isValidElement(shareSlot) ? (
        cloneElement(shareSlot as React.ReactElement<{ leading?: React.ReactNode }>, { leading: watchedSlot })
      ) : (
        <>
          {watchedSlot && (
            <div className="mt-2 flex items-center text-sm" onClick={(e) => e.stopPropagation()}>
              {watchedSlot}
            </div>
          )}
          {shareSlot}
        </>
      )}
    </div>
  );
};

export default RekCard;
