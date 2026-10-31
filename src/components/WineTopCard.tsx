"use client";

// S26b — the top card of a wine shelf snap (Brad's S25 brief, boards W1 and
// W3). Two states, one frame:
//
//   "This shelf · most popular" — the bottle the read anchored on: name,
//     price, one short line about the shelf, the taste bars (this wine's
//     blue dot only). No star, save or thumbs: it's the shelf's summary,
//     not a pick to judge.
//   "Comparing to · from this shelf" — the bottle the person picked in
//     Compare to replaces it: amber outline (the reference ring's amber),
//     its name, price and dot, and × to stop comparing.

import React from "react";
import { X } from "lucide-react";

import WineFacts from "./WineFacts";
import type { WineRekInfo } from "../lib/wineShelf";

type Info = Pick<WineRekInfo, "price" | "priceSource" | "talkerPoints" | "talkerSource" | "staffPick" | "dry" | "body">;

const WineTopCard: React.FC<{
  label: string;
  name: string;
  titleHref?: string;
  short?: string | null;
  info: Info | null;
  // Present = the "Comparing to" state: amber frame and a ×.
  onClear?: () => void;
  clearLabel?: string;
}> = ({ label, name, titleHref, short, info, onClear, clearLabel }) => (
  <div
    data-testid={onClear ? "wine-compare-card" : "shelf-anchor-card"}
    className={[
      "relative rounded-2xl bg-white p-4 shadow-lg",
      onClear ? "border-[3px] border-amber-500" : "border-[3px] border-[#1E3A8A]",
    ].join(" ")}
  >
    <div className={`text-[12px] font-semibold uppercase tracking-wide ${onClear ? "text-amber-700" : "text-[#1E3A8A]"}`}>{label}</div>
    {onClear && (
      <button
        type="button"
        onClick={onClear}
        aria-label={clearLabel}
        data-testid="wine-compare-clear"
        className="absolute right-1.5 top-1.5 flex h-11 w-11 items-center justify-center rounded-full text-gray-500 active:scale-90"
      >
        <X size={20} strokeWidth={2} aria-hidden="true" />
      </button>
    )}
    <div className={`mt-1 text-[17px] font-semibold leading-snug text-gray-900 ${onClear ? "pr-8" : ""}`}>
      {titleHref ? (
        <a href={titleHref} target="_blank" rel="noopener noreferrer" className="hover:underline">
          {name}
        </a>
      ) : (
        name
      )}
    </div>
    {short && <p className="mt-1 text-[15px] leading-relaxed text-gray-900">{short}</p>}
    {info && (
      <div className="mt-1.5">
        <WineFacts info={info} favorite={null} />
      </div>
    )}
  </div>
);

export default WineTopCard;

// "One short line about the shelf": the first sentence of the anchor's own
// text (the shelf summary today, already pairing-cut), never more.
export function firstSentence(text: string | null | undefined): string {
  const t = (text ?? "").trim();
  if (!t) return "";
  const m = t.match(/^.+?[.!?](?=\s+["'“‘(]?[A-Z]|$)/);
  return (m ? m[0] : t).trim();
}
