import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseServer } from '../../lib/supabaseServer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  try {
    const { event, meta } = (req.body ?? {}) as { event?: string; meta?: any };

    const now = new Date();
    const today = now.toISOString().slice(0, 10); // YYYY-MM-DD

    const { error } = await supabaseServer
      .from('global_usage')
      .insert([
        {
          event: event ?? 'unknown',
          meta: meta ?? {},
          usage_date: today,
          created_at: now.toISOString(),
        },
      ]);

    if (error) return res.status(400).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || 'Server error' });
  }
}
