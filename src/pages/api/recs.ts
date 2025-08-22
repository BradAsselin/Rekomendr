import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Fallback prompt values
  const { prompt = "popular", vertical = "movies" } = req.body || {};

  // If OpenAI mode is enabled and key is present → generate AI recs
  if (process.env.REKOMENDR_USE_OPENAI === "true" && process.env.OPENAI_API_KEY) {
    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      // Ask GPT to generate 5 recommendations
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a recommendation engine. Return exactly 5 ${vertical} recommendations as JSON with "title" and "description".`,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 300,
      });

      // Parse JSON from the assistant’s message
      const raw = completion.choices[0].message?.content || "";
      let items: any[] = [];
      try {
        items = JSON.parse(raw);
      } catch {
        // If model returned text instead of JSON, wrap it
        items = [{ title: "Parse error", description: raw }];
      }

      return res.status(200).json({ items });
    } catch (err: any) {
      console.error("OpenAI error:", err);
      return res.status(500).json({ error: "OpenAI request failed" });
    }
  }

  // Otherwise → return mock items
  return res.status(200).json({
    items: [
      { title: "Mock Title One", description: "Fallback mock item 1" },
      { title: "Mock Title Two", description: "Fallback mock item 2" },
    ],
  });
}
