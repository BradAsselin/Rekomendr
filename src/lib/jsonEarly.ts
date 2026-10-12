// src/lib/jsonEarly.ts — S3.0: read one object out of a JSON document that
// is still streaming in.
//
// The vision prompt's response shape puts `detected_item` FIRST. For a
// movie or TV snap, everything after it (fifteen model-written reks) is
// replaced by the TMDb path, so the route reads the anchor as soon as its
// closing brace arrives and stops the stream there — the snap's time to
// first card stops paying for text it will throw away. No prompt change.

// Returns the parsed object at `"<key>": { … }` once that object is
// complete in `buf`, else null. String-aware: braces inside strings
// (and escaped quotes) never count.
export function extractCompleteObject(buf: string, key: string): Record<string, unknown> | null {
  const at = buf.indexOf(`"${key}"`);
  if (at < 0) return null;
  let i = buf.indexOf(":", at + key.length + 2);
  if (i < 0) return null;
  i++;
  while (i < buf.length && /\s/.test(buf[i])) i++;
  if (buf[i] !== "{") return null;
  const start = i;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (; i < buf.length; i++) {
    const ch = buf[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(buf.slice(start, i + 1));
          return parsed && typeof parsed === "object" ? parsed : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
