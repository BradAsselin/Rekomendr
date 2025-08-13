// test-supabase.mjs
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' }); // <-- load .env.local explicitly

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing envs:', { SUPABASE_URL: !!url, SUPABASE_SERVICE_ROLE_KEY: !!key });
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

try {
  // pick a table that exists (from earlier): global_usage
  const { data, error } = await supabase.from('global_usage').select('*').limit(1);
  if (error) {
    console.error('❌ Query error:', error.message);
  } else {
    console.log('✅ Connected. Sample rows:', data);
  }
} catch (e) {
  console.error('❌ Exception:', e?.message || e);
}
