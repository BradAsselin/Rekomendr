import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ? "present" : "MISSING";
  const role = process.env.SUPABASE_SERVICE_ROLE_KEY ? "present" : "MISSING";
  res.status(200).json({ NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: role });
}
