// src/lib/synopsis.ts — TMDb's synopsis cut for a card's short. Pure, so
// both bundles use it: the slot and screen routes (S12/S15) and, since
// S17v, the browser engine's AI-search cards.

// A synopsis's first sentence or two, for the card's short when no go-to
// line exists (TMDb's own text; the long carries the whole of it).
export function shortSynopsis(overview: string, max = 220): string {
  const text = overview.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [];
  let out = "";
  for (const s of sentences) {
    if ((out + s).trim().length > max) break;
    out += s;
  }
  out = out.trim();
  return out || `${text.slice(0, max - 1).trimEnd()}…`;
}
