// Plain JavaScript on purpose — AudioWorklet modules are loaded via
// `audioContext.audioWorklet.addModule(url)`, which fetches this file
// directly as an ES module in AudioWorkletGlobalScope. It lives in
// `public/` (not `src/`) so Vite serves/copies it verbatim in both dev and
// prod, sidestepping any uncertainty about whether the bundler transforms
// TypeScript/ES modules correctly inside a worklet context. Keep this file
// self-contained — it cannot `import` anything from `src/`.
//
// Responsibility: take native mic audio (whatever sample rate iOS/the
// browser hands us — typically 48 kHz, NOT reliably configurable, see
// .clinerules section 4 & 5), optionally apply a noise gate ("sensitivity"
// slider — see section below), then turn it into mono PCM at the target
// sample rate/encoding requested via `processorOptions` (16 kHz
// `pcm_s16le` by default, or 8 kHz `pcm_mulaw` in "low bandwidth" mode —
// see AUDIO_QUALITY_* in src/audio/constants.ts), buffered into small
// chunks and posted to the main thread for sending to Soniox over the
// WebSocket.
//
// --- Noise gate ("sensitivity" slider) -------------------------------
// Runs on the raw native-rate input, BEFORE resampling — adds zero extra
// hops to the audio path, so it has no impact on end-to-end latency. Its
// only job: attenuate audio picked up by the mic (e.g. a quieter TV in the
// background, distinct from the main close/lav-mic speaker) below a
// threshold derived from the `noiseGateAmount` AudioParam (0 = bypassed,
// exactly today's behavior; 1 = aggressive gating). The threshold is
// applied to a smoothed envelope of the signal (not raw samples) with a
// fast attack / slow release, plus hysteresis between open/close
// thresholds, so the gate opens instantly on speech onset but doesn't chop
// word tails or chatter at the threshold boundary. This is NOT a Soniox
// setting and does not touch diarization — it just reduces what reaches
// Soniox in the first place. `noiseGateAmount` is a k-rate AudioParam so
// the UI slider can change it live, mid-recording, without any
// reconnect/message-passing round trip.
//
// The constants below mirror `NOISE_GATE_PARAM_NAME`,
// `NOISE_GATE_MIN_THRESHOLD_DB` and `NOISE_GATE_MAX_THRESHOLD_DB` in
// `src/audio/constants.ts` (this file can't import them — keep both in
// sync if you retune).

const NOISE_GATE_PARAM_NAME = "noiseGateAmount";
const NOISE_GATE_MIN_THRESHOLD_DB = -50;
// Widened from -18 to -8 dB (2026-07) to cover noisy venues (pub with
// background chatter/music) where the ambient noise floor is louder than a
// quiet home/TV background — keep in sync with src/audio/constants.ts.
const NOISE_GATE_MAX_THRESHOLD_DB = -8;
/**
 * Gap (dB) between the open and close thresholds — prevents rapid on/off
 * chatter right at the boundary. Bumped from 6 to 8 dB (2026-07) alongside
 * the wider max threshold: noisier/more variable environments (crowd
 * chatter, clinking glasses) make the envelope hover closer to the
 * threshold more often, so a bit more hysteresis buys extra stability at
 * the cost of slightly less snappy open/close reaction.
 */
const GATE_HYSTERESIS_DB = 8;

/** Envelope follower time constants — detection only, not applied to audio directly. */
const ENVELOPE_ATTACK_MS = 5;
const ENVELOPE_RELEASE_MS = 150;
/** Gain smoothing time constants — applied to audio, tuned to avoid clicks/word-clipping. */
const GAIN_ATTACK_MS = 10;
const GAIN_RELEASE_MS = 200;
const SILENCE_FLOOR_DB = -100;
/** How often (ms) the current mic envelope is reported to the main thread for the UI level meter. */
const LEVEL_REPORT_INTERVAL_MS = 100;

