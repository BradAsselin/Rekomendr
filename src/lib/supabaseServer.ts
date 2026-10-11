// src/lib/supabaseServer.ts
if (typeof window !== 'undefined') {
  throw new Error('supabaseServer.ts was imported in a browser bundle.');
}
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Next 14 caches every fetch() made inside a GET route handler in its Data
// Cache, and supabase-js reads are fetch() calls. Without no-store, the
// public share page served a stale 200 after revocation, a stale 404 after
// a share, and /api/health could answer the keep-warm ping without ever
// touching the database. Service-role reads are always live.
export const supabaseServer = createClient(url, key, {
  auth: { persistSession: false },
  global: {
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
  },
});
