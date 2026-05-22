import { createClient } from '@supabase/supabase-js';

let supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || '';
let supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || '';

// Fallback to localStorage for custom/exported builds (e.g., APK or StackBlitz)
if (!supabaseUrl || supabaseUrl.includes("TODO_PROJECT_ID") || !supabaseUrl.startsWith("http")) {
  const localUrl = localStorage.getItem("DTBASE_SUPABASE_URL");
  if (localUrl && localUrl.startsWith("http")) {
    supabaseUrl = localUrl;
  }
}

if (!supabaseAnonKey || supabaseAnonKey.length < 10) {
  const localKey = localStorage.getItem("DTBASE_SUPABASE_ANON_KEY");
  if (localKey && localKey.length > 10) {
    supabaseAnonKey = localKey;
  }
}

if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes("TODO_PROJECT_ID")) {
  console.error("Supabase configuration is missing or contains placeholders! Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your Secrets in AI Studio, or configure them manually in the app settings.");
}

// Only initialize if we have a valid URL to avoid "Invalid supabaseUrl" error
// This prevents the app from crashing on load if secrets aren't set yet
export const supabase = (supabaseUrl && supabaseUrl.startsWith('http') && !supabaseUrl.includes("TODO_PROJECT_ID")) 
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
  
  // Handle "Failed to fetch" which is a common network error
  // We check message, details, and the object itself stringified
  const message = err.message || (typeof err === 'string' ? err : "");
  const details = err.details || "";
  const errString = String(err);
  
  const isNetworkError = 
    message.includes("Failed to fetch") || 
    message.includes("NetworkError") ||
    message.includes("Load failed") ||
    message.includes("connection error") ||
    message.includes("dns_probe_finished_nxdomain") || // Common DNS fail
    details.includes("Failed to fetch") ||
    errString.includes("Failed to fetch") ||
    errString.includes("TypeError: Load failed") ||
    errString.includes("NetworkError");

  if (isNetworkError) {
    if ((import.meta as any).env.VITE_SUPABASE_URL?.includes("TODO_PROJECT_ID")) {
      return "Supabase URL contains placeholders. Please update VITE_SUPABASE_URL in AI Studio Secrets.";
    }
    return "Database connection failed (Failed to fetch). This usually happens if the Supabase URL is incorrect, your project is paused, or you have a local network/firewall issue.";
  }

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
    case '42P01':
      return "Database table missing. Please ensure all tables are created in Supabase.";
    default:
      return error.message || "An error occurred with the database.";
  }
}
