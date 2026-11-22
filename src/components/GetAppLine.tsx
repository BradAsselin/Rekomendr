"use client";

// S41 — the one quiet line after a shared card's picks (docs/2026-11-22_
// get_the_app_launch.md, item 3): the offer, "Get the app" (opens the
// sheet, or Chrome's own prompt) and ×. The page shows it only in the
// browser and only when the ask is due (src/lib/getApp.ts).
// Brad-approved wording (2026-11-22).

import React from "react";
import { X } from "lucide-react";

export const CARD_ASK_LINE = "Like it? Put Rekomendr on your home screen.";
export const GET_THE_APP = "Get the app";

export default function GetAppLine({ onGet, onClose }: { onGet: () => void; onClose: () => void }) {
  return (
    <div className="flex items-center gap-2 px-1 text-[14px] leading-snug text-gray-300 sm:text-gray-600" data-testid="card-get-app">
      <span className="min-w-0 flex-1">{CARD_ASK_LINE}</span>
      <button
        type="button"
        onClick={onGet}
        data-testid="card-get-app-go"
        className="shrink-0 rounded-full border border-[#3B6BD4] px-3 py-1.5 text-[13px] font-semibold text-blue-300 sm:text-[#1E3A8A]"
      >
        {GET_THE_APP}
      </button>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        data-testid="card-get-app-x"
        className="-mr-2 flex h-11 w-9 shrink-0 items-center justify-center text-gray-400"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
