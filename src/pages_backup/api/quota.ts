// src/pages/api/quota.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getUsage, endChainAndCount, type BetaFlags, type Tier } from "../../lib/quota";

// Helper to parse beta flags from body (POST) or headers (GET fallback)
function parseBeta(req: NextApiRequest): BetaFlags {
  if (req.method === "POST") {
    const b = (typeof req.body === "string" ? JSON.parse(req.body) : req.body)?.beta || {};
    return { beta1: !!b.beta1, beta2: !!b.beta2 };
  }
  // Optionally allow simple header hints for GET (dev convenience)
  return {
    beta1: req.headers["x-rex-beta1"] === "1",
    beta2: req.headers["x-rex-beta2"] === "1",
  };
}

function parseTier(req: NextApiRequest): Tier {
  if (req.method === "POST") {
    const t = (typeof req.body === "string" ? JSON.parse(req.body) : req.body)?.tier || "guest";
    return (["guest", "signed", "paid"] as const).includes(t) ? t : "guest";
  }
  const th = (req.headers["x-rex-tier"] as string) || "guest";
  return (["guest", "signed", "paid"] as const).includes(th as Tier) ? (th as Tier) : "guest";
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const tier = parseTier(req);
    const beta = parseBeta(req);
    const usage = getUsage({ req, res, tier, beta });
    return res.status(200).json({ ok: true, usage, tier, beta });
  }

  if (req.method === "POST") {
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const action = body?.action as string;
      const chainId = body?.chainId as string;
      const tier = parseTier(req);
      const beta = parseBeta(req);

      if (action === "end") {
        if (!chainId) return res.status(400).json({ ok: false, error: "Missing chainId" });
        const result = endChainAndCount({ req, res, tier, beta, chainId });
        return res.status(200).json({ ok: true, result });
      }

      return res.status(400).json({ ok: false, error: "Unknown action" });
    } catch (e: any) {
      console.error("[/api/quota] error", e);
      return res.status(400).json({ ok: false, error: "Bad Request" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method Not Allowed" });
}
