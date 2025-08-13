import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const testConnection = async () => {
  const { data, error } = await supabase.from('your_table_name').select('*').limit(1);
  if (error) {
    console.error('❌ Connection test failed:', error.message);
  } else {
    console.log('✅ Connection successful! Sample row:', data);
  }
};

testConnection();
