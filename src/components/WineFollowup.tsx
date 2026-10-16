"use client";

// S8c — closing the loop (docs/s8-wine-shelf-plan.md). On the first open a
// day or more after a haul, ONE quiet question about ONE bottle: "How was
// the Cannonball? 👍 / 👎 / ⭐ new go-to". Never a form, skippable, never
// asked twice — the server marks it asked the moment it is on screen, and
// the next bottle waits for the next open. The answer feeds the existing
// signals: 👍/👎 write the like/dislike every wine card writes (a 👎 keeps
// that producer out of future reks), ⭐ makes it the go-to.
//
// Plain voice: this is the app asking, not Reks Ray recommending.

import React, { useEffect, useState } from "react";
import { Star, ThumbsDown, ThumbsUp, X } from "lucide-react";

import { recordSnapSignal } from "../lib/reksnapSignals";
import { answerFollowup, followupShown, setWineFavorite } from "../lib/wineVisit";
import { shortWineName } from "../lib/wineShelf";

type Props = { item: { id: string; name: string } };

const WineFollowup: React.FC<Props> = ({ item }) => {
  const [done, setDone] = useState<string | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    void followupShown(item.id);
  }, [item.id]);

  if (gone) return null;

  const answer = (a: "like" | "dislike" | "favorite" | "skipped") => {
    void answerFollowup(item.id, a);
    if (a === "like" || a === "dislike") {
      void recordSnapSignal({ itemName: item.name, itemCategory: "wine", action: a });
    }
    if (a === "favorite") {
      void setWineFavorite({ name: item.name });
      void recordSnapSignal({ itemName: item.name, itemCategory: "wine", action: "like" });
    }
    if (a === "skipped") {
      setGone(true);
      return;
    }
    setDone(a === "favorite" ? "Your new go-to. ⭐" : a === "like" ? "Noted. 👍" : "Noted — it won't come back. 👎");
    setTimeout(() => setGone(true), 2500);
  };

  const btn =
    "flex items-center gap-1 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-[14px] text-gray-800 transition hover:border-[#2D5AB5] active:scale-95";

  return (
    <div className="w-full rounded-2xl border border-gray-300 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[15px] text-gray-900">
          {done ?? <>How was the {shortWineName(item.name)}?</>}
        </div>
        {!done && (
          <button
            type="button"
            aria-label="Skip"
            onClick={() => answer("skipped")}
            className="-mr-1 -mt-1 p-1 text-gray-400 hover:text-gray-700"
          >
            <X size={16} />
          </button>
        )}
      </div>
      {!done && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={() => answer("like")} aria-label="Liked it">
            <ThumbsUp size={16} />
          </button>
          <button type="button" className={btn} onClick={() => answer("dislike")} aria-label="Didn't like it">
            <ThumbsDown size={16} />
          </button>
          <button type="button" className={btn} onClick={() => answer("favorite")}>
            <Star size={16} className="text-amber-500" /> new go-to
          </button>
        </div>
      )}
    </div>
  );
};

export default WineFollowup;
