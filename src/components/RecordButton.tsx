import { Loader2, Mic, Square } from "lucide-react";
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
 *
 * While `status === "connecting"` (Soniox temporary-key fetch + WS
 * handshake still in flight), the mic is already capturing but transcript
 * tokens haven't started arriving yet — a spinner communicates "hang on,
 * don't talk yet" instead of looking identical to the active "recording"
 * state.
 */
export default function RecordButton({
  status,
  onStart,
  onStop,
}: RecordButtonProps) {
  const isConnecting = status === "connecting";
  const isActive = isConnecting || status === "recording" || status === "stopping";

  return (
    <button
      type="button"
      onClick={isActive ? onStop : onStart}
      disabled={isConnecting || status === "stopping"}
      className={cn(
        "flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-full text-[17px]/6 font-semibold transition-transform active:scale-[.98]",
        "focus-ring",
        "disabled:cursor-not-allowed disabled:opacity-70",
        isActive ? "bg-live text-on-live" : "bg-brand text-on-brand",
      )}
      aria-label={
        isConnecting
          ? "Připojování — ještě nemluv"
          : isActive
            ? "Zastavit přepis"
            : "Spustit přepis"
      }
    >
      {isConnecting ? (
        <Loader2 className="size-5 animate-spin" />
      ) : isActive ? (
        <>
          <Square className="size-5" fill="currentColor" strokeWidth={0} />
          Stop
        </>
      ) : (
        <>
          <Mic className="size-5" />
          Start
        </>
      )}
    </button>
  );
}
