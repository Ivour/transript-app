import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Set VITE_SUPABASE_URL and " +
      "VITE_SUPABASE_ANON_KEY in .env.local.",
  );
}

/**
 * Singleton Supabase client for the whole app.
 *
 * Scope of use (see .clinerules section 7 — kept intentionally narrow):
 * - Auth: single-user email/password sign in (no public sign-up).
 * - Edge Functions: minting short-lived Soniox API keys
 *   (see `src/lib/soniox.ts`).
 *
 * No database tables and no migrations are used by this project.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
