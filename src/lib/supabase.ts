import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "⚠️ Faltan las variables de entorno de Supabase. Asegúrate de tener NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en tu archivo .env.local"
  );
}

// Patrón Singleton para evitar múltiples clientes en desarrollo (HMR)
const globalForSupabase = globalThis as unknown as {
  supabase: SupabaseClient;
};

export const supabase =
  globalForSupabase.supabase || createClient(supabaseUrl, supabaseAnonKey);

if (process.env.NODE_ENV !== 'production') {
  globalForSupabase.supabase = supabase;
}