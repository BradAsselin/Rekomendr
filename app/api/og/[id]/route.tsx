// app/api/og/[id]/route.tsx
// S2 — the link-preview image for a shared anchor (blueprint §5, S3.5).
// S4 — recognizable in the thread: the poster when the card is a movie or
// show, the title large, and "from <name>" when the sender gave one. The
// image is what a person scrolling back through a text thread finds the
// card by, so it leads with the art and the title, not with our brand.
//
// 1200×630, `next/og` (built into Next 14.2 — no new dependency). Same
// hard posture as the page: no OpenAI import, no generation. The text is
// the name, the category, the sender, and the FIRST SENTENCE OF THE SHORT
// (immutable — the long may complete after the share).
//
// Anything that doesn't resolve publicly (private, revoked, health,
// malformed, missing) gets the generic brand card with a 200 — a stale
// preview in someone's thread degrades to the brand, never a broken image.

import { ImageResponse } from "next/og";
import {
  firstSentence,
  loadPublicSnapshot,
  stripControl,
} from "../../../../src/lib/anchorSnapshots";
import { cardMediaWithin } from "../../../../src/lib/cardMedia";
import { posterUrl } from "../../../../src/lib/tmdbMedia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NAVY_FIELD = "#0b1725";
const FRAME = "#1E3A8A";
const BRAND = "#2D5AB5";

// Hang protection (§2.11): link scrapers give up after a few seconds, so
// TMDb and the poster download each get a bounded slice. Past it, the
// image renders without the art rather than not at all.
const MEDIA_BUDGET_MS = 1500;
const POSTER_BUDGET_MS = 2000;

const clamp = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

// The poster as a data URL: fetched here with a timeout, so a slow image
// host can never hang or break the render (satori would otherwise fetch it
// itself, unbounded).
async function posterDataUrl(path: string | null): Promise<string | null> {
  const url = posterUrl(path, "w500");
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(POSTER_BUDGET_MS), cache: "no-store" });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/^image\/(jpeg|png|webp)/.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 2_000_000) return null;
    return `data:${type.split(";")[0]};base64,${buf.toString("base64")}`;
  } catch {
    console.warn("[og] poster fetch failed — rendering without art", { path });
    return null;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
): Promise<Response> {
  const row = await loadPublicSnapshot(params.id);
  const media = row ? await cardMediaWithin(row, MEDIA_BUDGET_MS) : null;
  const poster = row ? await posterDataUrl(media?.posterPath ?? row.poster_path ?? null) : null;

  const name = row ? clamp(stripControl(row.item_name), 80) : "Rekomendr";
  const category = row ? stripControl(row.item_category).toUpperCase() : "";
  const sender = row?.sender_name ? clamp(stripControl(row.sender_name), 40) : null;
  const line = row
    ? clamp(stripControl(firstSentence(row.short_description)), poster ? 150 : 180)
    : "Snap or type one thing. Get a decision in under a minute.";

  const image = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: NAVY_FIELD,
          padding: 40,
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            background: "#ffffff",
            border: `10px solid ${FRAME}`,
            borderRadius: 36,
            overflow: "hidden",
          }}
        >
          {poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={poster}
              width={350}
              height={530}
              style={{ width: 350, height: 530, objectFit: "cover" }}
              alt=""
            />
          ) : null}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: poster ? "44px 48px" : "48px 56px",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              {sender ? (
                <div style={{ fontSize: 34, color: BRAND, marginBottom: 14 }}>
                  {`from ${sender}`}
                </div>
              ) : category ? (
                <div style={{ fontSize: 26, letterSpacing: 4, color: BRAND, marginBottom: 14 }}>
                  {category}
                </div>
              ) : null}
              <div
                style={{
                  fontSize: poster ? 60 : 64,
                  fontWeight: 700,
                  color: "#111827",
                  lineHeight: 1.1,
                  marginBottom: 22,
                }}
              >
                {name}
              </div>
              <div style={{ fontSize: poster ? 30 : 34, color: "#374151", lineHeight: 1.35 }}>
                {line}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: 26,
                color: BRAND,
              }}
            >
              <div style={{ fontWeight: 700 }}>Rekomendr</div>
              <div style={{ color: "#6b7280" }}>rekomendr.ai</div>
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );

  // The image URL carries a key over everything it shows (cardShare.ts),
  // so a given URL's content never changes: cached forever is correct.
  // The generic card is cached briefly instead, so a row that becomes
  // shared a moment later isn't stuck behind a year-long generic image.
  // A card whose poster exists but didn't download in time is cached
  // briefly too, so the art arrives on the next fetch.
  const posterMissed = !!(media?.posterPath ?? row?.poster_path) && !poster;
  image.headers.set(
    "Cache-Control",
    row && !posterMissed ? "public, max-age=31536000, immutable" : "public, max-age=300"
  );
  return image;
}
