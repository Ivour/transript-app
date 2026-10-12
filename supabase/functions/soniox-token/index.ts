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
//   SONIOX_API_KEY — permanent Soniox API key from the **EU project**. It
//   only needs the "Speech-to-text, real-time" and "Temporary API keys"
//   permissions. A key from a US project gets 401 from the EU domain.

import { corsHeaders } from "../_shared/cors.ts";

// EU region (data residency): the key, this domain and the WebSocket URL in
// `src/lib/soniox.ts` must all belong to the same region. EU was measured
// ~75 ms faster per round trip from Prague than the default US host
// (2026-10-12), which is a direct cut of the word -> first text latency.
const SONIOX_TEMPORARY_KEY_URL =
  "https://api.eu.soniox.com/v1/auth/temporary-api-key";

/**
 * How long the minted temporary key stays valid, in seconds. The frontend
 * prefetches a key while the page is open and refreshes it shortly before
 * expiry (see `useSonioxKeyPrefetch`) — 5 minutes keeps that refresh rare
 * while still limiting how long a leaked key would be usable. Does not
 * limit session length (that's `MAX_SESSION_DURATION_SECONDS` below).
 */
const TEMPORARY_KEY_TTL_SECONDS = 300;

/**
 * Hard safety cap on a single transcription session's duration, in seconds.
 * Enforced server-side by Soniox itself (not by any client-side timer),
 * because a backgrounded/forgotten browser tab can have its JS timers
 * throttled or paused entirely, which would make a client-side cutoff
 * unreliable. When this limit is reached, Soniox sends a final
 * `temp_api_key_session_expired` error message and closes the WebSocket —
 * the frontend (`useSonioxTranscription`) reacts by stopping the mic and
 * showing a friendly message. Purpose: protect Soniox credit if the user
 * forgets a session running (e.g. in a background tab), not to limit
 * normal usage — 30 minutes comfortably covers real transcription
 * sessions. See .clinerules section 3.
 */
const MAX_SESSION_DURATION_SECONDS = 30 * 60;


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
        max_session_duration_seconds: MAX_SESSION_DURATION_SECONDS,
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
