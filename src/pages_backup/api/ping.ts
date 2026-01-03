import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Allow GET/POST/OPTIONS so we can sanity-check in prod
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
    return res.status(200).end();
  }

  const body = (req.method === 'POST' ? req.body : null) ?? {};

  console.log(
    'PING key present?',
    Boolean(process.env.OPENAI_API_KEY),
    (process.env.OPENAI_API_KEY ?? '').slice(0, 7) + '…',
    '| method:', req.method
  );

  return res.status(200).json({ ok: true, method: req.method, received: body });
}
