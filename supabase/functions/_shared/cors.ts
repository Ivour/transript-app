/**
 * Shared CORS headers for Supabase Edge Functions called directly from the
 * browser (via `supabase.functions.invoke`). The browser sends a preflight
 * OPTIONS request before the actual call, so every function using this
 * helper must handle `OPTIONS` and also attach these headers to its real
 * response.
 */
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
