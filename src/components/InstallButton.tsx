"use client";

import React, { useEffect, useRef, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  const listenerAttached = useRef(false);

  useEffect(() => {
    if (listenerAttached.current) return;
    listenerAttached.current = true;

    const onBeforeInstallPrompt = (e: Event) => {
      // Prevent Chrome’s mini-infobar and store the event for later trigger.
      e.preventDefault?.();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        // If available, we can clear after choice resolves
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

    // Fallback: useful instructions without being annoying.
    alert(
      "To install: open your browser menu and tap “Add to Home Screen” (iPhone) or “Install app” (Android/Chrome)."
    );
  };

  return (
    <button
      type="button"
      onClick={handleInstall}
      className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/90 hover:bg-white/10 active:scale-[0.99]"
      title="Install or save this app"
    >
      Install / Save
    </button>
  );
}
