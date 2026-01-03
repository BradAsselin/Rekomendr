// src/pages/api/recs.ts
import type { NextApiRequest, NextApiResponse } from "next";

// ----- Types -----
type ItemOut = {
  id: string;
  title: string;
  year?: string;
  description: string;
  infoUrl?: string;
  trailerUrl?: string;
};

type ApiOut = { items: ItemOut[] };

// ----- Helpers -----
function coerceYear(y?: string): string | undefined {
  if (!y) return undefined;
  const m = String(y).match(/\b(19\d{2}|20\d{2})\b/);
  return m ? m[1] : undefined;
}

function ensureIds(items: ItemOut[]): ItemOut[] {
  return items.map((it, i) => ({
    ...it,
    id: it.id || `ai-${Date.now()}-${i}`,
  }));
}

function sanitizeItems(items: any[]): ItemOut[] {
  if (!Array.isArray(items)) return [];
  return ensureIds(
    items
      .slice(0, 5)
      .map((raw) => {
        const year = coerceYear(raw.year);
        return {
          id: String(raw.id || ""),
          title: String(raw.title || "").trim(),
          year,
          description: String(raw.description || "").trim(),
          infoUrl: raw.infoUrl ? String(raw.infoUrl) : undefined,
          trailerUrl: raw.trailerUrl ? String(raw.trailerUrl) : undefined,
        } as ItemOut;
      })
      .filter((it) => it.title)
  );
}

// ----- OpenAI call -----
async function getRecs(prompt: string, vertical: string): Promise<ApiOut> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const system = `
You are a concise recommendation engine. Return STRICT JSON (no prose) with this shape:
{
  "items": [
    {
      "id": "string",
      "title": "string",
      "year": "YYYY",
      "description": "string",
      "infoUrl": "string",
      "trailerUrl": "string"
    }
  ]
}

Rules:
- Always include "year" for movies/TV when available.
- Keep description tight and useful (no spoilers).
- Limit to 5 items max.
- No text outside the JSON.
`.trim();

  const user = `Give 5 ${vertical} recommendations for: "${prompt}"`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.7,
      max_tokens: 800,
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`OpenAI error ${resp.status}: ${t.slice(0, 400)}`);
  }

  const data = await resp.json();
  let parsed: ApiOut = { items: [] };
  try {
    parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
  } catch {}

  const items = sanitizeItems(parsed.items || []);
  return { items };
}
// Allow larger image payloads for RekSnap
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb", // increase from 1MB → 10MB
    },
  },
};

// ----- Handler -----
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { prompt, vertical, referenced_image } = req.body || {};

    if (!vertical) {
      res.status(400).json({ error: "Missing 'vertical' in body" });
      return;
    }

    // 🧠 Branch logic — support image input or text input
    let queryPrompt = "";

    if (referenced_image) {
      // Image RekSnap input path
      console.log("📸 RekSnap image received");
      queryPrompt = `Analyze this image and infer its content (e.g., wine label, book cover, movie poster). Then give 5 ${vertical} recommendations based on it.`;
    } else if (prompt) {
      // Text prompt path
      queryPrompt = String(prompt);
    } else {
      res.status(400).json({ error: "Missing 'prompt' or 'referenced_image' in body" });
      return;
    }

    const out = await getRecs(queryPrompt, String(vertical));
    res.status(200).json(out);
  } catch (err: any) {
    console.error("API /recs error:", err?.message || err);
    res.status(500).json({ items: [] });
  }
}