/**
 * Anti-aliased streaming resampler (native rate -> target rate).
 *
 * Plain linear interpolation (the previous implementation) has no low-pass
 * stage, so everything between the target Nyquist (8 kHz for 16 kHz output)
 * and the native Nyquist (24 kHz) folds back into the speech band as
 * aliasing — exactly where Czech sibilants (s/š/z/ž/c/č) live, and on top of
 * that it folds broadband ambient noise in too. This runs a windowed-sinc
 * (Blackman) FIR low-pass at the native rate first, evaluated only at the
 * output positions, then interpolates between filtered samples. For the
 * common 48 kHz -> 16 kHz case the ratio is exactly 3, so the fractional
 * part is always 0 and it's a plain polyphase decimator (one FIR per output
 * sample). Group delay is (taps - 1) / 2 native samples (~1.5 ms at 48 kHz).
 *
 * Tuning (48 kHz -> 16 kHz, 145 taps): flat (-0.2 dB) up to 7 kHz, so the
 * sibilant band survives intact; -20 dB at 8 kHz; >70 dB rejection from
 * 8.5 kHz up, so nothing audible aliases back into the speech band. A
 * shorter filter (49 taps / 0.9 cutoff) already lost -2..-8 dB across
 * 6.5-7.5 kHz. Cost is ~2.3M multiply-adds/s — negligible.
 *
 * All buffers are preallocated — `process()` runs every 128 frames on the
 * real-time audio thread, where per-block allocations cause GC pauses.
 */
const RESAMPLER_CUTOFF_RATIO = 0.95; // fraction of the target Nyquist kept
const RESAMPLER_TAPS_PER_RATIO = 48; // filter length scales with the ratio

class AntiAliasResampler {
  constructor(sourceSampleRate, targetSampleRate) {
    this.step = sourceSampleRate / targetSampleRate;

    // Odd length so the kernel is symmetric around a center tap.
    const taps = Math.ceil(this.step * RESAMPLER_TAPS_PER_RATIO) | 1;
    // Cutoff in cycles per native sample.
    const cutoff =
      (RESAMPLER_CUTOFF_RATIO * (targetSampleRate / 2)) / sourceSampleRate;
    const kernel = new Float32Array(taps);
    const center = (taps - 1) / 2;
    let sum = 0;
    for (let i = 0; i < taps; i++) {
      const x = i - center;
      const sinc =
        x === 0
          ? 2 * cutoff
          : Math.sin(2 * Math.PI * cutoff * x) / (Math.PI * x);
      const window =
        0.42 -
        0.5 * Math.cos((2 * Math.PI * i) / (taps - 1)) +
        0.08 * Math.cos((4 * Math.PI * i) / (taps - 1));
      kernel[i] = sinc * window;
      sum += kernel[i];
    }
    for (let i = 0; i < taps; i++) kernel[i] /= sum; // unity DC gain
    this.kernel = kernel;
    this.taps = taps;

    // [history (taps samples) | current input block]. Grown on demand if a
    // browser ever hands us blocks larger than the usual 128 frames.
    this.history = taps;
    this.work = new Float32Array(taps + 128);
    // Next output position, in `work` coordinates. Starts at the last
    // history sample (zero-filled), so the FIR always has `taps` samples.
    this.pos = taps - 1;
    this.output = new Float32Array(Math.ceil(128 / this.step) + 2);
  }

  /** FIR output centered on `work[index]` (causal: uses index-taps+1..index). */
  filterAt(index) {
    const work = this.work;
    const kernel = this.kernel;
    let acc = 0;
    for (let k = 0, j = index; k < this.taps; k++, j--) {
      acc += kernel[k] * work[j];
    }
    return acc;
  }

  /**
   * Resamples one input block. Returns a view into an internal buffer,
   * valid only until the next call.
   */
  process(input) {
    const history = this.history;
    const length = history + input.length;
    if (this.work.length < length) {
      const grown = new Float32Array(length);
      grown.set(this.work.subarray(0, history));
      this.work = grown;
      this.output = new Float32Array(Math.ceil(input.length / this.step) + 2);
    }
    const work = this.work;
    work.set(input, history);

    const output = this.output;
    let count = 0;
    let pos = this.pos;
    while (Math.floor(pos) + 1 < length) {
      const i0 = Math.floor(pos);
      const frac = pos - i0;
      const y0 = this.filterAt(i0);
      output[count++] = frac === 0 ? y0 : y0 + (this.filterAt(i0 + 1) - y0) * frac;
      pos += this.step;
    }

    // Keep the last `history` samples for the next block's FIR window.
    const shift = length - history;
    work.copyWithin(0, shift, length);
    this.pos = pos - shift;

    return output.subarray(0, count);
  }
}

