// src/pages/api/feedback.ts
import type { NextApiRequest, NextApiResponse } from "next";

type Body = {
  vote: "up" | "down";
  itemId?: string;
  itemTitle?: string;
  itemSummary?: string;
  prompt?: string;
  userId?: string | null;
  tier?: "guest" | "free" | "paid";
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = (req.body || {}) as Body;
  if (body.vote !== "up" && body.vote !== "down") {
    return res.status(400).json({ error: "Missing or invalid vote" });
  }

  // Here you'd persist to your DB / analytics. For now we just log.
  // eslint-disable-next-line no-console
  console.log("[feedback]", {
    vote: body.vote,
    itemId: body.itemId,
    itemTitle: body.itemTitle,
    itemSummary: body.itemSummary,
    prompt: body.prompt,
    userId: body.userId ?? null,
    tier: body.tier ?? "guest",
    ts: new Date().toISOString(),
  });

  return res.status(200).json({ ok: true });
}
