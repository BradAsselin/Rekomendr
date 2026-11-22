// src/lib/getAppSheet.ts — S41 (docs/2026-11-22_get_the_app_launch.md,
// item 2; board H2). The "Get the app" sheet, written ONCE as plain HTML
// and CSS so the two places that show it can't drift: the public card
// page (/a/[id], a server-rendered page with no React and no inline
// script) and the app (GetAppHost.tsx). Import-free and pure.
//
// The sheet holds every variant; the root's data-variant shows one:
//   ios27  — Safari 27+: the page menu at the bottom left of the address bar
//   ios26  — Safari 26: the ⋯ button at the bottom right
//   ios    — older Safari: the Share button in the bottom toolbar
//   android — Chrome's menu (when its own install prompt isn't available)
//   inapp-ios / inapp-android — another app's browser: open in Safari /
//            Chrome first, with a one-tap copy of the link
// Taps are named by data-ga-act (close · got · copy); the host wires them.
//
// Approved wording (Brad, 2026-11-22): the heading, the two lines under
// it, "Got it", and the three Safari steps. The Android menu steps and
// the open-in-Safari lines are flagged "your call" in the session log.

export type GetAppVariant = "ios27" | "ios26" | "ios" | "android" | "inapp-ios" | "inapp-android";

export const GET_APP_VARIANTS: GetAppVariant[] = ["ios27", "ios26", "ios", "android", "inapp-ios", "inapp-android"];

export const GET_APP_TITLE = "Put Rekomendr on your home screen";
export const GET_APP_FREE = "Free. No App Store needed.";
export const GET_APP_OPENS = "It opens like any app, from its own icon.";
export const GET_APP_GOT_IT = "Got it";
export const GET_APP_COPY = "Copy link";
export const GET_APP_COPIED = "Link copied";

