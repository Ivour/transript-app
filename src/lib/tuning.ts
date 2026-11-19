/**
 * Settings that change how a session is captured and transcribed. Defaults
 * are what every session starts with; `TuningPanel` (shown in all builds
 * for now) lets the user change them to find out by ear/eye what works best.
 * Everything is read once at the tap on Start and baked into the session
 * (getUserMedia, worklet, Soniox config), so it cannot change mid-session.
 * Never persisted (see CLAUDE.md).
 */
import {
  CHUNK_DURATION_MS,
  MIC_AUTO_GAIN_CONTROL,
  MIC_ECHO_CANCELLATION,
  MIC_NOISE_SUPPRESSION,
} from "../audio/constants";

/**
 * Soniox realtime models offered in the test panel. v6 (2026-11-03) has the
 * same API as v5 but measured ~900 ms "word -> text" in desktop Arc vs ~570 ms
 * on v5 (2026-11-16). v6 is also slower in Soniox's own web playground
 * (2026-11-19), so the delay is the model itself, not this app. v6 is the
 * default anyway (user's decision 2026-11-19: v5 goes away soon and v6
 * promises better accuracy/diarization); v5 stays selectable for comparison
 * until it is removed on 2026-12-15;
 * after that Soniox routes "stt-rt-v5" to v6 anyway, so this toggle stops
 * making a difference and should be removed.
 */
export const SONIOX_MODELS = ["stt-rt-v5", "stt-rt-v6"] as const;
export type SonioxModel = (typeof SONIOX_MODELS)[number];

export interface TuningSettings {
  /** Soniox model, the only server-side lever on time to first text. */
  model: SonioxModel;
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
  /**
   * Soniox `language_hints_strict`: output only Czech. Default on (more
   * accurate Czech). Off for conversations that include English: foreign
   * sentences are then written in their own language, at the risk of unclear
   * Czech occasionally being misdetected as another language.
   */
  strictLanguageHints: boolean;
  /** getUserMedia voice processing — see MIC_* in audio/constants.ts. */
  echoCancellation: boolean;
  noiseSuppression: boolean;
  /**
   * `null` = leave the browser default (usually on), the pre-2026-10-11
   * behavior; kept selectable in the test panel. Default: MIC_AUTO_GAIN_CONTROL.
   */
  autoGainControl: boolean | null;
  /** Size of each PCM chunk sent to Soniox, see CHUNK_DURATION_MS. */
  chunkMs: number;
}

/**
 * Production defaults (2026-10), chosen for the priorities in CLAUDE.md:
 * low latency first, then transcript/diarization accuracy, then battery/data.
 * - chunk 60 ms: data volume is the same for any chunk size (only a small
 *   per-message overhead differs), so bigger chunks save little battery but
 *   add delay; smaller ones cost battery for a gain nobody can perceive.
 * - endpoint detection off: Soniox documents it as lowering diarization
 *   accuracy; the price is slower "blackening" of text.
 * - echo/noise processing and AGC off: see MIC_* constants.
 */
export const DEFAULT_TUNING: TuningSettings = {
  model: "stt-rt-v6",
  endpointDetection: false,
  endpointDelayMs: 2000,
  endpointSensitivity: -0.5,
  strictLanguageHints: true,
  echoCancellation: MIC_ECHO_CANCELLATION,
  noiseSuppression: MIC_NOISE_SUPPRESSION,
  autoGainControl: MIC_AUTO_GAIN_CONTROL,
  chunkMs: CHUNK_DURATION_MS,
};

/** Soniox-documented limits for `max_endpoint_delay_ms`. */
export const ENDPOINT_DELAY_MIN_MS = 500;
export const ENDPOINT_DELAY_MAX_MS = 3000;

/** Chunk sizes offered in the test panel. */
export const CHUNK_OPTIONS_MS = [20, 40, 60, 100] as const;
