import { SPEAKER_COLORS, type TranscriptState } from "../lib/transcript";
import { cn } from "../lib/cn";

interface TranscriptViewProps {
  transcript: TranscriptState;
}

/**
 * Renders diarized transcript segments as speaker-labeled bubbles. Final
 * text is rendered solid; the still-volatile non-final tail is rendered
 * lighter (see .clinerules section 6). Nothing here persists — it's a pure
 * view over in-memory state.
 */
export default function TranscriptView({ transcript }: TranscriptViewProps) {
  if (transcript.segments.length === 0) {
    return (
      <p className="text-center text-slate-400">
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
        const colorClass = speaker
          ? SPEAKER_COLORS[speaker.colorIndex]
          : "text-slate-700";

        if (!segment.finalText && !segment.nonFinalText) {
          return null;
        }

        return (
          <div
            key={segment.id}
            className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100"
          >
            {speaker && (
              <p className={cn("mb-1 text-xs font-semibold", colorClass)}>
                {speaker.label}
              </p>
            )}
            <p className="text-base leading-relaxed">
              <span className="text-slate-900">{segment.finalText}</span>
              {segment.nonFinalText && (
                <span className="text-slate-400">
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
