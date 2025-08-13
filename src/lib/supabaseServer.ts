// src/lib/supabaseServer.ts
if (typeof window !== 'undefined') {
  throw new Error('supabaseServer.ts was imported in a browser bundle.');
}
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseServer = createClient(url, key, {
  auth: { persistSession: false },
});
