import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env: Record<string, string> = {};
envContent.split('\n').forEach(line => {
  const [key, ...values] = line.split('=');
  if (key && values.length > 0) {
    env[key.trim()] = values.join('=').trim();
  }
});

const supabaseUrl = env['VITE_SUPABASE_URL'];
const supabaseKey = env['VITE_SUPABASE_SERVICE_ROLE_KEY'] || env['VITE_SUPABASE_ANON_KEY'];

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixPolicy() {
  const { error } = await supabase.rpc('exec_sql', {
    sql: `
      DROP POLICY IF EXISTS "Faculty can manage grades" ON grades;
      CREATE POLICY "Faculty can manage grades" ON grades FOR ALL USING (
        EXISTS (SELECT 1 FROM classes WHERE classes.id = class_id AND classes.faculty_id = auth.uid())
      );
    `
  });
  console.log('Error:', error);
}

fixPolicy();
