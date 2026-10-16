// app/api/manifest/route.ts
// S4b — the web-app manifest with a per-save start URL. After Save, the
// page points its <link rel="manifest"> here, so "Add to Home Screen"
// installs an icon that opens straight onto the saved card and carries the
// claim (the iOS separate-storage hand-off). Everything else is the static
// public/manifest.json, unchanged. Only `card` and `claim` are carried, and
// only in their own validated shapes — no open redirect, no other params.

import manifest from "../../../public/manifest.json";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLAIM_RE = /^[A-Za-z0-9_-]{10,500}\.[A-Za-z0-9_-]{20,100}$/;

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const card = url.searchParams.get("card") ?? "";
  const claim = url.searchParams.get("claim") ?? "";
  const start =
    UUID_RE.test(card) && CLAIM_RE.test(claim)
      ? `/?card=${card.toLowerCase()}&claim=${encodeURIComponent(claim)}`
      : "/";
  return new Response(JSON.stringify({ ...manifest, start_url: start, id: "/" }), {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "no-store",
    },
  });
}
