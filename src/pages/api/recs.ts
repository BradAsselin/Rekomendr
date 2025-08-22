// src/pages/api/recs.ts
import type { NextApiRequest, NextApiResponse } from 'next';

type RecsRequest = { prompt?: string; vertical?: string };
type Item = { id: string; title: string; description: string; infoUrl?: string; trailerUrl?: string };
type RecsResponse = { items: Item[] } | { error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<RecsResponse>) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { prompt = '', vertical = 'movies' } = (req.body || {}) as RecsRequest;
  const backend = (process.env.REKOMENDR_BACKEND_URL || '').trim();

  try {
    // If a backend URL is configured, proxy to it.
    if (backend) {
      const upstream = await fetch(backend, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, vertical }),
      });

      const text = await upstream.text(); // bubble exact response
      res.status(upstream.status || 200).send(text as any);
      return;
    }

    // No backend configured → return stable mock so dev never breaks.
    res.status(200).json({
      items: [
        {
          id: 'mock-1',
          title: 'Mock Title One',
          description: `Seed: "${prompt}" • Vertical: ${vertical}. (Dev mock: set REKOMENDR_BACKEND_URL for live data)`,
          infoUrl: 'https://www.google.com/search?q=movie+info',
          trailerUrl: 'https://www.youtube.com/results?search_query=trailer',
        },
        {
          id: 'mock-2',
          title: 'Mock Title Two',
          description: 'Second mock to prove ensure-5 backfill.',
          infoUrl: 'https://www.google.com/search?q=movie+info',
          trailerUrl: 'https://www.youtube.com/results?search_query=trailer',
        },
      ],
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Unknown error' });
  }
}
