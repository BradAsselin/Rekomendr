// src/lib/getApp.ts — S41, browser side (docs/2026-11-22_get_the_app_
// launch.md). One door to "Get the app" for every place that offers it
// (the ⋯ menu, home's ask, the line under a shared card's picks):
//   * running from the home-screen icon → nothing, ever;
//   * Chrome handed us its install prompt → that prompt, one tap;
//   * otherwise → the sheet (GetAppHost.tsx), in the variant that matches
//     the browser (src/lib/getAppSheet.ts).
// And the one memory of the ask: after × or the sheet's "Got it" it waits
// 14 days; after three dismissals it never returns. This device only.

import { heldInstallPrompt, isIOS, isIOSSafari, isStandalone, runInstallPrompt } from "./installPrompt";
import { sendMeasure } from "./measureClient";
import type { GetAppVariant } from "./getAppSheet";

export const GET_APP_EVENT = "rekomendr:get-app";

// Safari's own version ("Version/27.0"); iOS's "OS 18_6" is frozen and
// says nothing since Safari 26.
const safariMajor = (ua: string): number | null => {
  const m = /Version\/(\d+)/.exec(ua);
  return m ? Number(m[1]) : null;
};

// Another app's browser on Android (a web view): no install there.
const ANDROID_IN_APP = /; wv\)|FBAN|FBAV|FB_IAB|Instagram|Line\//;

// Pure, so the validators can call it with any user agent.
export function getAppVariantFor(ua: string, ios: boolean, iosSafari: boolean): GetAppVariant {
  if (ios) {
    if (!iosSafari) return "inapp-ios";
    const v = safariMajor(ua);
    // An unreadable version gets the newest layout's steps.
    if (v == null || v >= 27) return "ios27";
    return v === 26 ? "ios26" : "ios";
  }
  return ANDROID_IN_APP.test(ua) ? "inapp-android" : "android";
}

export const getAppVariant = (): GetAppVariant =>
  getAppVariantFor(typeof navigator === "undefined" ? "" : navigator.userAgent, isIOS(), isIOSSafari());

// --- the ask's memory (this device only) ---------------------------------
const ASK_KEY = "rekomendr.get_app_ask";
export const ASK_WAIT_MS = 14 * 24 * 60 * 60 * 1000;
export const ASK_MAX_DISMISSALS = 3;

type AskState = { n: number; at: number };
const readAsk = (): AskState => {
  try {
    const s = JSON.parse(window.localStorage.getItem(ASK_KEY) || "null");
    return s && Number.isFinite(s.n) && Number.isFinite(s.at) ? { n: s.n, at: s.at } : { n: 0, at: 0 };
  } catch {
    return { n: 0, at: 0 };
  }
};

// Pure rule: fewer than three dismissals, and 14 days since the last.
export const askAllowed = (s: AskState, now: number): boolean =>
  s.n < ASK_MAX_DISMISSALS && (s.n === 0 || now - s.at >= ASK_WAIT_MS);

// May an ask (home's line, the line under a card's picks) show now?
export function getAppAskDue(now: number = Date.now()): boolean {
  if (typeof window === "undefined" || isStandalone()) return false;
  return askAllowed(readAsk(), now);
}

// × on an ask, the sheet's "Got it", or a "no" to Chrome's own prompt.
export function noteGetAppDismissed(now: number = Date.now()): void {
  try {
    const s = readAsk();
    window.localStorage.setItem(ASK_KEY, JSON.stringify({ n: s.n + 1, at: now }));
  } catch {
    // storage blocked: the ask may come back next visit
  }
}

// Home's ask waits for the person's first search that showed results.
const RESULTS_KEY = "rekomendr.had_results";
export function noteResultsShown(): void {
  try {
    if (!window.localStorage.getItem(RESULTS_KEY)) window.localStorage.setItem(RESULTS_KEY, "1");
  } catch {}
}
export function hadResults(): boolean {
  try {
    return window.localStorage.getItem(RESULTS_KEY) === "1";
  } catch {
    return false;
  }
}

// Open "Get the app". Never when already installed.
export async function openGetApp(): Promise<void> {
  if (typeof window === "undefined" || isStandalone()) return;
  sendMeasure({ event: "getapp_open" });
  if (heldInstallPrompt()) {
    const outcome = await runInstallPrompt();
    if (outcome === "accepted") return sendMeasure({ event: "install_accepted" });
    if (outcome === "dismissed") {
      noteGetAppDismissed();
      return sendMeasure({ event: "install_dismissed" });
    }
    // "unavailable": the prompt broke — fall through to the steps.
  }
  window.dispatchEvent(new CustomEvent(GET_APP_EVENT));
}
