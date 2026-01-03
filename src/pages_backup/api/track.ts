// src/pages/api/track.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getOrCreateClientId, todayKey } from "../../lib/quota";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const clientId = getOrCreateClientId(req, res);
  const day = todayKey();

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const event = body?.event ?? "unknown";
    const details = body?.details ?? {};
    // For now, just log to server console:
    // (When deployed to Vercel, this shows up in function logs.)
    console.log(`[track] ${day} ${clientId} :: ${event}`, details);

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error("[track] error", e);
    return res.status(400).json({ ok: false, error: "Bad Request" });
  }
}
