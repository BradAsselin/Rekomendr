// src/pages/api/recs.ts
import type { NextApiRequest, NextApiResponse } from "next";

// ---- Simple in-memory rate limit: 10 req / 60s / IP ----
const WINDOW_MS = 60_000;
const MAX_REQ = 10;
const hits = new Map<string, { count: number; reset: number }>();
function rateLimit(ip: string): boolean {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now > rec.reset) {
    hits.set(ip, { count: 1, reset: now + WINDOW_MS });
    return true;
    }
  if (rec.count >= MAX_REQ) return false;
  rec.count += 1;
  return true;
}

// ---- OpenAI caller ----
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.REKOMENDR_MODEL || "gpt-4o-mini"; // cheap & fast; adjust if you like

const SYSTEM_PROMPT = `
You are Rekomendr, a concise tastemaker. Your job: return five high-confidence recommendations that feel personal and useful.

STYLE RULES
- Keep it short and human — one punchy sentence per item (max ~22 words).
- Sound like a friend with taste, not a robot or a critic.
- Avoid spoilers. Prefer vibes, cast, premise, or why it fits the request.
- Prefer recent when the user hints "newer"; otherwise mix timeless + modern.
- Don’t repeat titles or give obvious top-10 lists unless the query asks for "popular".
- If the query is vague, infer a coherent theme and commit.

OUTPUT FORMAT (STRICT)
- Return pure JSON only: { "items": [ { "id": "slug", "title": "Title", "summary": "…" }, … ] }
- Exactly 5 items.
- id: URL-safe slug from the title (lowercase, dashes).
- No prose outside the JSON.
`.trim();

function userTemplate(
  user_prompt: string,
  hints?: string[],
  category?: string,
  refiners?: string[]
) {
  return `
USER REQUEST:
${user_prompt}

CONTEXT HINTS (optional):
${(hints && hints.length) ? hints.join(", ") : "n/a"}

CATEGORY (optional): ${category || "unknown"}

REFINERS (optional): ${(refiners && refiners.length) ? refiners.join(", ") : "n/a"}

GOAL:
Return 5 items that the user is likely to love. Keep each summary crisp and specific (why this fits). Output STRICT JSON as per the schema.
`.trim();
}

type Rec = { id: string; title: string; summary: string };
type Payload = { items: Rec[] };

// Basic JSON safety
function safeParse(json: string): Payload | null {
  try {
    const obj = JSON.parse(json);
    if (!obj || !Array.isArray(obj.items)) return null;
    // sanitize a little
    obj.items = obj.items
      .slice(0, 5)
      .map((it: any) => ({
        id: String(it.id || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
        title: String(it.title || "").trim(),
        summary: String(it.summary || "").trim(),
      }))
      .filter((it: Rec) => it.id && it.title && it.summary);
    if (obj.items.length !== 5) return null;
    return obj as Payload;
  } catch {
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";

  if (!rateLimit(ip)) {
    return res.status(429).json({ error: "Too many requests, slow down." });
  }

  const { prompt, hints, category, refiners } = req.body || {};
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({ error: "Missing prompt" });
  }

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "user" as const, content: userTemplate(prompt, hints, category, refiners) },
  ];

  try {
    const resp = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.6,       // lively but not chaotic
        max_tokens: 600,        // 5 tight summaries fits fine
        response_format: { type: "json_object" }, // force JSON
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return res.status(500).json({ error: "Model error", detail: text.slice(0, 500) });
    }

    const data = await resp.json();
    const content: string = data?.choices?.[0]?.message?.content || "";
    const parsed = safeParse(content);

    if (!parsed) {
      return res.status(502).json({ error: "Bad model output" });
    }

    // Optional: log a usage event (non-blocking)
    try {
      fetch(`${req.headers.origin || ""}/api/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "recs_ok", prompt }),
      }).catch(() => {});
    } catch {}

    return res.status(200).json(parsed);
  } catch (e: any) {
    return res.status(500).json({ error: "Server error", detail: String(e?.message || e) });
  }
}
