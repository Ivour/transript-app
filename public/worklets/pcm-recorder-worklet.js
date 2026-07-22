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
// .clinerules section 4 & 5) and turn it into 16 kHz mono 16-bit signed
// little-endian PCM, buffered into small chunks and posted to the main
// thread for sending to Soniox over the WebSocket.

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

class PcmRecorderProcessor extends AudioWorkletProcessor {
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
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input || input.length === 0) {
      return true;
    }

    const resampled = this.resampler.process(input);

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
