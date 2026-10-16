// src/lib/cardShare.ts — S4. Small, import-free helpers shared by the
// public card (/a/[id]), its link-preview image (/api/og/[id]) and the app.

// Bump when the preview image's DESIGN changes. iMessage and WhatsApp cache
// images per exact URL with no purge; a new URL is the only refresh.
// v2 (S4): poster art + "from <name>".
export const OG_DESIGN_VERSION = 2;

// Tiny stable hash (FNV-1a, 32-bit) — a cache key, not a secret.
function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// The preview image URL. What the image SHOWS (sender name, poster) is in
// the key, so a sender who changes their name, or a card that gains its
// poster on first open, gets a new image URL instead of a stale cached one.
export function ogImagePath(id: string, sender: string | null, poster: string | null): string {
  return `/api/og/${id}?v=${OG_DESIGN_VERSION}&k=${fnv(`${sender ?? ""}|${poster ?? ""}`)}`;
}

// "Katrina's pick" (build plan wording). A name ending in s takes 's too
// (Chicago Manual of Style 7.16: "James's pick").
export function pickLabel(sender: string): string {
  return `${sender}’s pick`;
}
