"use client";

// S4b — add-to-home-screen, offered right after a Save and never on page
// open (docs/s4-s5-build-plan.md). Two shapes, one decision each:
//   * iPhone/iPad Safari: a dismissible coach sheet with the three taps —
//     Share → Add to Home Screen → Add — and an arrow toward Safari's
//     toolbar. On newer iOS the Share button can sit behind "⋯", so the
//     first step says so. (Precedent: the coach-mark pattern Apple's own
//     web apps and PWA guides use, since iOS has no install API.)
//   * Android/Chrome: the real install prompt (beforeinstallprompt), behind
//     one tap on Install.
// Never when already running from the home screen; a "Not now" keeps it
// away for a week (src/lib/installPrompt.ts).

import React, { useEffect, useState } from "react";
import {
  heldInstallPrompt,
  isIOSSafari,
  isStandalone,
  onInstallPromptChange,
  runInstallPrompt,
  snoozeInstallOffer,
} from "../lib/installPrompt";

type Props = { open: boolean; onClose: () => void };

// Safari's Share glyph (square with an up arrow), drawn inline.
const ShareGlyph = () => (
  <svg aria-hidden="true" width="18" height="20" viewBox="0 0 18 20" className="inline-block -mt-1 mx-0.5">
    <path d="M9 1v11M5 5l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6 8H3v11h12V8h-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
);

export default function InstallCoach({ open, onClose }: Props) {
  const [variant, setVariant] = useState<"ios" | "android" | null>(null);

  useEffect(() => {
    if (!open) return;
    const decide = () => {
      if (isStandalone()) return setVariant(null);
      if (isIOSSafari()) return setVariant("ios");
      if (heldInstallPrompt()) return setVariant("android");
      setVariant(null);
    };
    decide();
    return onInstallPromptChange(decide);
  }, [open]);

  if (!open || !variant) return null;

  const dismiss = () => {
    snoozeInstallOffer();
    onClose();
  };

  if (variant === "android") {
    return (
      <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[max(16px,env(safe-area-inset-bottom))]" role="dialog" aria-label="Add Rekomendr to your home screen">
        <div className="mx-auto max-w-xl rounded-2xl bg-white p-4 shadow-2xl border border-gray-200">
          <div className="text-[15px] font-semibold text-gray-900">Saved. Add Rekomendr to your home screen?</div>
          <div className="mt-3 flex justify-end gap-3 text-sm">
            <button type="button" onClick={dismiss} className="px-3 py-2 text-gray-600 hover:underline">
              Not now
            </button>
            <button
              type="button"
              onClick={async () => {
                const outcome = await runInstallPrompt();
                if (outcome === "dismissed") snoozeInstallOffer();
                onClose();
              }}
              className="rounded-xl bg-[#1E3A8A] px-4 py-2 font-medium text-white"
            >
              Install
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" role="dialog" aria-label="Add Rekomendr to your Home Screen" onClick={dismiss}>
      <div
        className="mx-4 mb-2 rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="text-[17px] font-semibold text-gray-900">Saved. Keep Rekomendr on your Home Screen</div>
          <button type="button" onClick={dismiss} aria-label="Close" className="-mr-1 -mt-1 px-2 text-2xl leading-none text-gray-400">
            ×
          </button>
        </div>
        <ol className="mt-3 space-y-2 text-[15px] text-gray-900">
          <li>
            1. Tap Share <ShareGlyph /> in Safari’s toolbar
            <div className="text-[13px] text-gray-500">On newer iPhones, tap ⋯ first.</div>
          </li>
          <li>2. Tap <span className="font-semibold">Add to Home Screen</span></li>
          <li>3. Tap <span className="font-semibold">Add</span></li>
        </ol>
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={dismiss} className="px-3 py-2 text-sm text-gray-600 hover:underline">
            Not now
          </button>
        </div>
      </div>
      {/* The arrow points down at Safari's bottom toolbar, where Share (or
          ⋯) lives on an iPhone. */}
      <div aria-hidden="true" className="flex justify-center pb-[max(6px,env(safe-area-inset-bottom))] text-white text-4xl animate-bounce">
        ↓
      </div>
    </div>
  );
}
