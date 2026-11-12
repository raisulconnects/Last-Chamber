/** Supabase client, created lazily so players who never sign in do not download or run it. */
import type { SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** False when the build has no Supabase settings: the game then runs as a pure local game. */
export const cloudEnabled: boolean = !!url && !!anonKey;

let client: Promise<SupabaseClient> | null = null;

export function getClient(): Promise<SupabaseClient> {
  if (!cloudEnabled) return Promise.reject(new Error('cloud disabled'));
  client ??= import('@supabase/supabase-js').then((m) =>
    m.createClient(url as string, anonKey as string, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    }),
  );
  return client;
}
