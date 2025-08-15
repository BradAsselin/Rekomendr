// src/pages/api/usage_list.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer } from "../../lib/supabaseServer";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const projectHost = (() => {
    try { return new URL(supabaseUrl).host; } catch { return "(invalid NEXT_PUBLIC_SUPABASE_URL)"; }
  })();

  const { data, error } = await supabaseServer
    .from("usage_events")
    .select("id, created_at, event, prompt")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) return res.status(500).json({ error, projectHost });
  return res.status(200).json({ projectHost, rows: data });
}
