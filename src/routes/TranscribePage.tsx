import { useEffect, useRef } from "react";
import { useAuth } from "../hooks/useAuth";
import { useSonioxTranscription } from "../hooks/useSonioxTranscription";
import { useWakeLock } from "../hooks/useWakeLock";
import RecordButton from "../components/RecordButton";
import TranscriptView from "../components/TranscriptView";

/**
 * Main screen: live diarized transcription. Composes
 * `useSonioxTranscription` (audio capture + Soniox WS + transcript state)
 * with presentational components only — see .clinerules section 10.
 */
export default function TranscribePage() {
  const { user, signOut } = useAuth();
  const { status, transcript, error, audioError, start, stop } =
    useSonioxTranscription();

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
      prevScrollHeight - container.scrollTop - container.clientHeight <= threshold;

    if (wasNearBottom) {
      container.scrollTop = container.scrollHeight;
    }

    prevScrollHeightRef.current = container.scrollHeight;
  }, [transcript]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <span className="text-sm text-slate-500">{user?.email}</span>
        <button
          type="button"
          onClick={() => void signOut()}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          Odhlásit se
        </button>
      </header>

      <main ref={mainContainerRef} className="flex-1 overflow-y-auto p-4 pb-32">
        <TranscriptView transcript={transcript} />
      </main>

      <footer className="fixed inset-x-0 bottom-0 flex flex-col items-center gap-2 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent p-6">
        {(error || audioError) && (
          <p className="max-w-sm text-center text-sm text-rose-600">
            {audioError?.isPermissionDenied
              ? "Přístup k mikrofonu byl zamítnut. Povol ho v nastavení prohlížeče."
              : error || audioError?.message}
          </p>
        )}
        <RecordButton status={status} onStart={start} onStop={stop} />
      </footer>
    </div>
  );
}
