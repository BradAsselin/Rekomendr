"use client";

// S16 — the "Watched" control (bottom-left of every Movies/TV/Books card
// and the anchor) and its toast. Approved wording only: "Watched",
// "Watched · Undo". Unmarked = an outline check; marked = a filled check
// plus the word, at full contrast while the card around it dims.

import React from "react";
import { CircleCheck } from "lucide-react";
import type { WatchedItem } from "../lib/useWatchedMarks";

export const WatchedButton: React.FC<{ on: boolean; onToggle: () => void }> = ({ on, onToggle }) => (
  <button
    type="button"
    onClick={(e) => {
      // Inside a trail row the card body is tap-to-collapse.
      e.stopPropagation();
      onToggle();
    }}
    aria-pressed={on}
    aria-label="Watched"
    data-testid="watched"
    // The padding widens the tap target without growing the row.
    className="-my-1.5 -ml-1.5 py-1.5 pl-1.5 pr-2 flex items-center gap-1 text-sm"
  >
    {on ? (
      <CircleCheck size={18} strokeWidth={2} fill="#1E3A8A" color="#ffffff" aria-hidden="true" />
    ) : (
      <CircleCheck size={18} strokeWidth={1.7} className="text-gray-600" aria-hidden="true" />
    )}
    {on && <span className="font-medium text-[#1E3A8A]">Watched</span>}
  </button>
);

export const WatchedToast: React.FC<{
  item: WatchedItem | null;
  onUndo: (item: WatchedItem) => void;
}> = ({ item, onUndo }) =>
  item ? (
    <div
      role="status"
      aria-live="polite"
      data-testid="watched-toast"
      className="fixed left-1/2 -translate-x-1/2 z-50 rounded-full bg-gray-900 text-white text-sm shadow-lg px-4 py-2 flex items-center gap-1"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
    >
      <span>Watched ·</span>
      <button
        type="button"
        onClick={() => onUndo(item)}
        className="font-semibold underline underline-offset-2 py-1 -my-1 px-1"
      >
        Undo
      </button>
    </div>
  ) : null;

// S17 — the search lane's one toast, for every undoable act on a D2 card.
// Approved wording only: "Not for me · Undo", "Saved · Undo",
// "Watched · Undo", "Posters hidden · Undo". The newest replaces the last.
export type UndoToastLabel = "Not for me" | "Saved" | "Watched" | "Posters hidden";

export const UndoToast: React.FC<{ label: UndoToastLabel | null; onUndo: () => void }> = ({ label, onUndo }) =>
  label ? (
    <div
      role="status"
      aria-live="polite"
      data-testid="undo-toast"
      className="fixed left-1/2 -translate-x-1/2 z-50 rounded-full bg-gray-900 text-white text-sm shadow-lg px-4 py-2 flex items-center gap-1 whitespace-nowrap"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
    >
      <span>{label} ·</span>
      <button
        type="button"
        onClick={onUndo}
        className="font-semibold underline underline-offset-2 py-1 -my-1 px-1"
      >
        Undo
      </button>
    </div>
  ) : null;
