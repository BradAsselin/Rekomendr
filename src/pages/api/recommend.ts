// src/pages/api/recommend.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import crypto from 'crypto';
import { supabase } from '../../lib/supabaseClient';
import { openai } from '../../lib/openaiClient';

type Rec = { id: string; title: string; description: string };

// Successful response
type Ok = { suggestions: Rec[] };

// When user has hit their per-day free limit and must take survey
type Gate = { needSurvey: true; message: string };

// Generic error
type Err = { error: string };

type Resp = Ok | Gate | Err;

// Env/config with safe defaults
const GLOBAL_DAILY_CAP = Number(process.env.GLOBAL_DAILY_CAP || '900'); // total site-wide calls/day
const DAILY_FREE_TOKENS_ANON = Number(process.env.DAILY_FREE_TOKENS_ANON || '3'); // anon free/day

export default async function handler(req: NextApiRequest, res: NextApiResponse<Resp>) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { prompt, refine, anonId } = (req.body || {}) as {
      prompt?: string;
      refine?: string;
      anonId?: string;
    };

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Missing prompt' });
    }

    // 1) GLOBAL CAP CHECK
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
    const { data: gRow, error: gErr } = await supabase
      .from('global_usage')
      .select('*')
      .eq('usage_date', today)
      .maybeSingle();

    if (gErr) {
      console.error('global_usage read error:', gErr);
    }

    const globalCount = gRow?.count ?? 0;
    if (globalCount >= GLOBAL_DAILY_CAP) {
      return res
        .status(429)
        .json({ error: 'Daily capacity reached. Please try again tomorrow.' });
    }

    // 2) PER-ANON CHECK
    const ip = getIp(req);
    const ipHash = ip ? sha256(ip) : null;
    const anon = anonId && typeof anonId === 'string' && anonId.length > 0 ? anonId : ipHash ?? 'unknown';

    const { data: aRow, error: aErr } = await supabase
      .from('anon_usage')
      .select('*')
      .eq('usage_date', today)
      .eq('anon_id', anon)
      .maybeSingle();

    if (aErr) {
      console.error('anon_usage read error:', aErr);
    }

    const used = aRow?.used ?? 0;
    const bonus = aRow?.bonus ?? 0;
    const allowed = DAILY_FREE_TOKENS_ANON + bonus;

    if (used >= allowed) {
      return res.status(403).json({
        needSurvey: true,
        message: 'You’ve used your free recs. Take a 10-second survey to get more today.'
      });
    }

    // 3) BUILD PROMPT & CALL OPENAI
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'user',
        content:
`You are Rekomendr, a crisp movie recommender.
Return a STRICT JSON array of 5 objects like:
[
  {"id":"tt0137523","title":"Fight Club","description":"A bored office worker..."},
  {"id":"...","title":"...","description":"..."}
]
No prose before or after the JSON; only JSON.

User query: "${prompt}"${refine ? `\nRefine: ${refine}` : ''}`
      }
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.8,
      messages
    });

    const raw = completion.choices?.[0]?.message?.content ?? '';

    const suggestions = parseSuggestions(raw);

    // 4) INCREMENT USAGE (best-effort)
    await upsertGlobal(today, globalCount + 1);
    await upsertAnon(today, anon, ipHash, used + 1, bonus);

    // 5) RETURN RECS
    return res.status(200).json({ suggestions });
  } catch (e: any) {
    console.error('recommend error:', e?.message || e);
    return res.status(500).json({ error: 'Server error' });
  }
}

// --- helpers --------------------------------------------------------------

function getIp(req: NextApiRequest) {
  const xf = (req.headers['x-forwarded-for'] as string) || '';
  return (xf.split(',')[0] || req.socket.remoteAddress || '').trim();
}

function sha256(s: string) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

async function upsertGlobal(date: string, count: number) {
  const { error } = await supabase
    .from('global_usage')
    .upsert({ usage_date: date, count }, { onConflict: 'usage_date' });
  if (error) console.error('global upsert error:', error);
}

async function upsertAnon(
  date: string,
  anon_id: string,
  ip_hash: string | null,
  used: number,
  bonus: number
) {
  const { error } = await supabase.from('anon_usage').upsert(
    { usage_date: date, anon_id, ip_hash: ip_hash ?? null, used, bonus },
    { onConflict: 'usage_date,anon_id' }
  );
  if (error) console.error('anon upsert error:', error);
}

function parseSuggestions(raw: string): Rec[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.slice(0, 5).map((it: any, i: number) => ({
        id: String(it.id ?? `rec-${i + 1}`),
        title: String(it.title ?? it.name ?? `Result ${i + 1}`),
        description: String(it.description ?? it.overview ?? '')
      }));
    }
  } catch {
    // fall through to text fallback
  }
  // Text fallback: split lines
  return raw
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((line, i) => ({
      id: `rec-${i + 1}`,
      title: line.replace(/^\d+[\).\s-]*/, '').trim(),
      description: ''
    }));
}
