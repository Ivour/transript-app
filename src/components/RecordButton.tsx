import { Mic, Square } from "lucide-react";
import { cn } from "../lib/cn";
import type { TranscriptionStatus } from "../hooks/useSonioxTranscription";

interface RecordButtonProps {
  status: TranscriptionStatus;
  onStart: () => void;
  onStop: () => void;
}

/**
 * Start/stop control for the live transcription session. `onStart` must be
 * called synchronously from this button's click handler — the underlying
 * AudioContext needs a user gesture to start on iOS Safari (see .clinerules
 * section 5). Do not wrap this in an async pre-check before calling start.
 */
export default function RecordButton({
  status,
  onStart,
  onStop,
}: RecordButtonProps) {
  const isActive =
    status === "connecting" || status === "recording" || status === "stopping";

  return (
    <button
      type="button"
      onClick={isActive ? onStop : onStart}
      disabled={status === "connecting" || status === "stopping"}
      className={cn(
        "flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg transition",
        "disabled:cursor-not-allowed disabled:opacity-70",
        isActive ? "bg-rose-600 hover:bg-rose-500" : "bg-slate-900 hover:bg-slate-800",
      )}
      aria-label={isActive ? "Zastavit přepis" : "Spustit přepis"}
    >
      {isActive ? <Square size={24} /> : <Mic size={24} />}
    </button>
  );
}
