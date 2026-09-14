import { type TranscriptState } from "../lib/transcript";
import { Badge } from "@/components/ui/badge";

interface TranscriptViewProps {
  transcript: TranscriptState;
}

const BADGE_VARIANTS = [
  "sky",
  "emerald",
  "amber",
  "fuchsia",
  "rose",
  "indigo",
] as const;

/**
 * Renders diarized transcript segments as speaker-labeled bubbles. Final
 * text is rendered solid (darkest); the still-volatile non-final tail is
 * rendered in a slightly muted but still highly readable shade — most
 * reading happens on the live non-final edge, so it must stay legible, not
 * washed out (see .clinerules section 6). Nothing here persists — it's a
 * pure view over in-memory state.
 */
export default function TranscriptView({ transcript }: TranscriptViewProps) {
  if (transcript.segments.length === 0) {
    return (
      <p className="text-center text-slate-400 dark:text-slate-500">
        Přepis se zde zobrazí, jakmile začneš mluvit…
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
          ? BADGE_VARIANTS[speaker.colorIndex]
          : "slate";

        if (!segment.finalText && !segment.nonFinalText) {
          return null;
        }

        return (
          <div
            key={segment.id}
            className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800 dark:ring-slate-700"
          >
            <p
              className="leading-relaxed"
              style={{ fontSize: "var(--transcript-font-size, 18px)" }}
            >
              {speaker && (
                <Badge
                  variant={variant}
                  className="mr-2 select-none align-middle"
                >
                  {speaker.label}
                </Badge>
              )}
              <span className="text-slate-900 align-middle dark:text-slate-100">
                {segment.finalText}
              </span>
              {segment.nonFinalText && (
                <span className="text-slate-600 align-middle dark:text-slate-300">
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
