// src/pages/api/admin_stats.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer } from "../../lib/supabaseServer";

type DayBucket = { date: string; searches: number; votes: number };
type UsageRow = { id: string; event: string; created_at: string; prompt: string | null };
type FeedbackRow = { id: string; vote: "up" | "down"; created_at: string; prompt: string | null };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const now = new Date();
    const since = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000); // last 14 days
    const sinceISO = since.toISOString();

    // 1) Pull recent searches
    const { data: usageRows, error: usageErr } = await supabaseServer
      .from("usage_events")
      .select("id, event, created_at, prompt")
      .gte("created_at", sinceISO)
      .order("created_at", { ascending: false });

    if (usageErr) return res.status(500).json({ error: "usage query failed", details: usageErr });

    // 2) Pull recent votes
    const { data: feedbackRows, error: fbErr } = await supabaseServer
      .from("feedback")
      .select("id, vote, created_at, prompt")
      .gte("created_at", sinceISO)
      .order("created_at", { ascending: false });

    if (fbErr) return res.status(500).json({ error: "feedback query failed", details: fbErr });

    // 3) Aggregate per day
    const buckets = new Map<string, DayBucket>();

    const dayKey = (iso: string) => iso.slice(0, 10); // yyyy-mm-dd (UTC)

    for (const r of (usageRows as UsageRow[] | null) ?? []) {
      const key = dayKey(r.created_at);
      const b = buckets.get(key) ?? { date: key, searches: 0, votes: 0 };
      if (r.event === "search") b.searches += 1;
      buckets.set(key, b);
    }

    for (const r of (feedbackRows as FeedbackRow[] | null) ?? []) {
      const key = dayKey(r.created_at);
      const b = buckets.get(key) ?? { date: key, searches: 0, votes: 0 };
      b.votes += 1;
      buckets.set(key, b);
    }

    // Include all days in window (newest first)
    const days: DayBucket[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      const got = buckets.get(key) ?? { date: key, searches: 0, votes: 0 };
      days.push(got);
    }

    const totals = {
      searches: days.reduce((a, d) => a + d.searches, 0),
      votes: days.reduce((a, d) => a + d.votes, 0),
    };

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const projectHost = (() => {
      try {
        return new URL(supabaseUrl).host;
      } catch {
        return "(invalid NEXT_PUBLIC_SUPABASE_URL)";
      }
    })();

    res.status(200).json({ ok: true, projectHost, totals, days });
  } catch (e: any) {
    res.status(500).json({ error: "unexpected", message: String(e) });
  }
}