// Pictures of the real buttons, drawn inline (no image request).
const key = (svg: string) => `<span class="ga-key" aria-hidden="true">${svg}</span>`;
const svg = (body: string, w = 20, h = 20) =>
  `<svg width="${w}" height="${h}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
// Safari 27's page menu: three lines.
const ICON_MENU = key(svg(`<path d="M4 6h12M4 10h12M4 14h12"/>`));
// Safari 26's More button: three dots.
const ICON_DOTS = key(svg(`<circle cx="4.5" cy="10" r="1.2" fill="currentColor"/><circle cx="10" cy="10" r="1.2" fill="currentColor"/><circle cx="15.5" cy="10" r="1.2" fill="currentColor"/>`));
// Chrome's menu: three dots, upright.
const ICON_DOTS_V = key(svg(`<circle cx="10" cy="4.5" r="1.2" fill="currentColor"/><circle cx="10" cy="10" r="1.2" fill="currentColor"/><circle cx="10" cy="15.5" r="1.2" fill="currentColor"/>`));
// Share: a square with an arrow up.
const ICON_SHARE = key(svg(`<path d="M10 2v10M6.5 5.5 10 2l3.5 3.5"/><path d="M7 8.5H4.5V18h11V8.5H13"/>`));
// Add to Home Screen: a rounded square with a plus.
const ICON_ADD = key(svg(`<rect x="3" y="3" width="14" height="14" rx="3.5"/><path d="M10 7v6M7 10h6"/>`));

const steps = (v: GetAppVariant, items: string[]) =>
  `<ol class="ga-steps" data-ga-v="${v}">` +
  items.map((s, i) => `<li><span class="ga-n">${i + 1}</span><span class="ga-t">${s}</span></li>`).join("") +
  `</ol>`;

const b = (s: string) => `<strong>${s}</strong>`;

const inApp = (v: GetAppVariant, browser: string) =>
  `<div class="ga-inapp" data-ga-v="${v}">` +
  `<p>Open this page in ${browser} first, then tap Get the app.</p>` +
  `<button type="button" class="ga-copy" data-ga-act="copy">${GET_APP_COPY}</button>` +
  `</div>`;

// The whole sheet, hidden until its root loses `hidden`. `variant` may be
// set here (the app) or later by script (the card page).
export function getAppSheetHtml(variant?: GetAppVariant | null): string {
  return (
    `<div class="ga" data-ga${variant ? ` data-variant="${variant}"` : " hidden"}>` +
    `<button type="button" class="ga-scrim" data-ga-act="close" aria-label="Close" tabindex="-1"></button>` +
    `<div class="ga-panel" role="dialog" aria-modal="true" aria-label="${GET_APP_TITLE}">` +
    `<img class="ga-icon" src="/rekomendr_icon_blue_180.png" alt="" width="56" height="56">` +
    `<h2>${GET_APP_TITLE}</h2>` +
    `<p class="ga-sub">${GET_APP_FREE}</p>` +
    `<p class="ga-sub">${GET_APP_OPENS}</p>` +
    steps("ios27", [
      `Tap the menu ${ICON_MENU} at the bottom of Safari`,
      `Tap ${b("Share")} ${ICON_SHARE}`,
      `Tap ${b("Add to Home Screen")} ${ICON_ADD}, then ${b("Add")}`,
    ]) +
    steps("ios26", [
      `Tap ${ICON_DOTS} at the bottom of Safari`,
      `Tap ${b("Share")} ${ICON_SHARE}`,
      `Tap ${b("Add to Home Screen")} ${ICON_ADD}, then ${b("Add")}`,
    ]) +
    steps("ios", [
      `Tap ${b("Share")} ${ICON_SHARE} at the bottom of Safari`,
      `Tap ${b("Add to Home Screen")} ${ICON_ADD}`,
      `Tap ${b("Add")}`,
    ]) +
    steps("android", [
      `Tap the menu ${ICON_DOTS_V} at the top of Chrome`,
      `Tap ${b("Add to Home screen")} ${ICON_ADD}`,
      `Tap ${b("Install")}`,
    ]) +
    inApp("inapp-ios", "Safari") +
    inApp("inapp-android", "Chrome") +
    `<button type="button" class="ga-got" data-ga-act="got">${GET_APP_GOT_IT}</button>` +
    `</div>` +
    // Points at the Safari control the first step uses.
    `<div class="ga-arrow" aria-hidden="true">↓</div>` +
    `</div>`
  );
}

const show = GET_APP_VARIANTS.map((v) => `.ga[data-variant="${v}"] [data-ga-v="${v}"]`).join(",");

export const GET_APP_SHEET_CSS = `
.ga{position:fixed;inset:0;z-index:80;display:flex;flex-direction:column;justify-content:flex-end;font-family:-apple-system,BlinkMacSystemFont,system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#111827;text-align:left}
.ga[hidden]{display:none}
.ga *{box-sizing:border-box}
.ga-scrim{position:absolute;inset:0;border:0;padding:0;margin:0;background:rgba(0,0,0,.45);width:100%;height:100%}
.ga-panel{position:relative;margin:0 12px 6px;max-width:36rem;align-self:center;width:calc(100% - 24px);background:#fff;border-radius:18px;padding:18px 18px 14px;box-shadow:0 20px 40px rgba(0,0,0,.35);max-height:calc(100dvh - 70px);overflow-y:auto}
.ga-icon{display:block;width:56px;height:56px;border-radius:13px;margin:0 0 10px}
.ga h2{font-size:19px;line-height:1.25;font-weight:700;margin:0 0 4px;color:#111827}
.ga-sub{font-size:15px;line-height:1.4;color:#4b5563;margin:0}
.ga [data-ga-v]{display:none}
${show}{display:block}
.ga-steps{list-style:none;margin:14px 0 0;padding:0}
.ga-steps li{display:flex;align-items:center;gap:10px;padding:7px 0;font-size:16px;line-height:1.35;color:#111827}
.ga-n{flex:none;width:26px;height:26px;border-radius:999px;background:#1E3A8A;color:#fff;font-size:14px;font-weight:600;display:flex;align-items:center;justify-content:center}
.ga-key{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;margin:0 2px;border-radius:8px;background:#EEF3FC;color:#1E3A8A;vertical-align:middle}
.ga-inapp{margin:14px 0 0}
.ga-inapp p{font-size:16px;line-height:1.4;color:#111827;margin:0 0 10px}
.ga-copy{display:block;width:100%;height:46px;border-radius:12px;border:2px solid #1E3A8A;background:#fff;color:#1E3A8A;font-size:16px;font-weight:600}
.ga-got{display:block;width:100%;height:48px;margin-top:14px;border-radius:12px;border:0;background:#1E3A8A;color:#fff;font-size:16px;font-weight:600}
.ga-arrow{position:relative;display:none;height:44px;font-size:34px;line-height:44px;color:#fff;padding-bottom:env(safe-area-inset-bottom)}
.ga[data-variant="ios27"] .ga-arrow{display:block;text-align:left;padding-left:26px}
.ga[data-variant="ios26"] .ga-arrow{display:block;text-align:right;padding-right:26px}
.ga[data-variant="ios"] .ga-arrow{display:block;text-align:center}
.ga[data-variant="android"] .ga-panel,.ga[data-variant="inapp-ios"] .ga-panel,.ga[data-variant="inapp-android"] .ga-panel{margin-bottom:max(12px,env(safe-area-inset-bottom))}
@media (prefers-reduced-motion:no-preference){.ga-arrow{animation:ga-bob 1.2s ease-in-out infinite}}
@keyframes ga-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(5px)}}
`;
