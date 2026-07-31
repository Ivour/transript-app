/**
 * Audio capture constants shared between `useAudioCapture` and the
 * AudioWorklet processor (`public/worklets/pcm-recorder-worklet.js`).
 *
 * Kept in sync with the Soniox session config in `src/lib/soniox.ts`
 * (SONIOX_SAMPLE_RATE / SONIOX_NUM_CHANNELS) — the worklet's output must
 * always match what we tell Soniox we're sending.
 */

/** Output sample rate the AudioWorklet resamples to — must match Soniox. */
export const TARGET_SAMPLE_RATE = 16_000;

/**
 * Size (in ms) of each PCM chunk posted from the worklet to the main
 * thread / sent over the WebSocket. Smaller = lower latency, higher
 * overhead. Starting value per .clinerules section 4 — tune experimentally.
 */
export const CHUNK_DURATION_MS = 100;

/** Path (served from `public/`) to the AudioWorklet module. */
export const PCM_RECORDER_WORKLET_URL = "/worklets/pcm-recorder-worklet.js";

/** Name the worklet module registers itself under via `registerProcessor`. */
export const PCM_RECORDER_PROCESSOR_NAME = "pcm-recorder";

/**
 * Noise gate ("sensitivity slider") tuning constants.
 *
 * The gate runs INSIDE the AudioWorklet (`public/worklets/pcm-recorder-worklet.js`),
 * before resampling, so it adds zero extra hops/latency to the audio path.
 * The slider's 0..1 "amount" is sent to the worklet as a live `AudioParam`
 * (see `NOISE_GATE_PARAM_NAME`) and mapped to a dB threshold there.
 *
 * IMPORTANT: `NOISE_GATE_MIN_THRESHOLD_DB`, `NOISE_GATE_MAX_THRESHOLD_DB` and
 * `NOISE_GATE_PARAM_NAME` are duplicated as plain-JS constants inside the
 * worklet file (which cannot import from `src/`, see its top-of-file
 * comment) — keep both in sync if you tune these values.
 */

/** Name of the AudioParam the worklet exposes for live threshold control. */
export const NOISE_GATE_PARAM_NAME = "noiseGateAmount";

/** Default slider value — gate fully open (bypassed), i.e. today's behavior. */
export const DEFAULT_NOISE_GATE_AMOUNT = 0;

/** dB threshold when the slider is barely above 0 — gentle gating. */
export const NOISE_GATE_MIN_THRESHOLD_DB = -50;

/**
 * dB threshold when the slider is at its max — aggressive gating.
 *
 * Widened from -18 to -8 dB (2026-07) to cover noisy venues (e.g. a pub
 * with background chatter/music), where the ambient noise floor picked up
 * by a lav mic can sit well above what a quieter home/TV background
 * produces. -18 dB was tuned against a home TV background and left no
 * headroom for louder rooms — at 100% slider the gate would never close.
 * Recalibrate live against the level meter, not against a remembered
 * slider position, since the same % now maps to a different dB value.
 */
export const NOISE_GATE_MAX_THRESHOLD_DB = -8;


/** Maps a slider amount (0..1) to the dB threshold the worklet gate uses. */
export function noiseGateAmountToThresholdDb(amount: number): number {
  const clamped = Math.min(Math.max(amount, 0), 1);
  return (
    NOISE_GATE_MIN_THRESHOLD_DB +
    clamped * (NOISE_GATE_MAX_THRESHOLD_DB - NOISE_GATE_MIN_THRESHOLD_DB)
  );
}

/**
 * Inverse of `noiseGateAmountToThresholdDb` — maps an arbitrary dB level
 * (typically the live mic envelope) onto the slider's 0..1 amount scale, so
 * the live level indicator can be positioned directly on the same track as
 * the threshold thumb (rather than a separately-scaled meter).
 */
export function dbToNoiseGateAmount(db: number): number {
  const clamped = Math.min(
    Math.max(db, NOISE_GATE_MIN_THRESHOLD_DB),
    NOISE_GATE_MAX_THRESHOLD_DB,
  );
  return (
    (clamped - NOISE_GATE_MIN_THRESHOLD_DB) /
    (NOISE_GATE_MAX_THRESHOLD_DB - NOISE_GATE_MIN_THRESHOLD_DB)
  );
}


/** dB range the live mic-level meter visualizes (below MIN = shown as silence). */
export const NOISE_GATE_LEVEL_METER_MIN_DB = -60;
export const NOISE_GATE_LEVEL_METER_MAX_DB = -6;

/** Maps a dB level (mic envelope or gate threshold) to a 0..100 meter percent. */
export function dbToMeterPercent(db: number): number {
  const clamped = Math.min(
    Math.max(db, NOISE_GATE_LEVEL_METER_MIN_DB),
    NOISE_GATE_LEVEL_METER_MAX_DB,
  );
  return (
    ((clamped - NOISE_GATE_LEVEL_METER_MIN_DB) /
      (NOISE_GATE_LEVEL_METER_MAX_DB - NOISE_GATE_LEVEL_METER_MIN_DB)) *
    100
  );
}

