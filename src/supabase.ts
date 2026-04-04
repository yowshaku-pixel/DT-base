import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase configuration is missing! Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your Secrets in AI Studio and restart the dev server.");
}

// Only initialize if we have a valid URL to avoid "Invalid supabaseUrl" error
// This prevents the app from crashing on load if secrets aren't set yet
export const supabase = (supabaseUrl && supabaseUrl.startsWith('http')) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

export type SupabaseError = {
  message: string;
  details: string;
  hint: string;
  code: string;
};

export function getSupabaseErrorMessage(err: any): string {
  if (!err) return "Unknown error";
  if (typeof err === 'string') return err;
  
  const error = err as SupabaseError;
  
  // Handle common Supabase errors
  switch (error.code) {
    case '42501':
      return "Insufficient permissions (RLS policy violation).";
    case '23505':
      return "Unique constraint violation (duplicate record).";
    case 'PGRST116':
      return "Record not found.";
    case 'PGRST301':
      return "JWT expired. Please log in again.";
    default:
      return error.message || "An error occurred with the database.";
  }
}
