// src/lib/installPrompt.ts — S4b, browser side. Add-to-home-screen plumbing:
//   * Android/Chrome: the real install prompt. Chrome fires
//     `beforeinstallprompt` early; it is captured once at app start
//     (InstallButton.tsx, capture-only) and held here until asked for.
//   * iPhone/iPad Safari: there is no install API, so a sheet shows the
//     three taps.
//   * Already running from the home screen: nothing, ever.
// S41 — who asks, when, and the sheet itself live in src/lib/getApp.ts,
// src/lib/getAppSheet.ts and GetAppHost.tsx ("Get the app"); the S4b coach
// that opened by itself after a Save is gone.

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export function holdInstallPrompt(e: BeforeInstallPromptEvent) {
  deferred = e;
  listeners.forEach((l) => l());
}
export const heldInstallPrompt = () => deferred;
export function onInstallPromptChange(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

// Chrome's own install sheet. Resolves to what the person chose; the held
// event is single-use either way.
export async function runInstallPrompt(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const e = deferred;
  if (!e) return "unavailable";
  deferred = null;
  try {
    await e.prompt();
    const choice = await e.userChoice?.catch(() => null);
    return choice?.outcome ?? "dismissed";
  } catch {
    return "unavailable";
  }
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// iPhone, iPod, or an iPad (iPadOS reports as a Mac with touch).
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

// Only Safari can add to the home screen on iOS; in-app browsers
// (Instagram, Facebook, Gmail…) and other iOS browsers' own UIs differ, so
// the coach is not shown there rather than shown wrong.
export function isIOSSafari(): boolean {
  if (!isIOS()) return false;
  const ua = navigator.userAgent;
  return /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|Instagram|FBAN|FBAV|Line\//.test(ua);
}

// Point the page's manifest at the per-save start URL, so the icon added
// next carries the claim (iOS storage). S41: the claim only — the icon
// opens home, never the card.
export function pointManifestAt(claim: string) {
  try {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (link) link.href = `/api/manifest?claim=${encodeURIComponent(claim)}`;
  } catch {
    // no manifest link: nothing to point
  }
}
