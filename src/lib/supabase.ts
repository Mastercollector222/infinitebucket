import { createClient } from "@supabase/supabase-js";

// Browser-side Supabase client using the publishable anon key only.
// No Supabase Auth, no service_role — RLS on public.users does the gating.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase =
  url && anonKey ? createClient(url, anonKey) : null;

export type UserRow = {
  wallet: string;
  username: string | null;
  created_at: string;
  last_seen: string;
};
