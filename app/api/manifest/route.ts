// app/api/manifest/route.ts
// S4b — the web-app manifest with a per-save start URL: after a Save, the
// page points its <link rel="manifest"> here, so the icon added next
// carries the claim (the iOS separate-storage hand-off).
// S41 (docs/2026-11-22_get_the_app_launch.md, item 2) — the icon opens the
// app's HOME, never the card: the start URL carries the claim alone
// ("/?claim=…"), so the home-screen app still adopts the id that saved
// the card in Safari (the save is there, in Saved) but lands on home.
// Everything else is the static public/manifest.json, unchanged. Only a
// claim in its own validated shape is carried — no open redirect.

import manifest from "../../../public/manifest.json";

export const dynamic = "force-dynamic";

const CLAIM_RE = /^[A-Za-z0-9_-]{10,500}\.[A-Za-z0-9_-]{20,100}$/;

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const claim = url.searchParams.get("claim") ?? "";
  const start = CLAIM_RE.test(claim) ? `/?claim=${encodeURIComponent(claim)}` : "/";
  return new Response(JSON.stringify({ ...manifest, start_url: start, id: "/" }), {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "no-store",
    },
  });
}
