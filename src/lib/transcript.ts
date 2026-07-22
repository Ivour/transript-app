/**
 * App-level domain types for the diarized transcript UI state.
 *
 * These are decoupled from the Soniox wire format (`src/lib/soniox.ts`) —
 * the future transcription hook maps raw Soniox tokens into this shape.
 * Nothing here is persisted; state lives only in React for the lifetime of
 * the page (see .clinerules section 6).
 */

export type SpeakerId = string;

export interface Speaker {
  id: SpeakerId;
  /** Display label, e.g. "Mluvčí 1" — assigned in order of first appearance. */
  label: string;
  /** Deterministic index into `SPEAKER_COLORS`, assigned once per speaker. */
  colorIndex: number;
}

/** A single word/token in the transcript, tagged with speaker + finality. */
export interface TranscriptToken {
  text: string;
  isFinal: boolean;
  speakerId: SpeakerId | null;
}

/**
 * Contiguous run of tokens belonging to the same speaker — the unit the UI
 * renders as a "bubble"/section. `finalText` never changes once set;
 * `nonFinalText` is the volatile tail that may still be rewritten.
 */
export interface TranscriptSegment {
  id: string;
  speakerId: SpeakerId | null;
  finalText: string;
  nonFinalText: string;
}

export interface TranscriptState {
  segments: TranscriptSegment[];
  speakers: Record<SpeakerId, Speaker>;
}

export const INITIAL_TRANSCRIPT_STATE: TranscriptState = {
  segments: [],
  speakers: {},
};

/** Tailwind text-color classes cycled deterministically per speaker. */
export const SPEAKER_COLORS = [
  "text-sky-600",
  "text-emerald-600",
  "text-amber-600",
  "text-fuchsia-600",
  "text-rose-600",
  "text-indigo-600",
] as const;
