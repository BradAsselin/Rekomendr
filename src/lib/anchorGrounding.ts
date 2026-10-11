// src/lib/anchorGrounding.ts — server-only.
// Session 1.6: a media anchor's plot must come from something we can stand
// behind, never from the model's guess. Order of sources:
//   1. descriptive text in the photo itself (the vision prompt's job);
//   2. TMDb's overview, for movies and TV (this file);
//   3. neither: say only what can be stood behind, and say plainly when a
//      title is too new to know (the vision prompt's job).
// Field case: Undertone (2026, A24) was written up as "a reclusive sound
// engineer"; the real logline is a paranormal-podcast host haunted by
// recordings sent her way.
if (typeof window !== "undefined") {
  throw new Error("anchorGrounding.ts was imported in a browser bundle.");
}
import { lookupOverview, type OverviewLookup } from "./tmdbVerify";
import { mediaKindFor } from "./snapTitleGuard";

export type ModelGrounding = "image_text" | "known" | "unknown";

export const readModelGrounding = (raw: unknown): ModelGrounding | null =>
  raw === "image_text" || raw === "known" || raw === "unknown" ? raw : null;

export const readModelYear = (raw: unknown): number | null =>
  typeof raw === "number" && Number.isInteger(raw) && raw > 1870 && raw < 2100 ? raw : null;

// The TMDb source for a movie/TV anchor, or null (not media, no key, no
// match, no overview, lookup failed). Every non-hit is logged by reason.
export async function mediaSourceFor(args: {
  name: string;
  category: string;
  year?: number | null;
  path: string;
}): Promise<Extract<OverviewLookup, { found: true }> | null> {
  const kind = mediaKindFor(args.category);
  if (!kind) return null;
  const out = await lookupOverview(args.name, kind, args.year ?? null);
  // `in` narrows under the harnesses' non-strict compile as well as tsc's.
  if ("reason" in out) {
    console.warn("[anchor-grounding] no tmdb source", {
      path: args.path,
      kind,
      reason: out.reason,
    });
    return null;
  }
  return out;
}

// The line appended to the long-tier user message (Show details, and the
// snapshot's lazy completion) for movie/TV anchors. The system prompt stays
// byte-identical; the facts ride the user message as data.
export async function detailGroundingLine(args: {
  name: string;
  category: string;
  path: string;
}): Promise<string> {
  if (!mediaKindFor(args.category)) return "";
  const source = await mediaSourceFor({ ...args });
  return source
    ? `\nPlot facts you may use (TMDb synopsis) — add no plot beyond these and the displayed profile: ${source.overview}`
    : `\nAdd no plot facts beyond the displayed profile — if it says the title is too new to know, keep it that way.`;
}
