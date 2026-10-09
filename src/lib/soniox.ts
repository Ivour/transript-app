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

/**
 * Default audio format/sample rate the browser sends — must match the
 * AudioWorklet output. Used for the "normal" AudioQualityMode; the
 * "low_bandwidth" mode overrides both via AUDIO_QUALITY_FORMAT /
 * AUDIO_QUALITY_SAMPLE_RATE (see src/audio/constants.ts) instead of these.
 */
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
  audio_format: string;
  sample_rate: number;
  num_channels: number;
  language_hints: string[];
  enable_speaker_diarization: boolean;
  language_hints_strict?: boolean;
  enable_endpoint_detection?: boolean;
  max_endpoint_delay_ms?: number;
  endpoint_sensitivity?: number;
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
  /**
   * Machine-readable error identifier. `temp_api_key_session_expired` is
   * sent when `max_session_duration_seconds` (configured server-side when
   * minting the temporary key, see `soniox-token` Edge Function) is
   * reached — used by `useSonioxTranscription` to show a specific message
   * instead of a generic connection-failure one.
   */
  error_type?: string;
}

/**
 * Final token Soniox emits when endpoint detection decides an utterance
 * ended (`enable_endpoint_detection`). A control marker, not speech.
 */
export const SONIOX_ENDPOINT_TOKEN = "<end>";

/** `error_type` sent by Soniox when `max_session_duration_seconds` is hit. */
export const SONIOX_SESSION_EXPIRED_ERROR_TYPE =
  "temp_api_key_session_expired";


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
