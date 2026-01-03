// src/pages/api/admin_recent.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer } from "../../lib/supabaseServer";

type RecentRow =
  | { type: "search"; id: string; created_at: string; prompt: string | null }
  | { type: "vote"; id: string; created_at: string; prompt: string | null; vote: "up" | "down" };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { data: usageRows, error: usageErr } = await supabaseServer
      .from("usage_events")
      .select("id, created_at, event, prompt")
      .order("created_at", { ascending: false })
      .limit(20);

    if (usageErr) return res.status(500).json({ error: "usage query failed", details: usageErr });

    const { data: fbRows, error: fbErr } = await supabaseServer
      .from("feedback")
      .select("id, created_at, vote, prompt")
      .order("created_at", { ascending: false })
      .limit(20);

    if (fbErr) return res.status(500).json({ error: "feedback query failed", details: fbErr });

    const merged: RecentRow[] = [
      ...(usageRows ?? [])
        .filter((r) => r.event === "search")
        .map((r) => ({
          type: "search" as const,
          id: r.id as string,
          created_at: r.created_at as string,
          prompt: (r.prompt as string) ?? null,
        })),
      ...(fbRows ?? []).map((r) => ({
        type: "vote" as const,
        id: r.id as string,
        created_at: r.created_at as string,
        prompt: (r.prompt as string) ?? null,
        vote: (r.vote as "up" | "down") ?? "up",
      })),
    ];

    // sort newest first, then take top 20
    merged.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const rows = merged.slice(0, 20);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const projectHost = (() => {
      try { return new URL(supabaseUrl).host; } catch { return "(invalid NEXT_PUBLIC_SUPABASE_URL)"; }
    })();

    res.status(200).json({ ok: true, projectHost, rows });
  } catch (e: any) {
    res.status(500).json({ error: "unexpected", message: String(e) });
  }
}
