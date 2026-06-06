"use client";

import React, { useEffect, useRef, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSTip, setShowIOSTip] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const listenerAttached = useRef(false);

  useEffect(() => {
    // Register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    // Already running as an installed PWA — hide the button
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) {
      setIsInstalled(true);
      return;
    }

    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));

    if (listenerAttached.current) return;
    listenerAttached.current = true;

    const onPrompt = (e: Event) => {
      e.preventDefault?.();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  // Nothing to show: already installed, or not iOS and no Android prompt
  if (isInstalled || (!isIOS && !deferredPrompt)) return null;

  const handleInstall = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        try {
          await deferredPrompt.userChoice;
        } catch {
          // ignore
        }
      } finally {
        setDeferredPrompt(null);
      }
      return;
    }
    // iOS: toggle the tip
    setShowIOSTip((v) => !v);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleInstall}
        className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/90 hover:bg-white/10 active:scale-[0.99]"
        title="Add Rekomendr to your home screen"
      >
        {isIOS ? "Add to Home Screen" : "Install App"}
      </button>

      {showIOSTip && (
        <div className="absolute right-0 top-full mt-2 z-50 w-64 rounded-xl border border-white/15 bg-[#0f1e30] p-3 text-xs text-white/80 shadow-2xl">
          <p className="leading-relaxed">
            Tap the{" "}
            <span className="font-semibold text-white">Share</span>{" "}
            <span className="inline-block rotate-0">⬆</span> button at the
            bottom of Safari, then tap{" "}
            <span className="font-semibold text-white">
              Add to Home Screen
            </span>
            .
          </p>
          <button
            type="button"
            onClick={() => setShowIOSTip(false)}
            className="mt-2 text-white/40 hover:text-white/60"
          >
            Got it
          </button>
        </div>
      )}
    </div>
  );
}
