// app/a/[id]/route.ts
// S2 — the public page for a SHARED anchor snapshot (blueprint §4, S3.5).
// S4 — the card is the product: it lives in a text thread and gets tapped
// again weeks later, so it opens forever, says who sent it, shows where it
// streams TODAY, and puts the one action that does the thing above the
// fold (docs/s4-s5-build-plan.md).
//
// Served by a ROUTE HANDLER, not a page, on purpose: a real 404 status is
// a requirement (link scrapers must not cache a ghost preview of a
// private or revoked share), and a page under this app's root
// `app/loading.tsx` streams inside a Suspense boundary — its 200 is on
// the wire before notFound() can run, even from generateMetadata
// (verified on a local production build). A handler owns its status.
//
// Hard posture — NO GENERATION: nothing here or in what it imports touches
// an OpenAI client or any generation path (scripts/validate-s2.cjs walks
// the import graph to prove it). A crawler costs one indexed point-read
// and, at most twice a day per card, one TMDb read — never a token.
//
// Private, revoked, health, malformed and nonexistent ids are one answer:
// the same 404 page. Every stored string is HTML-escaped. The only script
// is the same-origin /card.js (S4: opens and taps for the test readout);
// the CSP forbids inline script outright.
//
// S41 (docs/2026-11-22_get_the_app_launch.md, board H1) — the page AROUND
// the card changed: the header carries the logo, who sent it, and two
// buttons, Open Rekomendr and Get the app; Save reads "Save it for later";
// the last line is "Find more like this →". The snapshot text is printed
// exactly as before (§2.13). The page links the static manifest, so an
// icon added from here opens the app's home ("/"), never this card.

