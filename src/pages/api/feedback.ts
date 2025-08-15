// src/pages/api/feedback.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer } from "../../lib/supabaseServer";

type Body = {
  vote: "up" | "down";
  prompt: string;
  itemId?: string;
  itemTitle?: string;
  itemSummary?: string;
  userId?: string | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = req.body as Body;

    if (!body || !body.vote || !body.prompt) {
      return res.status(400).json({ error: "Missing required fields: vote, prompt" });
    }

    const payload = {
      vote: body.vote,
      prompt: body.prompt,
      item_id: body.itemId ?? null,
      item_title: body.itemTitle ?? null,
      item_summary: body.itemSummary ?? null,
      user_id: body.userId ?? null,
    };

    const { error } = await supabaseServer.from("feedback").insert(payload);
    if (error) {
      console.error("Supabase insert error:", error);
      return res.status(500).json({ error: "Failed to save feedback" });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("API /feedback error:", err);
    return res.status(500).json({ error: "Unexpected server error" });
  }
}
