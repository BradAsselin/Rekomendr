// src/pages/api/envcheck.ts
import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? "✅ present (masked)" : "❌ missing",
    SUPABASE_URL: process.env.SUPABASE_URL || "❌ missing",
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? "✅ present (masked)" : "❌ missing",
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "❌ missing",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "✅ present" : "❌ missing",
    NEXT_PUBLIC_REKOMENDR_API: process.env.NEXT_PUBLIC_REKOMENDR_API || "❌ missing",
    REKOMENDR_BACKEND_URL: process.env.REKOMENDR_BACKEND_URL || "(empty)",
  });
}
