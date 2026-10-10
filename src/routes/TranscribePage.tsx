import { useEffect, useRef, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useSonioxTranscription } from "../hooks/useSonioxTranscription";
import { useWakeLock } from "../hooks/useWakeLock";
import { useTheme } from "../hooks/useTheme";
import AppHeader from "../components/AppHeader";
import RecordButton from "../components/RecordButton";
import TranscriptView from "../components/TranscriptView";
import LevelFilter from "../components/LevelFilter";
import FontSizeControl from "../components/FontSizeControl";
import TuningPanel from "../components/TuningPanel";
import { Moon, Signal, Sun } from "lucide-react";
import {
  DEFAULT_AUDIO_QUALITY_MODE,
  DEFAULT_NOISE_GATE_AMOUNT,
  type AudioQualityMode,
} from "../audio/constants";
import { cn } from "../lib/cn";
import { DEFAULT_TUNING, type TuningSettings } from "../lib/tuning";

const isTest = import.meta.env.VITE_APP_ENV === "test";

/** Round 48px dock button (theme, weak signal). */
const roundButtonClassName =
  "grid size-12 flex-none place-items-center rounded-full bg-glass-strong text-ink focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-focus disabled:opacity-50";

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

  // Session-only — always starts dark, never persisted (see useTheme).
  const { theme, toggleTheme } = useTheme();

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

  const isLowSignal = audioQualityMode === "low_bandwidth";

  return (
    // `data-signal="low"` swaps the glass surfaces for solid ones and drops
    // the ambient glow (see `.glass` in index.css).
    <div
      className="ll-app relative h-dvh overflow-hidden text-ink"
      data-signal={isLowSignal ? "low" : "ok"}
    >
      <AppHeader onSignOut={() => void signOut()} />

      {isLowSignal && (
        <div className="pointer-events-none absolute inset-x-0 top-[calc(var(--safe-top)+--spacing(14))] z-10 flex justify-center">
          <span className="glass inline-flex h-8 items-center gap-2 rounded-full px-3 text-footnote text-warn-ink">
            <Signal className="size-4" strokeWidth={2.4} />
            Slabý signál
          </span>
        </div>
      )}

      {/* Cards sit at the bottom (TranscriptView's `mt-auto`) and scroll
          under the header and the dock; the padding keeps the newest card
          above the dock. */}
      <main
        ref={mainContainerRef}
        className={cn(
          "ll-feed flex h-full flex-col overflow-y-auto px-4 pt-[calc(var(--safe-top)+--spacing(25))]",
          // The test build's tuning panel makes the dock taller.
          isTest
            ? "pb-[calc(var(--safe-bottom)+--spacing(75))]"
            : "pb-[calc(var(--safe-bottom)+--spacing(40))]",
        )}
      >
        <TranscriptView transcript={transcript} showSpeakerId={isTest} />
      </main>

      <div className="glass absolute inset-x-3 bottom-(--dock-bottom) z-10 flex flex-col gap-2.5 rounded-xl p-3">
        {(error || audioError) && (
          <p className="px-2 text-center text-footnote text-live">
            {audioError?.isPermissionDenied
              ? "Přístup k mikrofonu byl zamítnut. Povol ho v nastavení prohlížeče."
              : error || audioError?.message}
          </p>
        )}

        {isTest && (
          <TuningPanel
            tuning={tuning}
            onChange={setTuning}
            locked={!canChangeAudioQualityMode}
            nativeSampleRate={nativeSampleRate}
            latency={latency}
          />
        )}

        <LevelFilter
          amount={noiseGateAmount}
          onAmountChange={handleNoiseGateAmountChange}
          micLevelDb={micLevelDb}
        />

        <div className="flex items-center gap-2">
          <FontSizeControl />
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={
              theme === "dark" ? "Přepnout na světlý motiv" : "Přepnout na tmavý motiv"
            }
            className={roundButtonClassName}
          >
            {theme === "dark" ? (
              <Moon className="size-5.5" />
            ) : (
              <Sun className="size-5.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() =>
              setAudioQualityMode(isLowSignal ? "normal" : "low_bandwidth")
            }
            aria-pressed={isLowSignal}
            disabled={!canChangeAudioQualityMode}
            aria-label="Režim pro slabý signál (nižší kvalita zvuku, méně dat)"
            title="Musí se zapnout před spuštěním přepisu"
            className={cn(
              roundButtonClassName,
              isLowSignal && "bg-warn text-on-warn",
            )}
          >
            <Signal className="size-5.5" strokeWidth={2.4} />
          </button>
          <RecordButton status={status} onStart={handleStart} onStop={stop} />
        </div>
      </div>
    </div>
  );
}
