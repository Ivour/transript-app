/**
 * Settings that change how a session is captured and transcribed. Defaults
 * are what production uses. The test build (`VITE_APP_ENV=test`) lets the
 * user change them in `TuningPanel` to find out by ear/eye what works best.
 * Everything is read once at the tap on Start and baked into the session
 * (getUserMedia, worklet, Soniox config), so it cannot change mid-session.
 * Never persisted (see CLAUDE.md).
 */
import {
  CHUNK_DURATION_MS,
  MIC_ECHO_CANCELLATION,
  MIC_NOISE_SUPPRESSION,
} from "../audio/constants";

export interface TuningSettings {
  /**
   * Soniox endpoint detection makes non-final text turn final sooner, but
   * Soniox documents that forcing early finalization reduces diarization
   * accuracy (the rest of a sentence, or the same person's next sentence,
   * can get another speaker label). OFF = best diarization, slowest finals.
   */
  endpointDetection: boolean;
  /**
   * Upper bound (500..3000, Soniox default 2000) on how long Soniox waits
   * after speech ends before declaring an endpoint. Lower finalizes sooner
   * but cuts sentences short. Only sent while `endpointDetection` is on.
   */
  endpointDelayMs: number;
  /**
   * -1..1, Soniox default 0. Negative = endpoints less likely. Only valid
   * while `endpoint_latency_adjustment_level` stays 0 (left unset on
   * purpose). Only sent while `endpointDetection` is on.
   */
  endpointSensitivity: number;
  /** getUserMedia voice processing — see MIC_* in audio/constants.ts. */
  echoCancellation: boolean;
  noiseSuppression: boolean;
  /** `null` = leave the browser default (usually on) — the original behavior. */
  autoGainControl: boolean | null;
  /** Size of each PCM chunk sent to Soniox, see CHUNK_DURATION_MS. */
  chunkMs: number;
}

export const DEFAULT_TUNING: TuningSettings = {
  endpointDetection: false,
  endpointDelayMs: 2000,
  endpointSensitivity: -0.5,
  echoCancellation: MIC_ECHO_CANCELLATION,
  noiseSuppression: MIC_NOISE_SUPPRESSION,
  autoGainControl: null,
  chunkMs: CHUNK_DURATION_MS,
};

/** Soniox-documented limits for `max_endpoint_delay_ms`. */
export const ENDPOINT_DELAY_MIN_MS = 500;
export const ENDPOINT_DELAY_MAX_MS = 3000;

/** Chunk sizes offered in the test panel. */
export const CHUNK_OPTIONS_MS = [20, 40, 60, 100] as const;
