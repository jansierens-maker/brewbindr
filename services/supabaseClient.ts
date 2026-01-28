import { createClient } from '@supabase/supabase-js';

const validateEnv = (value: any) => {
  const s = String(value || '');
  if (!s || s === 'undefined' || s === 'null' || s.includes('YOUR_')) return '';
  return s;
};

// We must use literal process.env access for Vite's 'define' replacement to work
const supabaseUrl = validateEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = validateEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

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
