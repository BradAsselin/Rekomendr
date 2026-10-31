"use client";

// S8b — what a wine card knows beyond its words (docs/s8-wine-shelf-plan.md):
// the price (read off this shelf, or "about" when estimated), a shelf
// talker or staff pick read off the photo, and where it sits on two taste
// bars — with the person's starred go-to marked on the same bars.
//
// The bars are our own drawing, not any app's: a hairline track, a solid
// dot for this wine, a hollow ring for the go-to, two words at the ends,
// and "approx." said once. Five positions only; a finer scale would claim
// a precision the model doesn't have.

import React from "react";

import { formatPrice, shortWineName, type WineRekInfo } from "../lib/wineShelf";

type BarProps = {
  left: string;
  right: string;
  value: number | null;
  fav: number | null;
  favLabel?: string;
};

const pos = (v: number) => `${((v - 1) / 4) * 100}%`;

const TasteBar: React.FC<BarProps> = ({ left, right, value, fav, favLabel }) => (
  <div className="flex items-center gap-2 text-[12px] text-gray-600">
    <span className="w-9 shrink-0">{left}</span>
    <div className="relative h-4 flex-1" aria-hidden>
      <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-gray-300" />
      {fav != null && (
        <div
          data-testid="taste-ring"
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-500 bg-white"
          style={{ left: pos(fav) }}
          title={favLabel}
        />
      )}
      {value != null && (
        <div
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1E3A8A]"
          style={{ left: pos(value) }}
        />
      )}
    </div>
    <span className="w-9 shrink-0 text-right">{right}</span>
  </div>
);

type Props = {
  info: Pick<
    WineRekInfo,
    "price" | "priceSource" | "talkerPoints" | "talkerSource" | "staffPick" | "dry" | "body"
  > & { onShelf?: boolean; offShelf?: boolean };
  favorite?: { name: string; dry?: number | null; body?: number | null } | null;
  // The favorite card itself shows no ring (it would sit on its own dot).
  isFavorite?: boolean;
  // S26b — the ring is the Compare to reference; "your" only when that
  // reference is the starred go-to (the movie rule). Default: your.
  refIsGoTo?: boolean;
};

const WineFacts: React.FC<Props> = ({ info, favorite, isFavorite, refIsGoTo = true }) => {
  const price = formatPrice(info.price, info.priceSource);
  const priceLine = price
    ? info.priceSource === "tag"
      ? `${price} on this shelf`
      : info.offShelf
        ? `${price} · not on this shelf`
        : price
    : info.offShelf
      ? "Not on this shelf"
      : null;
  const talker =
    info.talkerPoints != null
      ? `${info.talkerPoints} pts${info.talkerSource ? `, ${info.talkerSource}` : ""} (on shelf)`
      : null;
  const showBars = info.dry != null || info.body != null;
  const favDry = !isFavorite && favorite?.dry != null ? favorite.dry : null;
  const favBody = !isFavorite && favorite?.body != null ? favorite.body : null;
  const favShort = favorite ? shortWineName(favorite.name) : "";
  const favLabel = favorite ? (refIsGoTo ? `Your ${favShort}` : favShort) : undefined;

  if (!priceLine && !talker && !info.staffPick && !showBars) return null;

  return (
    <div className="mb-1 space-y-1">
      {(priceLine || talker || info.staffPick) && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[14px] text-gray-900">
          {priceLine && <span className="font-medium">{priceLine}</span>}
          {talker && <span>{talker}</span>}
          {info.staffPick && <span>Staff pick at this store</span>}
        </div>
      )}
      {showBars && (
        <div className="pt-0.5">
          <TasteBar left="Dry" right="Sweet" value={info.dry} fav={favDry} favLabel={favLabel} />
          <TasteBar left="Light" right="Bold" value={info.body} fav={favBody} favLabel={favLabel} />
          <div className="mt-0.5 text-[11px] text-gray-500">
            approx.
            {(favDry != null || favBody != null) && favorite && (
              <>
                {" · "}
                <span className="inline-block h-2 w-2 rounded-full border-2 border-amber-500 align-middle" />{" "}
                {refIsGoTo ? `your ${favShort}` : favShort}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default WineFacts;
