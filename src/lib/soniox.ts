import { supabase } from "./supabase";

/**
 * Soniox realtime STT — shared types, constants and the thin client used to
 * obtain a short-lived API key via the Supabase Edge Function.
 *
 * The actual WebSocket connection + audio capture pipeline will live in a
 * dedicated hook (e.g. `src/hooks/useSonioxTranscription.ts`) — not
 * implemented yet. This module only defines the data contracts and the
 * Edge Function call, per .clinerules sections 3 & 4.
 */

// --- Constants ---------------------------------------------------------

export const SONIOX_WEBSOCKET_URL =
  "wss://stt-rt.soniox.com/transcribe-websocket";

/** Audio format the browser sends — must match the AudioWorklet output. */
export const SONIOX_AUDIO_FORMAT = "pcm_s16le" as const;
export const SONIOX_SAMPLE_RATE = 16_000;
export const SONIOX_NUM_CHANNELS = 1;

/** Language hint(s) for the realtime model — Czech only for this app. */
export const SONIOX_LANGUAGE_HINTS = ["cs"] as const;

/** Name of the Supabase Edge Function that mints a temporary Soniox key. */
export const SONIOX_TOKEN_FUNCTION_NAME = "soniox-token";

// --- Types ---------------------------------------------------------------

/** Response returned by the `soniox-token` Edge Function. */
export interface SonioxTemporaryKeyResponse {
  apiKey: string;
  /** ISO-8601 timestamp of when `apiKey` expires. */
  expiresAt: string;
}

/** First message sent over the WS to configure the Soniox session. */
export interface SonioxSessionConfig {
  api_key: string;
  model: string;
  audio_format: typeof SONIOX_AUDIO_FORMAT;
  sample_rate: typeof SONIOX_SAMPLE_RATE;
  num_channels: typeof SONIOX_NUM_CHANNELS;
  language_hints: readonly string[];
  enable_speaker_diarization: true;
}

/** A single recognized token as streamed back by Soniox. */
export interface SonioxToken {
  text: string;
  is_final: boolean;
  speaker?: string;
  start_ms?: number;
  end_ms?: number;
  confidence?: number;
}

/** Shape of a message received over the Soniox WebSocket. */
export interface SonioxWebSocketMessage {
  tokens?: SonioxToken[];
  finished?: boolean;
  error_code?: number;
  error_message?: string;
}

// --- Edge Function client -------------------------------------------------

/**
 * Requests a fresh short-lived Soniox API key from the `soniox-token`
 * Supabase Edge Function. Requires an authenticated Supabase session —
 * `supabase.functions.invoke` attaches the user's JWT automatically.
 */
export async function fetchSonioxTemporaryKey(): Promise<SonioxTemporaryKeyResponse> {
  const { data, error } =
    await supabase.functions.invoke<SonioxTemporaryKeyResponse>(
      SONIOX_TOKEN_FUNCTION_NAME,
    );

  if (error) {
    throw new Error(`Failed to fetch Soniox temporary key: ${error.message}`);
  }

  if (!data) {
    throw new Error("Soniox temporary key response was empty.");
  }

  return data;
}
