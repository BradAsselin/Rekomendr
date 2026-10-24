"use client";

// S17 — the D2 card's poster (docs/s17-mood-first-plan.md): TMDb's w185
// image (185 px source) shown at 76×114, rounded, lazy and async-decoded,
// so the card's text paints first and the poster fills in after. No poster
// → a neutral block of the same size, so nothing jumps. The × in its
// corner hides posters everywhere (the page's toast offers the Undo).
// Only rendered while posters are on — when they're off, no <img> exists.

import React, { useState } from "react";
import { X } from "lucide-react";

const PosterThumb: React.FC<{ path: string | null | undefined; onHide: () => void }> = ({ path, onHide }) => {
  const [failed, setFailed] = useState(false);
  const src = path && !failed ? `https://image.tmdb.org/t/p/w185${path}` : null;
  return (
    <div className="relative h-[114px] w-[76px] shrink-0">
      <div className="h-full w-full overflow-hidden rounded-lg bg-gray-200">
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- TMDb's CDN already serves the 185 px size; next/image would add a hop
        <img
          src={src}
          alt=""
          width={76}
          height={114}
          loading="lazy"
          decoding="async"
          data-poster
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      )}
      </div>
      {/* 44px touch target (Apple HIG), drawn as a small dot in the corner. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onHide();
        }}
        aria-label="Hide posters"
        data-testid="poster-hide"
        className="absolute -right-2.5 -top-2.5 flex h-11 w-11 items-start justify-end p-3"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white">
          <X size={12} strokeWidth={2.5} />
        </span>
      </button>
    </div>
  );
};

export default PosterThumb;
