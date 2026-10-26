"use client";

// S24b — the top bar's ⋯ menu (docs/s22-compare-to-plan.md). What used to
// sit loose in the chrome lives here: Share (S2's app share, same toasts),
// Sign in / Sign out (AuthControl), Show posters / Hide posters (S17b's
// switch, which was the Saved page's footer), and the TMDb notice (the
// layout passes it in, so its source stays in app/layout.tsx).
// No new words: every label is an existing or approved one.

import React, { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, ImageOff, MoreHorizontal, Share2 } from "lucide-react";

import AuthControl, { useAuthEmail } from "./AuthControl";
import { shareOrCopy } from "../lib/shareLink";
import { setPostersHidden, usePostersOn } from "../lib/posterPref";

const SHARE_URL = "https://rekomendr.ai";
const SHARE_TEXT =
  "Check out Rekomendr — taste-first recommendations for movies, TV, books, and wine.";

const ITEM = "flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] text-gray-900 active:bg-gray-50";

export default function MoreMenu({ attribution }: { attribution: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const userEmail = useAuthEmail();
  const postersOn = usePostersOn();

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // A tap outside closes it (touchstart too, so a stray tap on mobile
  // doesn't wait for the synthesized mouse event); Escape closes.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const showToast = (message: string, ms = 2000) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), ms);
  };

  const handleShare = async () => {
    setOpen(false);
    const outcome = await shareOrCopy({ title: "Rekomendr", text: SHARE_TEXT, url: SHARE_URL });
    // Native sheet: canceled or refused is ignored, exactly as before.
    if (outcome === "copied") showToast("Link copied!");
    else if (outcome === "manual") showToast(SHARE_URL, 4000);
  };

  return (
    <div ref={rootRef} className="relative">
      {/* S25 — the screen-reader name is Brad's: "More options". */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="More options"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="more-menu"
        className="flex h-10 w-10 items-center justify-center rounded-full text-white/90 hover:bg-white/10"
      >
        <MoreHorizontal size={22} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          data-testid="more-panel"
          className="absolute right-0 top-full z-50 mt-1 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-gray-200 bg-white text-left shadow-xl"
        >
          <button type="button" role="menuitem" onClick={handleShare} data-testid="menu-share" className={ITEM}>
            <Share2 size={18} className="text-gray-500" aria-hidden="true" />
            Share
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setPostersHidden(postersOn);
              setOpen(false);
            }}
            data-testid="menu-posters"
            className={ITEM}
          >
            {postersOn ? (
              <ImageOff size={18} className="text-gray-500" aria-hidden="true" />
            ) : (
              <ImageIcon size={18} className="text-gray-500" aria-hidden="true" />
            )}
            {postersOn ? "Hide posters" : "Show posters"}
          </button>
          <div className="border-t border-gray-100">
            <AuthControl userEmail={userEmail} onDone={() => setOpen(false)} />
          </div>
          <div className="border-t border-gray-100 px-4 py-3">{attribution}</div>
        </div>
      )}

      {toast && (
        <div className="absolute right-0 top-full z-50 mt-2 whitespace-nowrap rounded-xl border border-white/15 bg-[#0f1e30] px-3 py-1.5 text-xs text-white/80 shadow-2xl select-all">
          {toast}
        </div>
      )}
    </div>
  );
}
