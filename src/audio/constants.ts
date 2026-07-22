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
