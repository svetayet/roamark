import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Единственное место создания supabase-клиента.
 * Ключи читаются только здесь и в RepoContext.
 */
let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!url || !key) {
      throw new Error('Supabase не настроен: нужны VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY.');
    }
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}
