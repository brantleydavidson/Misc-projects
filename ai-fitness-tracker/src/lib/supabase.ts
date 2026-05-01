import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase: SupabaseClient | null = supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

export function isSupabaseAvailable(): boolean {
  return supabase !== null;
}
