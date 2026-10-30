import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabaseReady = Boolean(url && key);

/**
 * Supabase is used for signing in only. Everything else goes through the
 * backend, which checks what each role is allowed to see.
 */
export const supabase = supabaseReady
  ? createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;
