
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

async function countUsers() {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.log("Supabase config missing");
    return;
  }
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  
  const { data, error, count } = await supabase
    .from('maintenance_records')
    .select('*', { count: 'exact', head: true });
    
  if (error) {
    console.error("Error fetching records:", error);
    return;
  }
  
  console.log(`Total records in maintenance_records: ${count}`);
}

countUsers();
