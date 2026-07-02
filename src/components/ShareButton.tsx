"use client";

import React, { useEffect, useRef, useState } from "react";
import { Share2 } from "lucide-react";

const SHARE_URL = "https://rekomendr.ai";
const SHARE_TEXT =
  "Check out Rekomendr — taste-first recommendations for movies, TV, books, and wine.";

// Last-resort copy for insecure contexts (navigator.clipboard undefined):
// hidden textarea + execCommand('copy'). Deprecated but still functional.
function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length); // iOS needs an explicit range
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

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

  const handleShare = async () => {
    // TODO: remove diagnostic logging once share is verified on device
    console.log("[ShareButton] tap. share:", typeof navigator.share, "clipboard:", typeof navigator.clipboard);

    // 1) Native share sheet (requires secure context on iOS)
    if (typeof navigator.share === "function") {
      console.log("[ShareButton] path: navigator.share");
      try {
        await navigator.share({
          title: "Rekomendr",
          text: SHARE_TEXT,
          url: SHARE_URL,
        });
      } catch {
        // User canceled the share sheet — ignore
      }
      return;
    }

    // 2) Async clipboard (also requires secure context)
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      console.log("[ShareButton] path: navigator.clipboard");
      try {
        await navigator.clipboard.writeText(SHARE_URL);
        showToast("Link copied!");
        return;
      } catch {
        // fall through to legacy copy
      }
    }

    // 3) execCommand textarea trick — works in insecure contexts
    if (legacyCopy(SHARE_URL)) {
      console.log("[ShareButton] path: legacyCopy");
      showToast("Link copied!");
      return;
    }

    // 4) Nothing can copy — show the URL so the user can copy it manually
    console.log("[ShareButton] path: manual fallback");
    showToast(SHARE_URL, 4000);
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
