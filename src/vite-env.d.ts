/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public Supabase project URL — safe to expose in client bundle. */
  readonly VITE_SUPABASE_URL: string;
  /** Public Supabase anon key — safe to expose given correct RLS/Auth rules. */
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
