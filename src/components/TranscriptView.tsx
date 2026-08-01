import { type TranscriptState } from "../lib/transcript";
import { Badge } from "@/components/ui/badge";

interface TranscriptViewProps {
  transcript: TranscriptState;
}

const BADGE_VARIANTS = [
  "teal",
  "olive",
  "mustard",
  "plum",
  "rust",
  "ochre",
] as const;

/**
 * Renders diarized transcript segments as speaker-labeled bubbles. Final
 * text is rendered solid; the still-volatile non-final tail is rendered
 * lighter (see .clinerules section 6). Nothing here persists — it's a pure
 * view over in-memory state.
 */
export default function TranscriptView({ transcript }: TranscriptViewProps) {
  if (transcript.segments.length === 0) {
    return (
      <p className="text-center font-display text-sm tracking-wide text-muted-foreground">
        ▸ Přepis se zde zobrazí, jakmile začneš mluvit…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {transcript.segments.map((segment) => {
        const speaker = segment.speakerId
          ? transcript.speakers[segment.speakerId]
          : null;
        const variant = speaker
          ? BADGE_VARIANTS[speaker.colorIndex % BADGE_VARIANTS.length]
          : "slate";

        if (!segment.finalText && !segment.nonFinalText) {
          return null;
        }

        return (
          <div
            key={segment.id}
            className="rounded-md border-2 border-border bg-card p-3 shadow-hard-sm"
          >
            <p className="text-base leading-relaxed">
              {speaker && (
                <Badge
                  variant={variant}
                  className="mr-2 select-none align-middle"
                >
                  {speaker.label}
                </Badge>
              )}
              <span className="align-middle text-card-foreground">
                {segment.finalText}
              </span>
              {segment.nonFinalText && (
                <span className="align-middle text-muted-foreground italic">
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
