// pages/api/recommend.ts
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Allow POST (and harmlessly handle preflight if your browser sends it)
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Next.js pages API will parse JSON automatically when Content-Type is application/json
    const { prompt, anonId } = (req.body || {}) as { prompt?: string; anonId?: string };

    if (!prompt) {
      return res.status(400).json({ error: 'Missing prompt' });
    }

    // TODO: Call your recommender here.
    // For now, echo back so we can confirm POST works end-to-end.
    return res.status(200).json({ ok: true, received: { prompt, anonId } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}
