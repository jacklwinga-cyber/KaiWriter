import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local');
  }
  if (!client) {
    client = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        detectSessionInUrl: true,
        flowType: 'pkce',
        persistSession: true,
      },
    });
  }
  return client;
}

export type KaiWriterPlan = 'free' | 'pro' | 'teams';

export interface KaiWriterDocumentRow {
  id: string;
  user_id: string;
  name: string;
  content: string;
  template_id: string | null;
  last_modified: number;
}

export interface KaiWriterSubscriptionRow {
  user_id: string;
  plan: KaiWriterPlan;
  status: string;
  current_period_end: string | null;
}
