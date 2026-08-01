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
 *
 * Styled as a physical tape-deck REC button: a raised bezel that presses
 * down (active:translate-y) when engaged, with a pulsing dot while live.
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
        "relative flex h-16 w-16 items-center justify-center rounded-full border-2 text-white shadow-[3px_3px_0_0_var(--border)] transition",
        "disabled:cursor-not-allowed disabled:opacity-70",
        "active:translate-y-0.5 active:shadow-none",
        isActive
          ? "border-border bg-rec hover:bg-rec/90"
          : "border-border bg-primary hover:bg-primary/90",
      )}
      aria-label={
        isConnecting
          ? "Připojování — ještě nemluv"
          : isActive
            ? "Zastavit přepis"
            : "Spustit přepis"
      }
    >
      {status === "recording" && (
        <span className="absolute -top-1 -right-1 flex size-3">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-rec-foreground opacity-75" />
          <span className="relative inline-flex size-3 rounded-full bg-rec-foreground ring-2 ring-rec" />
        </span>
      )}
      {isConnecting ? (
        <Loader2 size={24} className="animate-spin" />
      ) : isActive ? (
        <Square size={22} fill="currentColor" />
      ) : (
        <Mic size={24} />
      )}
    </button>
  );
}
