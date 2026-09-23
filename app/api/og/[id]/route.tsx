// app/api/og/[id]/route.tsx
// S2 — the link-preview image for a shared anchor (blueprint §5, S3.5).
//
// 1200×630, `next/og` (built into Next 14.2 — no new dependency). Same
// hard posture as the page: COLUMNS ONLY, no OpenAI import, no generation.
// It renders the name, the category, and the FIRST SENTENCE OF THE SHORT
// only — the short is immutable, while the long may complete after the
// share, so a cached preview is correct forever (§5.4).
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NAVY_FIELD = "#0b1725";
const FRAME = "#1E3A8A";
const BRAND = "#2D5AB5";

const clamp = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
): Promise<Response> {
  const row = await loadPublicSnapshot(params.id);

  const name = row ? clamp(stripControl(row.item_name), 90) : "Rekomendr";
  const category = row ? stripControl(row.item_category).toUpperCase() : "";
  const line = row
    ? clamp(stripControl(firstSentence(row.short_description)), 180)
    : "Snap or type one thing. Get a decision in under a minute.";

  const image = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: NAVY_FIELD,
          padding: 56,
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            background: "#ffffff",
            border: `10px solid ${FRAME}`,
            borderRadius: 36,
            padding: "48px 56px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            {category ? (
              <div
                style={{
                  fontSize: 26,
                  letterSpacing: 4,
                  color: BRAND,
                  marginBottom: 14,
                }}
              >
                {category}
              </div>
            ) : null}
            <div
              style={{
                fontSize: 64,
                fontWeight: 700,
                color: "#111827",
                lineHeight: 1.1,
                marginBottom: 24,
              }}
            >
              {name}
            </div>
            <div style={{ fontSize: 34, color: "#374151", lineHeight: 1.35 }}>
              {line}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 28,
              color: BRAND,
            }}
          >
            <div style={{ fontWeight: 700 }}>Rekomendr</div>
            <div style={{ color: "#6b7280" }}>rekomendr.ai</div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );

  // Immutable content → cached forever is cached correctly. The generic
  // card is cached briefly instead, so a row that becomes shared a moment
  // later isn't stuck behind a year-long generic image.
  image.headers.set(
    "Cache-Control",
    row ? "public, max-age=31536000, immutable" : "public, max-age=300"
  );
  return image;
}
