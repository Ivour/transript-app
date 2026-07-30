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
// slider — see section below), then turn it into 16 kHz mono 16-bit signed
// little-endian PCM, buffered into small chunks and posted to the main
// thread for sending to Soniox over the WebSocket.
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
const NOISE_GATE_MAX_THRESHOLD_DB = -18;
/** Gap (dB) between the open and close thresholds — prevents rapid on/off chatter right at the boundary. */
const GATE_HYSTERESIS_DB = 6;
/** Envelope follower time constants — detection only, not applied to audio directly. */
const ENVELOPE_ATTACK_MS = 5;
const ENVELOPE_RELEASE_MS = 150;
/** Gain smoothing time constants — applied to audio, tuned to avoid clicks/word-clipping. */
const GAIN_ATTACK_MS = 10;
const GAIN_RELEASE_MS = 200;
const SILENCE_FLOOR_DB = -100;
/** How often (ms) the current mic envelope is reported to the main thread for the UI level meter. */
const LEVEL_REPORT_INTERVAL_MS = 100;

class LinearResampler {
  constructor(sourceSampleRate, targetSampleRate) {
    this.ratio = sourceSampleRate / targetSampleRate;
    this.leftover = new Float32Array(0);
    this.fracPos = 0;
  }

  /**
   * Resamples one input block. Carries fractional position + leftover
   * source samples across calls so output stays continuous across the
   * AudioWorklet's fixed 128-frame `process()` blocks.
   */
  process(input) {
    const combined = new Float32Array(this.leftover.length + input.length);
    combined.set(this.leftover, 0);
    combined.set(input, this.leftover.length);

    const output = [];
    let pos = this.fracPos;

    while (Math.floor(pos) + 1 < combined.length) {
      const i0 = Math.floor(pos);
      const frac = pos - i0;
      const a = combined[i0];
      const b = combined[i0 + 1];
      output.push(a + (b - a) * frac);
      pos += this.ratio;
    }

    const leftoverStart = Math.min(Math.floor(pos), combined.length);
    this.leftover = combined.slice(leftoverStart);
    this.fracPos = pos - leftoverStart;

    return Float32Array.from(output);
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

    // `sampleRate` is a global provided by AudioWorkletGlobalScope — the
    // AudioContext's actual native rate (fixed by the browser/OS).
    this.resampler = new LinearResampler(sampleRate, targetSampleRate);
    this.chunkSize = Math.round((targetSampleRate * chunkDurationMs) / 1000);
    this.buffer = new Float32Array(this.chunkSize);
    this.bufferLength = 0;

    // Noise gate state.
    this.envelopeDb = SILENCE_FLOOR_DB;
    this.gateGain = 1;
    this.gateOpen = true;
    this.levelReportAccumMs = 0;
    this.sampleDurationMs = (1 / sampleRate) * 1000;
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

    const output = new Float32Array(input.length);
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
        const pcm = floatTo16BitPCM(this.buffer);
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
