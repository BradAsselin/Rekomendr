import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? "✅ present (masked)" : "MISSING",
    SUPABASE_URL: process.env.SUPABASE_URL || "(empty)",
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? "✅ present (masked)" : "MISSING",
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "(empty)",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "✅ present" : "MISSING",
    NEXT_PUBLIC_REKOMENDR_API: process.env.NEXT_PUBLIC_REKOMENDR_API || "(empty)",
    REKOMENDR_BACKEND_URL: process.env.REKOMENDR_BACKEND_URL || "(empty)",
    REKOMENDR_USE_OPENAI: process.env.REKOMENDR_USE_OPENAI || "false",
  });
}
