import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../hooks/useAuth";
import { useSonioxTranscription } from "../hooks/useSonioxTranscription";
import { useWakeLock } from "../hooks/useWakeLock";
import { useDarkMode } from "../hooks/useDarkMode";
import RecordButton from "../components/RecordButton";
import TranscriptView from "../components/TranscriptView";
import SensitivitySlider from "../components/SensitivitySlider";
import FontSizeControl from "../components/FontSizeControl";
import Pill from "../components/Pill";
import TuningPanel from "../components/TuningPanel";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  BarChart2,
  LogOut,
  Moon,
  SignalHigh,
  SignalLow,
  Sun,
  TentTree,
} from "lucide-react";
import {
  DEFAULT_AUDIO_QUALITY_MODE,
  DEFAULT_NOISE_GATE_AMOUNT,
  type AudioQualityMode,
} from "../audio/constants";
import { cn } from "../lib/cn";
import { DEFAULT_TUNING, type TuningSettings } from "../lib/tuning";

const isTest = true/* import.meta.env.VITE_APP_ENV === "test"; */

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
    nativeSampleRate,
    latency,
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

  // "Weak signal" toggle — session-only, always resets to "normal" on
  // page load, same convention as dark mode/font size (see .clinerules).
  // Must be chosen BEFORE connecting: it's baked into the Soniox session
  // config and the AudioWorkletNode at construction time (see
  // useSonioxTranscription/useAudioCapture), so it's locked once a
  // session is starting/active and only editable while idle (or after an
  // error, before retrying).
  const [audioQualityMode, setAudioQualityMode] = useState<AudioQualityMode>(
    DEFAULT_AUDIO_QUALITY_MODE,
  );
  const canChangeAudioQualityMode = status === "idle" || status === "error";

  // Test-build tuning panel values (session-only, never persisted). Prod
  // always starts with DEFAULT_TUNING. Read synchronously in the tap handler.
  const [tuning, setTuning] = useState<TuningSettings>(DEFAULT_TUNING);

  const handleStart = () => {
    void start(audioQualityMode, isTest ? tuning : DEFAULT_TUNING);
  };

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
        <header className="flex items-center justify-center p-4">
          <Pill className="w-full max-w-sm justify-between py-2 pl-4 pr-2">
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
          </Pill>
        </header>

        <main
          ref={mainContainerRef}
          className={cn(
            "flex-1 overflow-y-auto p-4",
            // The test build's tuning panel makes the fixed footer taller.
            isTest ? "pb-80" : "pb-48",
          )}
        >
          <TranscriptView transcript={transcript} showSpeakerId={isTest} />
        </main>

        <footer className="fixed inset-x-0 bottom-0 flex flex-col items-center gap-2 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent p-6 dark:from-slate-950 dark:via-slate-950">
          {(error || audioError) && (
            <p className="max-w-sm text-center text-sm text-rose-600 dark:text-rose-400">
              {audioError?.isPermissionDenied
                ? "Přístup k mikrofonu byl zamítnut. Povol ho v nastavení prohlížeče."
                : error || audioError?.message}
            </p>
          )}

          <Pill className="grid w-full max-w-sm grid-cols-3 items-center py-2 pl-4 pr-2">
            <div className="flex items-center gap-2.5 justify-self-start">
              <SignalHigh className="size-4 text-slate-400 dark:text-slate-500" />
              <Switch
                checked={audioQualityMode === "low_bandwidth"}
                onCheckedChange={(checked) =>
                  setAudioQualityMode(checked ? "low_bandwidth" : "normal")
                }
                disabled={!canChangeAudioQualityMode}
                aria-label="Přepnout na režim pro slabý signál (nižší kvalita zvuku, méně dat)"
                title="Musí se zapnout před spuštěním přepisu"
              />
              <SignalLow className="size-4 text-slate-400 dark:text-slate-500" />
            </div>

            <div className="flex items-center gap-2.5 justify-self-center">
              <Sun className="size-4 text-slate-400 dark:text-slate-500" />
              <Switch
                checked={isDarkMode}
                onCheckedChange={toggleDarkMode}
                aria-label="Přepnout tmavý režim"
              />
              <Moon className="size-4 text-slate-400 dark:text-slate-500" />
            </div>
            <div className="justify-self-end">
              <FontSizeControl />
            </div>
          </Pill>

          {isTest && (
            <TuningPanel
              tuning={tuning}
              onChange={setTuning}
              locked={!canChangeAudioQualityMode}
              nativeSampleRate={nativeSampleRate}
              latency={latency}
            />
          )}

          <Pill
            className={cn(
              "w-full max-w-sm gap-4 py-2 pl-4 pr-2",
              isTest && "border border-red-500",
            )}
          >
            <SensitivitySlider
              amount={noiseGateAmount}
              onAmountChange={handleNoiseGateAmountChange}
              micLevelDb={micLevelDb}
            />
            <div className="shrink-0">
              <RecordButton
                status={status}
                onStart={handleStart}
                onStop={stop}
              />
            </div>
          </Pill>
        </footer>
      </div>
    </div>
  );
}
