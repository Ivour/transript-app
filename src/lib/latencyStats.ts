/**
 * Live latency diagnostics for the test build (shown in `TuningPanel`).
 * Pure logic with an injected clock (callers pass `performance.now()`), so it
 * can be exercised in Node with fake times. Nothing is stored or sent
 * anywhere; a fresh tracker is created for every session.
 *
 * Idea: Soniox timestamps tokens in audio time (ms since the first audio we
 * sent). Chunks leave the worklet in real time, so audio time `E` happened at
 * wall-clock `anchor + E`. Then "how late did the text show up" is simply
 * `now - anchor - E` for the newest word. The anchor is the minimum of
 * `arrival - position` over all chunks: arrivals can only be late (main
 * thread busy), never early, so the least-delayed chunk gives the best
 * estimate. Not included: mic/OS input latency and the screen refresh after
 * React renders (both small and constant), so absolute numbers are a bit
 * optimistic, but A/B differences between settings are reliable.
 */

/** How many recent samples the median/p90 are computed from. */
const WINDOW_SAMPLES = 40;

/** A main-thread stall: a chunk arrived this much later than its nominal slot. */
const STALL_EXTRA_GAP_MS = 100;

export interface LatencySummary {
  median: number;
  p90: number;
  count: number;
}

export interface LatencySnapshot {
  /** Word spoken -> its (non-final) text first visible. Priority 1. */
  wordToTextMs: LatencySummary | null;
  /** Word's text first visible as final ("blackened"), measured from the word's end. */
  wordToFinalMs: LatencySummary | null;
  /**
   * Audio captured so far minus audio Soniox reports as processed
   * (`total_audio_proc_ms`). Small = Soniox keeps up with the mic; large =
   * the network/our sending is the bottleneck, not the model.
   */
  serverLagMs: number | null;
  /** Chunks that reached the main thread late by more than STALL_EXTRA_GAP_MS. */
  stalls: number;
  /** Longest gap between two consecutive chunks (nominal = chunk size). */
  maxChunkGapMs: number;
  /** Tap on Start -> session config sent to Soniox. */
  connectMs: number | null;
}

export interface LatencyToken {
  is_final: boolean;
  end_ms?: number;
}

class RollingSamples {
  private values: number[] = [];

  push(value: number) {
    this.values.push(value);
    if (this.values.length > WINDOW_SAMPLES) this.values.shift();
  }

  summary(): LatencySummary | null {
    if (this.values.length === 0) return null;
    const sorted = [...this.values].sort((a, b) => a - b);
    const at = (fraction: number) =>
      sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
    return { median: at(0.5), p90: at(0.9), count: sorted.length };
  }
}

export class SessionLatencyTracker {
  private readonly chunkMs: number;
  private readonly startedAt: number;
  private chunkCount = 0;
  private anchor = Infinity;
  private lastChunkAt: number | null = null;
  private stalls = 0;
  private maxChunkGapMs = 0;
  private maxEndSeen = -1;
  private maxFinalEndSeen = -1;
  private connectMs: number | null = null;
  private serverLagMs: number | null = null;
  private readonly wordToText = new RollingSamples();
  private readonly wordToFinal = new RollingSamples();

  constructor(chunkMs: number, startedAt: number) {
    this.chunkMs = chunkMs;
    this.startedAt = startedAt;
  }

  onConfigSent(now: number) {
    this.connectMs = now - this.startedAt;
  }

  /** Call for every PCM chunk that reaches the main thread. */
  onChunk(now: number) {
    this.chunkCount++;
    this.anchor = Math.min(this.anchor, now - this.chunkCount * this.chunkMs);

    if (this.lastChunkAt !== null) {
      const gap = now - this.lastChunkAt;
      this.maxChunkGapMs = Math.max(this.maxChunkGapMs, gap);
      if (gap > this.chunkMs + STALL_EXTRA_GAP_MS) this.stalls++;
    }
    this.lastChunkAt = now;
  }

  /** Call for every Soniox message (tokens without `<end>` markers). */
  onMessage(
    now: number,
    tokens: readonly LatencyToken[],
    totalAudioProcMs: number | undefined,
  ) {
    if (this.chunkCount === 0) return;

    if (totalAudioProcMs !== undefined) {
      this.serverLagMs = Math.max(
        0,
        this.chunkCount * this.chunkMs - totalAudioProcMs,
      );
    }

    let maxEnd = -1;
    let maxFinalEnd = -1;
    for (const token of tokens) {
      if (token.end_ms === undefined) continue;
      maxEnd = Math.max(maxEnd, token.end_ms);
      if (token.is_final) maxFinalEnd = Math.max(maxFinalEnd, token.end_ms);
    }

    // Only the frontier moving forward counts: a message that merely
    // re-sends the same words says nothing about how fast new ones appear.
    if (maxEnd > this.maxEndSeen) {
      this.maxEndSeen = maxEnd;
      this.wordToText.push(Math.max(0, now - this.anchor - maxEnd));
    }
    if (maxFinalEnd > this.maxFinalEndSeen) {
      this.maxFinalEndSeen = maxFinalEnd;
      this.wordToFinal.push(Math.max(0, now - this.anchor - maxFinalEnd));
    }
  }

  snapshot(): LatencySnapshot {
    return {
      wordToTextMs: this.wordToText.summary(),
      wordToFinalMs: this.wordToFinal.summary(),
      serverLagMs: this.serverLagMs,
      stalls: this.stalls,
      maxChunkGapMs: this.maxChunkGapMs,
      connectMs: this.connectMs,
    };
  }
}
