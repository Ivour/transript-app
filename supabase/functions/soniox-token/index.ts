// Supabase Edge Function: soniox-token
//
// Mints a short-lived Soniox API key for the browser, so the permanent
// Soniox key never has to leave the server (see .clinerules section 3).
//
// Auth: Supabase verifies the caller's JWT automatically before this
// function runs (the function is NOT deployed with --no-verify-jwt), so by
// the time this code executes, the request is already known to come from
// an authenticated (i.e. the single allowed) user.
//
// Secrets required (set via `supabase secrets set SONIOX_API_KEY=...`):
//   SONIOX_API_KEY — permanent Soniox API key. NOT set yet at the time of
//   writing this function — see TODO below.

import { corsHeaders } from "../_shared/cors.ts";

const SONIOX_TEMPORARY_KEY_URL =
  "https://api.soniox.com/v1/auth/temporary-api-key";

/**
 * How long the minted temporary key stays valid, in seconds. Kept short on
 * purpose — the frontend re-requests a new key via this same function when
 * needed (long sessions), so this does not limit overall session length.
 */
const TEMPORARY_KEY_TTL_SECONDS = 60;

interface SonioxTemporaryKeyApiResponse {
  api_key: string;
  expires_at: string;
}

Deno.serve(async (req: Request) => {
  // Browser preflight for the actual POST call.
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sonioxApiKey = Deno.env.get("SONIOX_API_KEY");

  // TODO(user): remove this guard once `SONIOX_API_KEY` is set via
  // `supabase secrets set SONIOX_API_KEY=...` — see .clinerules section 3.
  if (!sonioxApiKey) {
    return new Response(
      JSON.stringify({
        error:
          "SONIOX_API_KEY secret is not configured on the Supabase project yet.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const sonioxResponse = await fetch(SONIOX_TEMPORARY_KEY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sonioxApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        usage_type: "transcribe_websocket",
        expires_in_seconds: TEMPORARY_KEY_TTL_SECONDS,
      }),
    });

    if (!sonioxResponse.ok) {
      const errorBody = await sonioxResponse.text();
      return new Response(
        JSON.stringify({
          error: `Soniox API error (${sonioxResponse.status}): ${errorBody}`,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const sonioxData: SonioxTemporaryKeyApiResponse =
      await sonioxResponse.json();

    return new Response(
      JSON.stringify({
        apiKey: sonioxData.api_key,
        expiresAt: sonioxData.expires_at,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: `Unexpected error calling Soniox: ${(err as Error).message}`,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
