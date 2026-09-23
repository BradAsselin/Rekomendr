// src/lib/shareLink.ts
// The native-share → clipboard → legacy-copy cascade, lifted out of
// ShareButton.tsx in Session 2 so the header's "Share Rekomendr" and the
// anchor's "Share" run the exact same fallbacks. Behaviour is unchanged
// for the header button; the one addition is that the result says WHY a
// native share didn't happen, because the anchor needs to know.
//
// "not_allowed" matters on iOS: navigator.share requires a fresh user
// gesture, and an anchor share first waits on the network (the flip). If
// Safari decides the tap has expired, the sheet is refused — the caller
// then offers one more tap, which is a fresh gesture and always works.

export type ShareOutcome =
  | "shared" // the native sheet opened and the user sent it
  | "canceled" // the native sheet opened and the user closed it
  | "not_allowed" // the native sheet was refused (gesture expired)
  | "copied" // no native sheet; the URL is on the clipboard
  | "manual"; // nothing could copy; the caller should show the URL

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

export async function shareOrCopy(args: {
  title: string;
  text: string;
  url: string;
}): Promise<ShareOutcome> {
  // 1) Native share sheet (requires secure context on iOS)
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: args.title, text: args.text, url: args.url });
      return "shared";
    } catch (err) {
      return (err as { name?: string })?.name === "NotAllowedError"
        ? "not_allowed"
        : "canceled";
    }
  }

  // 2) Async clipboard (also requires secure context)
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(args.url);
      return "copied";
    } catch {
      // fall through to legacy copy
    }
  }

  // 3) execCommand textarea trick — works in insecure contexts
  if (legacyCopy(args.url)) return "copied";

  // 4) Nothing can copy — the caller shows the URL for a manual copy
  return "manual";
}
