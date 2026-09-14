import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../hooks/useAuth";
import { useSonioxTranscription } from "../hooks/useSonioxTranscription";
import { useWakeLock } from "../hooks/useWakeLock";
import { useDarkMode } from "../hooks/useDarkMode";
import RecordButton from "../components/RecordButton";
import TranscriptView from "../components/TranscriptView";
import SensitivitySlider from "../components/SensitivitySlider";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { BarChart2, LogOut, Moon, Sun, TentTree } from "lucide-react";
import { DEFAULT_NOISE_GATE_AMOUNT } from "../audio/constants";
import { cn } from "../lib/cn";

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

  // Session-only — always starts in light mode, never persisted (see
  // useDarkMode / .clinerules).
  const { isDarkMode, toggleDarkMode } = useDarkMode();

  const mainContainerRef = useRef<HTMLElement | null>(null);
  const prevScrollHeightRef = useRef<number>(0);

  useWakeLock(status === "connecting" || status === "recording");

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
    <div className={cn(isDarkMode && "dark")}>
      <div className="flex h-dvh flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex shrink-0 items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <TentTree className="size-6" />
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <Link to="/usage">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Historie a statistiky využití"
                title="Statistiky využití"
              >
                <BarChart2 className="size-4 text-slate-600 dark:text-slate-300" />
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void signOut()}
              aria-label="Odhlásit se"
              title="Odhlásit se"
            >
              <LogOut className="size-4 text-slate-600 dark:text-slate-300" />
            </Button>
          </div>
        </header>

        <main
          ref={mainContainerRef}
          className="flex-1 overflow-y-auto p-4 pb-32"
        >
          <TranscriptView transcript={transcript} />
        </main>

        <footer className="fixed inset-x-0 bottom-0 flex flex-col items-center gap-2 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent p-6 dark:from-slate-950 dark:via-slate-950">
          {(error || audioError) && (
            <p className="max-w-sm text-center text-sm text-rose-600 dark:text-rose-400">
              {audioError?.isPermissionDenied
                ? "Přístup k mikrofonu byl zamítnut. Povol ho v nastavení prohlížeče."
                : error || audioError?.message}
            </p>
          )}

          <div className="flex w-full max-w-sm items-center justify-center gap-2">
            <Sun className="size-3.5 text-slate-400 dark:text-slate-500" />
            <Switch
              size="sm"
              checked={isDarkMode}
              onCheckedChange={toggleDarkMode}
              aria-label="Přepnout tmavý režim"
            />
            <Moon className="size-3.5 text-slate-400 dark:text-slate-500" />
          </div>

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
    </div>
  );
}
