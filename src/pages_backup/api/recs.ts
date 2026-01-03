import type { NextApiRequest, NextApiResponse } from "next";

type RekItem = {
  id: string;
  title: string;
  year?: string;
  description: string;
  trailerUrl?: string;
  infoUrl?: string;
};

// --- Safe JSON cleanup ---
function safeParse(raw: string): RekItem[] {
  if (!raw) return [];
  const cleaned = raw
    .replace(/[“”]/g, '"')
    .replace(/[\u0000-\u001F]+/g, "")
    .replace(/,\s*([\]}])/g, "$1")
    .trim();
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { prompt, vertical = "movies", count = 5 } = req.body;

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Missing or invalid prompt" });
    }

    const systemPrompt = `You are Rekomendr.AI — an intelligent recommendation engine.
Return ONLY valid JSON (no preface or commentary).
Each item must include:
"id": unique short id,
"title": title of ${vertical},
"year": release year (if known),
"description": ~300 characters,
"trailerUrl": YouTube or empty string,
"infoUrl": Google search link.

Output = pure JSON array of ${count} objects.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.8,
        max_tokens: 900,
      }),
    });

    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content || "";
    let items = safeParse(raw);

    // fallback demo data if model fails
    if (!items.length) {
      items = [
        {
          id: "1",
          title: "The Grand Seduction",
          year: "2013",
          description:
            "A charming small-town comedy about locals attempting to lure a doctor to stay in their community. Warm, witty, and human.",
          trailerUrl: "https://www.youtube.com/watch?v=4L7VEhAYLT0",
          infoUrl: "https://www.google.com/search?q=The+Grand+Seduction+2013",
        },
        {
          id: "2",
          title: "A Man Called Otto",
          year: "2022",
          description:
            "Tom Hanks stars as a grumpy widower whose world is changed by unexpected friendships. Heartwarming and deeply human.",
          trailerUrl: "https://www.youtube.com/watch?v=eFYUX9l-m5I",
          infoUrl: "https://www.google.com/search?q=A+Man+Called+Otto+2022",
        },
      ];
    }

    res.status(200).json({ items });
  } catch (err) {
    console.error("/api/recs error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
