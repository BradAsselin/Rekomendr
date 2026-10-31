// src/lib/jsonArray.ts — S35. The search lane's reply reader, shared by
// the engine (client) and /api/openai (server), so the route's silent
// retry judges a reply exactly the way the engine will read it: a bare
// array, { results } / { recommendations }, or an array found in prose
// or a code fence.
export function extractJsonArray(text: string): any[] | null {
  try {
    const direct = JSON.parse(text);
    if (Array.isArray(direct)) return direct;
    if (Array.isArray(direct?.results)) return direct.results;
    if (Array.isArray(direct?.recommendations)) return direct.recommendations;
  } catch {}

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]);
    if (Array.isArray(parsed)) return parsed;
  } catch {}

  return null;
}
