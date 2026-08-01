import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../hooks/useAuth";
import { useSonioxTranscription } from "../hooks/useSonioxTranscription";
import { useWakeLock } from "../hooks/useWakeLock";
import RecordButton from "../components/RecordButton";
import TranscriptView from "../components/TranscriptView";
import SensitivitySlider from "../components/SensitivitySlider";
import { Button } from "@/components/ui/button";
import { BarChart2, LogOut, Disc3 } from "lucide-react";
import { DEFAULT_NOISE_GATE_AMOUNT } from "../audio/constants";

/**
 * Main screen: live diarized transcription. Composes
 * `useSonioxTranscription` (audio capture + Soniox WS + transcript state)
 * with presentational components only — see .clinerules section 10.
 */
export default function TranscribePage() {
  const { signOut } = useAuth();
  const {
    status,
    transcript,
    error,
    audioError,
    start,
    stop,
    micLevelDb,
    setNoiseGateAmount,
  } = useSonioxTranscription();

  // Intentionally NOT persisted (localStorage/etc.) — resets to "off" on
  // every fresh page load, per product decision.
  const [noiseGateAmount, setNoiseGateAmountState] = useState(
    DEFAULT_NOISE_GATE_AMOUNT,
  );

  const handleNoiseGateAmountChange = (amount: number) => {
    setNoiseGateAmountState(amount);
    setNoiseGateAmount(amount);
  };

  const mainContainerRef = useRef<HTMLElement | null>(null);
  const prevScrollHeightRef = useRef<number>(0);

  const isLive = status === "connecting" || status === "recording";
  useWakeLock(isLive);

  // Smart Auto-Scroll: scroll to bottom when new transcripts arrive,
  // but only if the user was already near the bottom of the previous content height (threshold 150px).
  useEffect(() => {
    const container = mainContainerRef.current;
    if (!container) return;

    const prevScrollHeight = prevScrollHeightRef.current;
    const threshold = 150;
    const wasNearBottom =
      prevScrollHeight === 0 ||
      prevScrollHeight - container.scrollTop - container.clientHeight <=
        threshold;

    if (wasNearBottom) {
      container.scrollTop = container.scrollHeight;
    }

    prevScrollHeightRef.current = container.scrollHeight;
  }, [transcript]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="flex items-center justify-between border-b-2 border-border bg-tape px-4 py-3 text-tape-foreground">
        <div className="flex shrink-0 items-center gap-2">
          <Disc3 className="size-6" />
          <span className="font-display text-sm font-bold tracking-widest uppercase">
            REC·001
          </span>
          {isLive && (
            <span className="flex items-center gap-1 font-display text-[10px] font-bold tracking-widest text-rec uppercase">
              <span className="size-1.5 animate-pulse rounded-full bg-rec" />
              live
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Link to="/usage">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Statistiky využití"
              title="Statistiky využití"
              className="text-tape-foreground hover:bg-tape-foreground/10 hover:text-tape-foreground"
            >
              <BarChart2 className="size-4" />
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void signOut()}
            aria-label="Odhlásit se"
            title="Odhlásit se"
            className="text-tape-foreground hover:bg-tape-foreground/10 hover:text-tape-foreground"
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      <main ref={mainContainerRef} className="flex-1 overflow-y-auto p-4 pb-32">
        <TranscriptView transcript={transcript} />
      </main>

      <footer className="fixed inset-x-0 bottom-0 flex flex-col items-center gap-2 bg-gradient-to-t from-background via-background to-transparent p-6">
        {(error || audioError) && (
          <p className="max-w-sm rounded-sm border-2 border-border bg-card px-3 py-1.5 text-center text-sm text-destructive shadow-hard-sm">
            {audioError?.isPermissionDenied
              ? "Přístup k mikrofonu byl zamítnut. Povol ho v nastavení prohlížeče."
              : error || audioError?.message}
          </p>
        )}
        <div className="flex w-full max-w-sm items-center gap-4">
          <SensitivitySlider
            amount={noiseGateAmount}
            onAmountChange={handleNoiseGateAmountChange}
            micLevelDb={micLevelDb}
          />
          <div className="shrink-0">
            <RecordButton status={status} onStart={start} onStop={stop} />
          </div>
        </div>
      </footer>
    </div>
  );
}
