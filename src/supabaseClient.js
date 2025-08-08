import { createClient } from '@supabase/supabase-js';

// Read the Supabase connection details from environment variables.  When
// deploying to Vercel you should set these environment variables in the
// dashboard.  Create‑React‑App only exposes variables prefixed with
// `REACT_APP_` to the browser at build time.  To remain compatible with
// the prior NEXT_PUBLIC naming convention we fall back to those keys if
// present.
const supabaseUrl =
  process.env.REACT_APP_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey =
  process.env.REACT_APP_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Guard against misconfiguration.  If either value is undefined the
// application will still build but the Supabase client will be null.  In
// development you can check the browser console for error messages if
// Supabase isn’t working as expected.
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;