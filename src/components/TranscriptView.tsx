import { memo } from "react";
import { type TranscriptState } from "../lib/transcript";
import { cn } from "../lib/cn";
import LivelifeMark from "./LivelifeMark";

interface TranscriptViewProps {
  transcript: TranscriptState;
  /** Test build only: show Soniox's raw speaker id inside the card. */
  showSpeakerId?: boolean;
}

/**
 * Per-speaker card border, indexed by `Speaker.colorIndex` (cycles every 4
 * speakers, see `SPEAKER_COLORS`). Literal class names so Tailwind picks
 * them up.
 */
const SPEAKER_BORDERS = [
  "border-spk1-border",
  "border-spk2-border",
  "border-spk3-border",
  "border-spk4-border",
] as const;

/**
 * Renders diarized transcript segments as full-width cards — one card per
 * contiguous speaker run, speaker shown only by the card's border color (no
 * names/timestamps, per the livelife design). Final text is solid `ink`;
 * the still-volatile non-final tail is `ink-partial`, only a step lighter —
 * most reading happens on the live edge, so it must stay strong (see
 * .clinerules section 6).
 *
 * Memoized: the page re-renders ~10x/s for the mic level meter, the
 * transcript only needs to when `transcript` changes.
 */
function TranscriptView({
  transcript,
  showSpeakerId = false,
}: TranscriptViewProps) {
  const segments = transcript.segments.filter(
    (segment) => segment.finalText || segment.nonFinalText,
  );

  if (segments.length === 0) {
    return (
      <div className="m-auto flex flex-col items-center gap-3">
        <LivelifeMark className="h-17.5 w-24 text-brand-ink opacity-90" />
        <h2 className="mt-2 font-rounded text-empty-title text-ink">
          Řekni něco
        </h2>
      </div>
    );
  }

  return (
    <div className="mt-auto flex flex-col gap-2.5">
      {segments.map((segment) => {
        const speaker = segment.speakerId
          ? transcript.speakers[segment.speakerId]
          : null;
        const border = speaker
          ? SPEAKER_BORDERS[speaker.colorIndex % SPEAKER_BORDERS.length]
          : "border-hairline";

        return (
          <div
            key={segment.id}
            className={cn(
              "rounded-lg border-[1.5px] bg-card-bg px-4 py-3 text-ink",
              "text-[length:var(--ts,19px)] leading-[1.42] tracking-[-0.01em] wrap-anywhere",
              border,
            )}
          >
            <p>
              {showSpeakerId && segment.speakerId && (
                <span className="mr-2 align-middle text-[10px] text-ink-muted select-none">
                  id {segment.speakerId}
                </span>
              )}
              {segment.finalText}
              {segment.nonFinalText && (
                <span className="text-ink-partial">
                  {segment.finalText ? " " : ""}
                  {segment.nonFinalText}
                </span>
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export default memo(TranscriptView);
