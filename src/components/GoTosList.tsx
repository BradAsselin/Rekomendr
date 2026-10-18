"use client";

// S12 — "Your go-tos": every starred go-to, grouped Movies · TV Shows ·
// Books · Wine, newest first within each. One collapsed line on the home
// screen (the "Wine you bought" pattern, S8c); a tap opens the list. Each
// tile has "+ More like this", which starts a search anchored on that
// go-to (the page decides how: screens → its TMDb recommendation web,
// books → a search seeded on it, wine → its style and price band).

import React, { useState } from "react";
import { ChevronDown, Star } from "lucide-react";

import { titleInfoUrl } from "./MediaVerbs";
import { bottleImageUrl } from "../lib/wineShelf";
import { BAR_CATEGORY, type GoToCategory } from "../lib/goToCategory";
import type { GoTo } from "../lib/goTos";

export type GoToTarget =
  | { category: GoToCategory; name: string; tmdbKind: "movie" | "tv" | null; tmdbId: number | null }
  | { category: "wine"; name: string };

const ORDER: GoToCategory[] = ["movies", "tv", "books"];

export const MoreLikeThisButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="shrink-0 rounded-lg px-2 py-1 text-[13px] font-medium text-[#2D5AB5] hover:bg-[#2D5AB5]/10"
  >
    + More like this
  </button>
);

const GoTosList: React.FC<{
  goTos: GoTo[];
  wine: { name: string } | null;
  onMore: (t: GoToTarget) => void;
}> = ({ goTos, wine, onMore }) => {
  const [open, setOpen] = useState(false);
  const count = goTos.length + (wine ? 1 : 0);
  if (count === 0) return null;

  const row = (key: string, name: string, href: string | undefined, target: GoToTarget) => (
    <li key={key} className="flex items-center justify-between gap-2 py-2 text-[14px]">
      <span className="flex min-w-0 items-center gap-1.5">
        <Star size={14} className="shrink-0 fill-amber-400 text-amber-500" aria-hidden />
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="truncate text-gray-900 hover:underline">
            {name}
          </a>
        ) : (
          <span className="truncate text-gray-900">{name}</span>
        )}
      </span>
      <MoreLikeThisButton onClick={() => onMore(target)} />
    </li>
  );

  return (
    <div className="w-full rounded-2xl border border-gray-300 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-[15px] text-gray-900"
      >
        <span>
          Your go-tos <span className="text-gray-500">({count})</span>
        </span>
        <ChevronDown size={18} className={`text-gray-500 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-gray-100 px-4 pb-1">
          {ORDER.map((c) => {
            const list = goTos.filter((g) => g.category === c);
            if (!list.length) return null;
            return (
              <div key={c} className="pt-2">
                <div className="text-[12px] font-medium uppercase tracking-wide text-gray-500">{BAR_CATEGORY[c]}</div>
                <ul className="divide-y divide-gray-100">
                  {list.map((g) =>
                    row(`${c}|${g.name}`, g.name, c === "books" ? undefined : titleInfoUrl(g.name), {
                      category: c,
                      name: g.name,
                      tmdbKind: g.tmdbKind,
                      tmdbId: g.tmdbId,
                    })
                  )}
                </ul>
              </div>
            );
          })}
          {wine && (
            <div className="pt-2">
              <div className="text-[12px] font-medium uppercase tracking-wide text-gray-500">Wine</div>
              <ul>{row(`wine|${wine.name}`, wine.name, bottleImageUrl(wine.name), { category: "wine", name: wine.name })}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GoTosList;