function floatTo16BitPCM(input) {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < input.length; i++) {
    const clamped = Math.max(-1, Math.min(1, input[i]));
    const value = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(i * 2, value, /* littleEndian */ true);
  }
  return buffer;
}

// --- mu-law (G.711) encoding — "low bandwidth" quality mode ------------
// Standard telephony companding codec: 8-bit samples instead of 16-bit,
// i.e. half the bytes per sample on top of the lower 8 kHz sample rate
// used in low-bandwidth mode (see AUDIO_QUALITY_FORMAT/AUDIO_QUALITY_SAMPLE_RATE
// in src/audio/constants.ts) — together roughly a 4x bitrate reduction vs.
// the default 16-bit/16kHz PCM. Textbook encode table implementation
// (BIAS/CLIP/exponent table), operating directly on Float32 samples
// scaled to the 16-bit signed range instead of routing through
// floatTo16BitPCM first.
const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32635;
const MULAW_ENCODE_EXPONENT_TABLE = (() => {
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let exponent = 7;
    for (let bit = 0x80; (i & bit) === 0 && exponent > 0; bit >>= 1) {
      exponent--;
    }
    table[i] = exponent;
  }
  return table;
})();

function linearToMulawSample(sample) {
  let sign = (sample >> 8) & 0x80;
  if (sign !== 0) sample = -sample;
  sample += MULAW_BIAS;
  if (sample > MULAW_CLIP) sample = MULAW_CLIP;
  const exponent = MULAW_ENCODE_EXPONENT_TABLE[(sample >> 7) & 0xff];
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

function floatToMulaw(input) {
  const buffer = new ArrayBuffer(input.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < input.length; i++) {
    const clamped = Math.max(-1, Math.min(1, input[i]));
    const value = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view[i] = linearToMulawSample(value | 0);
  }
  return buffer;
}

/** RMS amplitude of a block, converted to dBFS (clamped at SILENCE_FLOOR_DB). */
function computeBlockAmplitudeDb(input) {
  let sumSquares = 0;
  for (let i = 0; i < input.length; i++) {
    sumSquares += input[i] * input[i];
  }
  const rms = Math.sqrt(sumSquares / input.length);
  if (!(rms > 0)) return SILENCE_FLOOR_DB;
  return Math.max(20 * Math.log10(rms), SILENCE_FLOOR_DB);
}

/** One-pole smoothing coefficient for a given time constant and elapsed time (both ms). */
function oneEuroAlpha(tauMs, elapsedMs) {
  return 1 - Math.exp(-elapsedMs / tauMs);
}

class PcmRecorderProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: NOISE_GATE_PARAM_NAME,
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        // k-rate: one value per render quantum, settable live from the
        // main thread via `AudioParam.value` — no message-passing latency.
        automationRate: "k-rate",
      },
    ];
  }

  constructor(options) {
    super();
    const processorOptions = (options && options.processorOptions) || {};
    const targetSampleRate = processorOptions.targetSampleRate || 16000;
    const chunkDurationMs = processorOptions.chunkDurationMs || 100;
    // "pcm_s16le" (default) or "pcm_mulaw" ("low bandwidth" quality mode —
    // see AUDIO_QUALITY_FORMAT in src/audio/constants.ts). Only affects
    // which encode function `process()` calls below — `chunkSize` is
    // counted in samples, not bytes, so it's unaffected by the format's
    // bytes-per-sample (1 for mulaw, 2 for s16le).
    this.audioFormat = processorOptions.audioFormat || "pcm_s16le";

    // `sampleRate` is a global provided by AudioWorkletGlobalScope — the
    // AudioContext's actual native rate (fixed by the browser/OS).
    this.resampler = new AntiAliasResampler(sampleRate, targetSampleRate);
    this.chunkSize = Math.round((targetSampleRate * chunkDurationMs) / 1000);
    this.buffer = new Float32Array(this.chunkSize);
    this.bufferLength = 0;

    // Noise gate state.
    this.envelopeDb = SILENCE_FLOOR_DB;
    this.gateGain = 1;
    this.gateOpen = true;
    this.levelReportAccumMs = 0;
    this.sampleDurationMs = (1 / sampleRate) * 1000;
    // Preallocated gate output (grown on demand) — no per-block allocation.
    this.gatedBuffer = new Float32Array(128);
  }

  /**
   * Updates the envelope follower + gate state for one native-rate block
   * and returns the (possibly attenuated) samples. Runs unconditionally
   * (even at amount === 0) so the level meter keeps working for
   * calibration, but skips gain smoothing entirely when bypassed so
   * amount === 0 is byte-for-byte identical to the pre-gate behavior.
   */
  applyNoiseGate(input, amount) {
    const blockDurationMs = input.length * this.sampleDurationMs;
    const blockDb = computeBlockAmplitudeDb(input);

    // Envelope follower: fast attack (react quickly to speech onset), slow
    // release (a brief dip inside a word shouldn't look like silence).
    const envelopeTau =
      blockDb > this.envelopeDb ? ENVELOPE_ATTACK_MS : ENVELOPE_RELEASE_MS;
    this.envelopeDb +=
      (blockDb - this.envelopeDb) * oneEuroAlpha(envelopeTau, blockDurationMs);

    this.levelReportAccumMs += blockDurationMs;
    if (this.levelReportAccumMs >= LEVEL_REPORT_INTERVAL_MS) {
      this.levelReportAccumMs = 0;
      // Non-transferable plain object — distinguishable on the main thread
      // from the transferred ArrayBuffer PCM chunks (see onmessage there).
      this.port.postMessage({ type: "level", db: this.envelopeDb });
    }

    if (amount <= 0) {
      // Gate fully bypassed — identical to no-gate behavior.
      this.gateGain = 1;
      this.gateOpen = true;
      return input;
    }

    const openThresholdDb =
      NOISE_GATE_MIN_THRESHOLD_DB +
      amount * (NOISE_GATE_MAX_THRESHOLD_DB - NOISE_GATE_MIN_THRESHOLD_DB);
    const closeThresholdDb = openThresholdDb - GATE_HYSTERESIS_DB;

    if (this.gateOpen) {
      if (this.envelopeDb < closeThresholdDb) {
        this.gateOpen = false;
      }
    } else if (this.envelopeDb > openThresholdDb) {
      this.gateOpen = true;
    }

    const targetGain = this.gateOpen ? 1 : 0;
    const gainTau = targetGain > this.gateGain ? GAIN_ATTACK_MS : GAIN_RELEASE_MS;
    // Per-sample (not per-block) alpha — the gain ramps smoothly across
    // consecutive 128-frame blocks instead of jumping once per block,
    // avoiding audible clicks at block boundaries.
    const perSampleAlpha = oneEuroAlpha(gainTau, this.sampleDurationMs);

    if (this.gatedBuffer.length < input.length) {
      this.gatedBuffer = new Float32Array(input.length);
    }
    const output = this.gatedBuffer.subarray(0, input.length);
    let gain = this.gateGain;
    for (let i = 0; i < input.length; i++) {
      gain += (targetGain - gain) * perSampleAlpha;
      output[i] = input[i] * gain;
    }
    this.gateGain = gain;

    return output;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0] && inputs[0][0];
    if (!input || input.length === 0) {
      return true;
    }

    const noiseGateParam = parameters[NOISE_GATE_PARAM_NAME];
    const noiseGateAmount = noiseGateParam ? noiseGateParam[0] : 0;
    const gated = this.applyNoiseGate(input, noiseGateAmount);

    const resampled = this.resampler.process(gated);

    let offset = 0;
    while (offset < resampled.length) {
      const spaceLeft = this.chunkSize - this.bufferLength;
      const toCopy = Math.min(spaceLeft, resampled.length - offset);
      this.buffer.set(
        resampled.subarray(offset, offset + toCopy),
        this.bufferLength,
      );
      this.bufferLength += toCopy;
      offset += toCopy;

      if (this.bufferLength === this.chunkSize) {
        const pcm =
          this.audioFormat === "pcm_mulaw"
            ? floatToMulaw(this.buffer)
            : floatTo16BitPCM(this.buffer);
        // Transfer ownership of the buffer to the main thread — avoids a
        // copy, keeps this hot path cheap.
        this.port.postMessage(pcm, [pcm]);
        this.bufferLength = 0;
      }
    }

    return true;
  }
}

registerProcessor("pcm-recorder", PcmRecorderProcessor);
