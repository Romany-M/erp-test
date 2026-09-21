import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly during development instead of silently hitting a blank backend.
  console.error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
    'Copy .env.example to .env (or set them in your Vercel project) before running the app.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