import { MEDIA_CATEGORIES } from "../../../src/lib/categoryGates";
import { posterUrl, type WatchInfo } from "../../../src/lib/tmdbMedia";
// S4 — live where-to-watch (12h refresh, stored fallback), poster, trailer.
import { cardMediaWithin, type CardMediaView } from "../../../src/lib/cardMedia";
import { bookMediaWithin, type BookView } from "../../../src/lib/bookCard";
import {
  firstSentence,
  loadPublicSnapshot,
  stripControl,
  type SnapshotRow,
} from "../../../src/lib/anchorSnapshots";
import { ogImagePath, pickLabel, sentLabel } from "../../../src/lib/cardShare";
// S41 — the Get the app sheet, the same HTML and CSS the app shows.
import { GET_APP_SHEET_CSS, getAppSheetHtml } from "../../../src/lib/getAppSheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
body{margin:0;background:#0b1725;font-family:-apple-system,BlinkMacSystemFont,system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-weight:400;color:#111827;-webkit-text-size-adjust:100%;text-size-adjust:100%}
header{border-bottom:1px solid rgba(255,255,255,.1);max-width:36rem;margin:0 auto;padding:12px 16px 12px}
.hd-top{display:flex;align-items:baseline;justify-content:space-between;gap:12px;min-height:30px}
.logo{color:#2D5AB5;font-weight:700;text-decoration:none;font-size:24px;letter-spacing:-.02em;line-height:1.2}
.logo span{color:rgba(45,90,181,.7)}
.sent{font-size:13px;color:#9ca3af;text-align:right;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hd-btns{display:flex;gap:10px;margin-top:12px}
.hb{flex:1;display:flex;align-items:center;justify-content:center;gap:7px;height:46px;padding:0 10px;border-radius:12px;font:inherit;font-size:16px;font-weight:600;text-decoration:none;line-height:1.2;border:2px solid #3B6BD4;color:#fff;background:transparent;cursor:pointer;-webkit-appearance:none;appearance:none}
.hb.primary{background:#3B6BD4}
.free{margin-top:9px;font-size:12.5px;color:#9ca3af;text-align:center}
@media (display-mode:standalone){.getapp,.free{display:none}}
html.standalone .getapp,html.standalone .free{display:none}
main{max-width:36rem;margin:0 auto;padding:16px 16px 56px}
.card{background:#fff;border:3px solid #1E3A8A;border-radius:16px;padding:18px;box-shadow:0 10px 15px -3px rgba(0,0,0,.2)}
.cat{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#2D5AB5;margin-bottom:4px}
.pick{font-size:14px;font-weight:600;color:#2D5AB5;margin-bottom:4px}
.by{font-size:14px;color:#4b5563;margin:2px 0 6px}
h1{font-size:20px;font-weight:600;line-height:1.25;margin:0}
h1 a{color:inherit;text-decoration:none}
p{font-size:16px;line-height:1.625;font-weight:400;color:#111827;margin:0 0 8px}
.top{display:flex;gap:14px;align-items:flex-start;margin-bottom:14px}
.poster{width:92px;height:138px;border-radius:10px;object-fit:cover;flex:none;background:#e5e7eb}
.actions{display:flex;gap:10px;margin:0 0 14px}
.btn{flex:1;display:block;text-align:center;padding:13px 10px;border-radius:12px;font-size:16px;font-weight:600;text-decoration:none;border:2px solid #1E3A8A;color:#1E3A8A;background:#fff;line-height:1.2}
.btn.primary{flex:2;background:#1E3A8A;color:#fff}
.avail{font-size:15px;color:#111827;margin:-4px 0 12px}
.tt{min-width:0;flex:1}
.save{margin-top:10px;display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border:2px solid #1E3A8A;border-radius:999px;color:#1E3A8A;font-size:15px;font-weight:600;text-decoration:none;line-height:1}
.own{margin-top:14px;font-size:14px;text-align:right}
.own a{color:#4b5563;text-decoration:none}
.watch{margin-top:12px;font-size:15px;line-height:1.6;color:#111827}
.watch .k{color:#4b5563}
.watch a{color:#111827;text-decoration:underline;text-decoration-color:#9ca3af;text-underline-offset:2px}
.watch .src{margin-top:4px;font-size:12px;color:#4b5563}
.watch .src a{color:#4b5563}
h1 a:hover,.own a:hover{text-decoration:underline}
.notice{background:#fff;border:1px solid #fcd34d;border-radius:16px;padding:16px;font-size:14px;color:#111827}
${GET_APP_SHEET_CSS}`;

// "Get the app" wears a small add-to-home mark (a rounded square, a plus).
const ADD_ICON =
  `<svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="14" height="14" rx="3.5"/><path d="M10 7v6M7 10h6"/></svg>`;

const LOGO = `<a class="logo" href="/">Rekomendr<span>.AI</span></a>`;


function shell(args: { head: string; body: string; header?: string }): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#2D5AB5">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Rekomendr">
<link rel="apple-touch-icon" href="/rekomendr_icon_blue_180.png">
<link rel="manifest" href="/manifest.json">
${args.head}
<style>${STYLE}</style>
</head><body>
<header>${args.header ?? `<div class="hd-top">${LOGO}</div>`}</header>
<main>${args.body}</main>
</body></html>`;
}

function htmlResponse(html: string, status: number): Response {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // S4: one same-origin script (/card.js — opens and taps for the test
      // readout) and TMDb's poster host. Still no inline script at all.
      "Content-Security-Policy":
        "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; img-src 'self' https://image.tmdb.org https://covers.openlibrary.org; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
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

// How long the page waits on TMDb before rendering with the STORED answer
// — a slow lookup must never hold a card open. Hang protection (§2.11).
const MEDIA_BUDGET_MS = 2500;

// The one action that does the thing, above the fold (S4): the first
// service in TMDb/JustWatch's own order (§2.1 — never ours, never payout).
function primaryAction(watch: WatchInfo | null): { href: string; label: string } | null {
  const s = watch?.stream[0];
  if (s) return { href: s.url, label: `▶ Watch on ${s.name}` };
  const r = watch?.rentBuy[0];
  if (r) return { href: r.url, label: `▶ Rent or buy on ${r.name}` };
  return null;
}

function cardPage(row: SnapshotRow, origin: string, media: CardMediaView | null, book: BookView | null = null): Response {
  const name = row.item_name;
  const category = row.item_category.trim().toLowerCase();
  const isMedia = MEDIA_CATEGORIES.has(category);
  const sender = row.sender_name ?? null;
  // "from Katrina" on the preview: iMessage and Android Messages print the
  // og:title under the image, so the name rides there.
  const title = sender ? `${name} · from ${sender}` : `${name} — Rekomendr`;
  const description = firstSentence(row.short_description);
  const pageUrl = `${origin}/a/${row.id}`;
  // S43 — a book: its Open Library cover (looked up once, stored).
  const poster = isMedia ? media?.posterPath ?? row.poster_path ?? null : book?.coverUrl ?? null;
  const imageUrl = `${origin}${ogImagePath(row.id, sender, poster)}`;

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
    `<meta property="og:image:alt" content="${esc(sender ? `${name}, from ${sender}` : name)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${esc(imageUrl)}">`,
  ].join("\n");

  // Link handoffs only — the firewall (§2.1): the rek was chosen first;
  // these send the reader where the thing actually is. `data-ev` names the
  // tap for /card.js (S4 instrumentation); nothing else reads it.
  const link = (href: string, label: string, ev?: string, cls?: string) =>
    `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer"` +
    `${ev ? ` data-ev="${ev}"` : ""}${cls ? ` class="${cls}"` : ""}>${label}</a>`;
  const trailerHref =
    media?.trailerUrl ??
    `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} trailer`)}`;

  let actions: string;
  if (isMedia) {
    const primary = primaryAction(media?.watch ?? null);
    actions = primary
      ? link(primary.href, esc(primary.label), "tap_watch", "btn primary") +
        link(trailerHref, "Trailer", "tap_trailer", "btn")
      : link(trailerHref, "▶ Trailer", "tap_trailer", "btn primary");
  } else {
    // Wine and products: the neutral shopping search the app's own Buy
    // verb uses (no where-to-buy source exists yet — build plan: unchanged).
    actions = link(
      `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(name)}`,
      "Buy",
      "tap_buy",
      "btn primary"
    );
  }

  const posterSrc = book ? book.coverUrl : posterUrl(poster, "w342");
  const heading = isMedia
    ? `<h1>${link(googleSearch(name), esc(name))}</h1>`
    : `<h1>${esc(name)}</h1>`;
  const label = sender
    ? `<div class="pick">${esc(pickLabel(sender))}</div>`
    : `<div class="cat">${esc(category)}</div>`;

  // S4b — Save, the bridge: one tap, no sign-in. It opens the app with this
  // card as the anchor, saved under the visitor's anonymous id, reks
  // loading (the app does the save — a plain link, so it works with no
  // script at all). Top right: the anchor grammar's verdict corner (§2.5).
  const save =
    `<a class="save" href="/?card=${esc(row.id)}&amp;save=1" aria-label="Save it for later">` +
    `<svg aria-hidden="true" width="14" height="18" viewBox="0 0 14 18"><path d="M1.5 1.5h11v15L7 12.5 1.5 16.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>` +
    `Save it for later</a>`;

  // S41 — Open Rekomendr: the app, with this card as the anchor on top and
  // its picks below (no save). A plain link, so it works with no script.
  const openHref = `/?card=${esc(row.id)}`;
  const header =
    `<div class="hd-top">${LOGO}` +
    (sender ? `<span class="sent">${esc(sentLabel(sender))}</span>` : "") +
    `</div>` +
    `<div class="hd-btns">` +
    `<a class="hb primary" href="${openHref}" data-open-app>Open Rekomendr</a>` +
    `<button type="button" class="hb getapp" data-get-app>${ADD_ICON}Get the app</button>` +
    `</div>` +
    `<div class="free">Free · no App Store needed · find more like this one</div>`;

  const body =
    `<article class="card">` +
    `<div class="top">` +
    (posterSrc
      ? `<img class="poster" src="${esc(posterSrc)}" alt="" width="92" height="138"${book ? ` referrerpolicy="no-referrer"` : ""}>`
      : "") +
    `<div class="tt">${label}${heading}${book?.author ? `<div class="by">${esc(book.author)}</div>` : ""}${save}</div>` +
    `</div>` +
    `<div class="actions">${actions}</div>` +
    (isMedia && !media?.watch && media?.availability
      ? `<div class="avail">${esc(media.availability)}</div>`
      : "") +
    `<p>${esc(row.short_description)}</p>` +
    (row.long_description ? `<p>${esc(row.long_description)}</p>` : "") +
    (isMedia && media?.watch ? watchBlock(media.watch, link) : "") +
    // The quiet invitation: the same door as Open Rekomendr. A relative
    // link keeps the visitor on whatever host served the page.
    `<div class="own"><a href="${openHref}" data-open-app>Find more like this →</a></div>` +
    `</article>` +
    getAppSheetHtml(null) +
    `<script src="/card.js" defer data-card="${esc(row.id)}"></script>`;

  return htmlResponse(shell({ head, body, header }), 200);
}

// Stream first, then rent or buy; each provider a direct link; the
// JustWatch attribution TMDb's terms require. Firewall (§2.1): TMDb /
// JustWatch's own order, nothing ranked by us.
function watchBlock(
  watch: WatchInfo,
  link: (href: string, label: string, ev?: string) => string
): string {
  const row = (label: string, ps: { name: string; url: string }[]) =>
    ps.length === 0
      ? ""
      : `<div><span class="k">${label}: </span>${ps
          .map((p) => link(p.url, esc(p.name), "tap_watch"))
          .join(" · ")}</div>`;
  return (
    `<div class="watch">` +
    row("Stream", watch.stream) +
    row("Rent or buy", watch.rentBuy) +
    `<div class="src">via ${link(watch.link, "JustWatch")}</div>` +
    `</div>`
  );
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
  const [media, book] = await Promise.all([cardMediaWithin(row, MEDIA_BUDGET_MS), bookMediaWithin(row, MEDIA_BUDGET_MS)]);
  return cardPage(row, originOf(req), media, book);
}
