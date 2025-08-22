// src/pages/api/recs.ts
import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

type Item = { id?: string; title: string; description: string; infoUrl?: string; trailerUrl?: string; };
type Wire = { items: Item[] };
type RecsResponse = Wire | { error: string };

const MODEL = "gpt-4o-mini";

export default async function handler(req: NextApiRequest, res: NextApiResponse<RecsResponse>) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { prompt = "popular", vertical = "movies" } = (req.body || {}) as { prompt?: string; vertical?: string; };
  const BACKEND = (process.env.REKOMENDR_BACKEND_URL || "").trim();
  const USE_OPENAI = process.env.REKOMENDR_USE_OPENAI === "true";
  const API_KEY = process.env.OPENAI_API_KEY || "";

  try {
    // 1) Proxy to external backend if configured
    if (BACKEND) {
      const upstream = await fetch(BACKEND, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, vertical }),
      });
      const text = await upstream.text();
      res.status(upstream.status || 200).send(text as any);
      return;
    }

    // 2) OpenAI mode
    if (USE_OPENAI && API_KEY) {
      const client = new OpenAI({ apiKey: API_KEY });

      const system = `
You are a recommendation engine. Return ONLY valid JSON (no code fences, no prose).
Schema:
{
  "items": [
    { "title": string, "description": string, "infoUrl"?: string, "trailerUrl"?: string }
  ]
}
- 5 items max
- Descriptions 1–2 sentences
`;

      const user = `Seed: "${prompt}" • Vertical: "${vertical}". Output exactly the JSON schema above.`;

      const completion = await client.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.7,
        // 🔒 Force pure JSON so we don't get quoted/fenced text
        response_format: { type: "json_object" },
      });

      const raw = completion.choices?.[0]?.message?.content ?? "{}";

      // Direct parse (should always work with response_format=json_object)
      let obj: any;
      try {
        obj = JSON.parse(raw);
      } catch {
        // tiny fallback: strip fences/whitespace and try again
        const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
        obj = JSON.parse(cleaned);
      }

      const items = normalizeItems(obj?.items, vertical);
      return res.status(200).json({ items });
    }

    // 3) Stable mock fallback
    return res.status(200).json({
      items: [
        {
          id: "mock-1",
          title: "Mock Title One",
          description: `Seed: "${prompt}" • Vertical: ${vertical}. (Dev mock: set REKOMENDR_USE_OPENAI=true or REKOMENDR_BACKEND_URL)`,
          infoUrl: "https://www.google.com/search?q=movie+info",
          trailerUrl: "https://www.youtube.com/results?search_query=trailer",
        },
        {
          id: "mock-2",
          title: "Mock Title Two",
          description: "Second mock to prove ensure-5 backfill.",
          infoUrl: "https://www.google.com/search?q=movie+info",
          trailerUrl: "https://www.youtube.com/results?search_query=trailer",
        },
      ],
    });
  } catch (err: any) {
    console.error("API /recs error:", err?.message || err);
    return res.status(500).json({ error: "OpenAI request failed" });
  }
}

/* ---------- helpers ---------- */
function normalizeItems(input: any, vertical: string): Item[] {
  const arr: any[] = Array.isArray(input) ? input : [];
  const list = arr.slice(0, 5).map((x, i) => {
    const title = String(x?.title || `Untitled ${i + 1}`);
    const description = String(x?.description || `Recommended ${vertical} pick.`);
    const infoUrl = x?.infoUrl || "https://www.google.com/search?q=" + encodeURIComponent(title);
    const trailerUrl =
      x?.trailerUrl ||
      "https://www.youtube.com/results?search_query=" + encodeURIComponent(`${title} trailer`);
    return { id: `ai-${Date.now()}-${i}`, title, description, infoUrl, trailerUrl };
  });

  if (list.length < 2) {
    list.push({
      id: `fill-${Date.now()}-1`,
      title: "Editor’s Pick",
      description: `Hand-curated ${vertical} pick to round out your list.`,
      infoUrl: "https://www.google.com/",
      trailerUrl: "https://www.youtube.com/",
    });
  }
  return list;
}
