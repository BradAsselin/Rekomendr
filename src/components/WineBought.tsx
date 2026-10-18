"use client";

// S8c — the Bought list: every bottle from a confirmed haul, newest first,
// with the date and how it went (once answered). One collapsed line on the
// home screen; a tap opens the list. Each name opens the bottle (image
// search), like every wine title.

import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

import { bottleImageUrl } from "../lib/wineShelf";
import type { BoughtItem } from "../lib/wineVisit";
import { MoreLikeThisButton } from "./GoTosList";

const MARK: Record<string, string> = { like: "👍", dislike: "👎", favorite: "⭐" };

// S12 — each bottle carries "+ More like this": reks in its style and
// price band (the page runs it as the typed-wine anchor).
const WineBought: React.FC<{ items: BoughtItem[]; onMore?: (name: string) => void }> = ({ items, onMore }) => {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <div className="w-full rounded-2xl border border-gray-300 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-[15px] text-gray-900"
      >
        <span>
          Wine you bought <span className="text-gray-500">({items.length})</span>
        </span>
        <ChevronDown size={18} className={`text-gray-500 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="divide-y divide-gray-100 border-t border-gray-100 px-4">
          {items.map((it) => (
            <li key={it.id} className="flex items-center justify-between gap-2 py-2 text-[14px]">
              <a
                href={bottleImageUrl(it.name)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-900 hover:underline"
              >
                {it.name}
              </a>
              <span className="flex shrink-0 items-center gap-1 text-gray-500">
                {it.followup && MARK[it.followup] ? `${MARK[it.followup]} ` : ""}
                {new Date(it.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                {onMore && <MoreLikeThisButton onClick={() => onMore(it.name)} />}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default WineBought;
