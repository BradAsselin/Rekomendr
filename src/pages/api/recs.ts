// src/pages/api/recs.ts
import type { NextApiRequest, NextApiResponse } from "next";

// ----- Types -----
type ItemOut = {
  id: string;
  title: string;
  year?: string;            // <-- we want a 4-digit string for movies/TV if known
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

  // System message: force a strict JSON shape and include YEAR
  const system = `
You are a concise recommendation engine. Return STRICT JSON (no prose) with this shape:
{
  "items": [
    {
      "id": "string",                  // unique id
      "title": "string",               // exact official title
      "year": "YYYY",                  // 4-digit release year for movies/TV if known, else empty or omit
      "description": "string",         // 1–2 sentences, specific and helpful
      "infoUrl": "string",             // optional, if you know a reliable info link
      "trailerUrl": "string"           // optional, YouTube link preferred if known
    }
  ]
}

Rules:
- Always include "year" for movies/TV when available. Use the widely accepted original release year.
- Keep description tight and useful (no spoilers).
- Limit to 5 items max.
- Do not include any text outside of the JSON object.
`.trim();

  const user = `
Give 5 ${vertical} recommendations for: "${prompt}"
`.trim();

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
  // data.choices[0].message.content should be a JSON string per response_format
  let parsed: ApiOut = { items: [] };
  try {
    parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
  } catch {
    // If parsing fails, keep empty
  }

  const items = sanitizeItems(parsed.items || []);
  return { items };
}

// ----- Handler -----
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Always enforce "no-store" so the frontend gets fresh results
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { prompt, vertical } = req.body || {};
    if (!prompt || !vertical) {
      res.status(400).json({ error: "Missing 'prompt' or 'vertical' in body" });
      return;
    }

    const out = await getRecs(String(prompt), String(vertical));
    res.status(200).json(out);
  } catch (err: any) {
    console.error("API /recs error:", err?.message || err);
    res.status(500).json({ items: [] });
  }
}
