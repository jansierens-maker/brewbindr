import { createClient } from '@supabase/supabase-js';

const getEnv = (key: string) => {
  const value = (import.meta as any).env?.[key] || process.env[key] || '';
  // Basic validation to avoid common configuration pitfalls
  if (!value || value === 'undefined' || value === 'null' || value.includes('YOUR_')) return '';
  return value;
};

const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL');
const supabaseAnonKey = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn('Supabase credentials missing or invalid. Data sync will be unavailable.');
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const getSupabaseConfigInfo = () => ({
  url: supabaseUrl ? `${supabaseUrl.substring(0, 12)}...` : 'Not Set',
  hasKey: !!supabaseAnonKey,
  isConfigured: isSupabaseConfigured
});
