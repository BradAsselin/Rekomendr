// src/pages/api/track.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer } from "../../lib/supabaseServer";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { event, prompt } = (req.body || {}) as { event?: string; prompt?: string | null };
  if (!event) return res.status(400).json({ error: "Missing event" });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const projectHost = (() => {
    try { return new URL(supabaseUrl).host; } catch { return "(invalid NEXT_PUBLIC_SUPABASE_URL)"; }
  })();

  const { data, error } = await supabaseServer
    .from("usage_events")
    .insert({ event, prompt: prompt ?? null })
    .select("id, created_at, event, prompt")
    .single();

  if (error) {
    return res.status(500).json({ error: "Failed to save", supabase_error: error, projectHost });
  }

  return res.status(200).json({ ok: true, projectHost, inserted: data });
}
