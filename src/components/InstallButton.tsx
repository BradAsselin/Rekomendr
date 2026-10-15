"use client";

// S4b — CAPTURE ONLY. This used to render an "Add to Home Screen" /
// "Install App" button in the header on every page open. The build plan
// moves add-to-home-screen to AFTER Save only ("never on page open"), so
// the header button is gone; what stays is the plumbing that has to run at
// app start:
//   * the service-worker registration (unchanged), and
//   * catching Chrome's one-time `beforeinstallprompt` and holding it
//     (src/lib/installPrompt.ts) until a Save offers it (InstallCoach.tsx).

import { useEffect } from "react";
import {
  holdInstallPrompt,
  isStandalone,
  type BeforeInstallPromptEvent,
} from "../lib/installPrompt";

export default function InstallButton() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    if (isStandalone()) return;
    const onPrompt = (e: Event) => {
      e.preventDefault?.();
      holdInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  return null;
}
