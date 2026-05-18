import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function alterTable() {
  const { error } = await supabase.rpc('exec_sql', {
    sql: `ALTER TABLE grades ADD COLUMN IF NOT EXISTS mst_3 NUMERIC DEFAULT 0;`
  });
  console.log('Error:', error);
}

alterTable();
