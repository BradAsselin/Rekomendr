// app/a/[id]/route.ts
// S2 — the public page for a SHARED anchor snapshot (blueprint §4, S3.5).
//
// Served by a ROUTE HANDLER, not a page, on purpose: a real 404 status is
// a requirement (link scrapers must not cache a ghost preview of a
// private or revoked share), and a page under this app's root
// `app/loading.tsx` streams inside a Suspense boundary — its 200 is on
// the wire before notFound() can run, even from generateMetadata
// (verified on a local production build). A handler owns its status.
//
// Hard posture — COLUMNS ONLY: nothing here or in what it imports touches
// an OpenAI client or any generation path (scripts/validate-s2.cjs walks
// the import graph to prove it). A crawler costs one indexed point-read,
// never a token. A missing long tier stays missing rather than
// generating on a public URL.
//
// Private, revoked, health, malformed and nonexistent ids are one answer:
// the same 404 page. Every model-generated string is HTML-escaped, and a
// strict Content-Security-Policy forbids scripts outright.

import { MEDIA_CATEGORIES } from "../../../src/lib/categoryGates";
import {
  firstSentence,
  loadPublicSnapshot,
  stripControl,
  type SnapshotRow,
} from "../../../src/lib/anchorSnapshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bump when the preview image's DESIGN changes. iMessage and WhatsApp
// cache images per exact URL with no purge; a new ?v= is a new URL.
// Snapshot CONTENT is immutable, so content never needs a bump.
const OG_DESIGN_VERSION = 1;

const esc = (s: string) =>
  stripControl(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const googleSearch = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;

// The app's palette: navy chrome #0b1725 (layout), the anchor's deep-navy
// 3px frame #1E3A8A (RekCard accent), brand blue #2D5AB5.
const STYLE = `
*{box-sizing:border-box}
body{margin:0;background:#0b1725;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#111827;-webkit-font-smoothing:antialiased}
header{border-bottom:1px solid rgba(255,255,255,.1);height:48px;display:flex;align-items:center;justify-content:center}
header a{color:rgba(255,255,255,.9);font-weight:700;text-decoration:none;font-size:15px}
main{max-width:36rem;margin:0 auto;padding:24px 16px 56px}
.card{background:#fff;border:3px solid #1E3A8A;border-radius:16px;padding:20px;box-shadow:0 10px 15px -3px rgba(0,0,0,.2)}
.cat{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#2D5AB5;margin-bottom:4px}
h1{font-size:18px;font-weight:600;margin:0 0 8px}
h1 a{color:inherit;text-decoration:none}
p{font-size:16px;line-height:1.625;color:#1f2937;margin:0 0 8px}
.verbs{display:grid;grid-template-columns:1fr 1fr 1fr;margin-top:12px;font-size:14px}
.verbs a{color:#374151;text-decoration:none}
.verbs a:hover,h1 a:hover,.cta a:hover{text-decoration:underline}
.v2{text-align:center}
.notice{background:#fff;border:1px solid #fcd34d;border-radius:16px;padding:16px;font-size:14px;color:#1f2937}
.cta{margin-top:20px;text-align:center;font-size:14px;color:rgba(255,255,255,.8)}
.cta a{color:#fff;font-weight:500;text-decoration:none}
`;

// The one CTA block (blueprint §4.2 copy, plain voice). "/" keeps the
// visitor on whatever host served the page — a preview stays a preview.
const CTA = `<div class="cta">Snapped with Rekomendr. <a href="/">Get reks for anything →</a></div>`;

function shell(args: { head: string; body: string }): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#2D5AB5">
<link rel="apple-touch-icon" href="/rekomendr_icon_blue_180.png">
${args.head}
<style>${STYLE}</style>
</head><body>
<header><a href="/">Rekomendr</a></header>
<main>${args.body}${CTA}</main>
</body></html>`;
}

function htmlResponse(html: string, status: number): Response {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // No scripts at all; inline styles and same-origin images only.
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
      // Shares are immutable except for revocation, which must take hold:
      // a short shared cache for hits, none for misses.
      "Cache-Control": status === 200 ? "public, max-age=60" : "no-store",
    },
  });
}

function notFoundPage(): Response {
  return htmlResponse(
    shell({
      head: `<title>Rekomendr</title>`,
      body: `<div class="notice">This rek isn&#39;t here anymore.</div>`,
    }),
    404
  );
}

function cardPage(row: SnapshotRow, origin: string): Response {
  const name = row.item_name;
  const category = row.item_category.trim().toLowerCase();
  const isMedia = MEDIA_CATEGORIES.has(category);
  const title = `${name} — Rekomendr`;
  const description = firstSentence(row.short_description);
  const pageUrl = `${origin}/a/${row.id}`;
  const imageUrl = `${origin}/api/og/${row.id}?v=${OG_DESIGN_VERSION}`;

  const head = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(pageUrl)}">`,
    `<meta property="og:site_name" content="Rekomendr">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:image" content="${esc(imageUrl)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${esc(name)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${esc(imageUrl)}">`,
  ].join("\n");

  // Link handoffs only — the firewall (§2.1): the rek was chosen first;
  // these send the reader where the thing actually is. Same neutral
  // searches the app's own verbs use (MediaVerbs.tsx, the snap Buy verb).
  const link = (href: string, label: string) =>
    `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  const verbs = isMedia
    ? `<div>${link(`https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} trailer`)}`, "▶ Trailer")}</div>` +
      `<div class="v2">${link(googleSearch(`where to watch ${name}`), "Watch")}</div><div></div>`
    : `<div></div><div class="v2">${link(`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(name)}`, "Buy")}</div><div></div>`;

  const heading = isMedia
    ? `<h1>${link(googleSearch(name), esc(name))}</h1>`
    : `<h1>${esc(name)}</h1>`;

  // Static and read-only — no thumbs, no save: a visitor has no snap
  // context, and taste signals are per-client.
  const body =
    `<article class="card">` +
    `<div class="cat">${esc(category)}</div>` +
    heading +
    `<p>${esc(row.short_description)}</p>` +
    (row.long_description ? `<p>${esc(row.long_description)}</p>` : "") +
    `<div class="verbs">${verbs}</div>` +
    `</article>`;

  return htmlResponse(shell({ head, body }), 200);
}

// Absolute origin of THIS request, so a preview's page points at the
// preview's own image and a production page at production's.
function originOf(req: Request): string {
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? new URL(req.url).host;
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
): Promise<Response> {
  const row = await loadPublicSnapshot(params.id);
  if (!row) return notFoundPage();
  return cardPage(row, originOf(req));
}
