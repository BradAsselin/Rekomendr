"use client";

import React, { useEffect, useRef, useState } from "react";
import { Share2 } from "lucide-react";
import { shareOrCopy } from "../lib/shareLink";

const SHARE_URL = "https://rekomendr.ai";
const SHARE_TEXT =
  "Check out Rekomendr — taste-first recommendations for movies, TV, books, and wine.";

export default function ShareButton() {
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const showToast = (message: string, ms = 2000) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), ms);
  };

  // The cascade lives in src/lib/shareLink.ts (shared with the anchor's
  // Share since Session 2); the outcomes map to the same toasts as before.
  const handleShare = async () => {
    const outcome = await shareOrCopy({
      title: "Rekomendr",
      text: SHARE_TEXT,
      url: SHARE_URL,
    });
    // Native sheet: canceled or refused is ignored, exactly as before.
    if (outcome === "copied") showToast("Link copied!");
    else if (outcome === "manual") showToast(SHARE_URL, 4000);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleShare}
        className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/90 hover:bg-white/10 active:scale-[0.99]"
        title="Share Rekomendr with a friend"
      >
        <Share2 size={13} aria-hidden="true" />
        Share
      </button>

      {toast && (
        <div className="absolute right-0 top-full mt-2 z-50 whitespace-nowrap rounded-xl border border-white/15 bg-[#0f1e30] px-3 py-1.5 text-xs text-white/80 shadow-2xl select-all">
          {toast}
        </div>
      )}
    </div>
  );
}
