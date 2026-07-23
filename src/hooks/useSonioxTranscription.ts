import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioCapture } from "./useAudioCapture";
import {
  SONIOX_AUDIO_FORMAT,
  SONIOX_LANGUAGE_HINTS,
  SONIOX_NUM_CHANNELS,
  SONIOX_SAMPLE_RATE,
  SONIOX_WEBSOCKET_URL,
  fetchSonioxTemporaryKey,
  type SonioxSessionConfig,
  type SonioxWebSocketMessage,
  type SonioxToken,
} from "../lib/soniox";
import {
  INITIAL_TRANSCRIPT_STATE,
  SPEAKER_COLORS,
  type TranscriptSegment,
  type TranscriptState,
  type Speaker,
} from "../lib/transcript";
import type { AudioCaptureError, AudioCaptureStatus } from "../audio/types";

/** Soniox realtime model used for the live session. */
const SONIOX_MODEL = "stt-rt-preview";

export type TranscriptionStatus =
  | "idle"
  | "connecting"
  | "recording"
  | "stopping"
  | "error";

interface UseSonioxTranscriptionResult {
  status: TranscriptionStatus;
  transcript: TranscriptState;
  error: string | null;
  audioError: AudioCaptureError | null;
  start: () => Promise<void>;
  stop: () => void;
}

/**
 * Rebuilds the TranscriptState from all cumulative final tokens and the latest non-final tokens.
 * Since Soniox guarantees final tokens are sent stream-once and non-final tokens are the active tail,
 * sorting them chronologically and partitioning into speaker-consecutive segments fully resolves out-of-order
 * finalization/segment duplication issues.
 */
function rebuildTranscriptState(
  finalTokens: SonioxToken[],
  nonFinalTokens: SonioxToken[],
): TranscriptState {
  const combined = [...finalTokens, ...nonFinalTokens];

  combined.sort((a, b) => {
    const startA = a.start_ms ?? 0;
    const startB = b.start_ms ?? 0;
    if (startA !== startB) {
      return startA - startB;
    }
    const endA = a.end_ms ?? 0;
    const endB = b.end_ms ?? 0;
    return endA - endB;
  });

  const segments: TranscriptSegment[] = [];
  const speakers: Record<string, Speaker> = {};

  for (const token of combined) {
    const speakerId = token.speaker ?? null;

    if (speakerId && !speakers[speakerId]) {
      const speakerIndex = Object.keys(speakers).length;
      speakers[speakerId] = {
        id: speakerId,
        label: `Mluvčí ${speakerIndex + 1}`,
        colorIndex: speakerIndex % SPEAKER_COLORS.length,
      };
    }

    let lastSegment = segments[segments.length - 1];

    if (!lastSegment || lastSegment.speakerId !== speakerId) {
      const tokenIndex = combined.indexOf(token);
      const segmentId = `${speakerId ?? "unknown"}-${token.start_ms ?? `idx-${tokenIndex}`}`;
      lastSegment = {
        id: segmentId,
        speakerId,
        finalText: "",
        nonFinalText: "",
      };
      segments.push(lastSegment);
    }

    if (token.is_final) {
      lastSegment.finalText += token.text;
    } else {
      lastSegment.nonFinalText += token.text;
    }
  }

  return { segments, speakers };
}

/**
 * Owns the Soniox realtime WebSocket session: fetches a short-lived key via
 * the Supabase Edge Function, opens the connection, configures the
 * session (Czech, diarization on), streams mic audio from
 * `useAudioCapture`, and maps incoming tokens into `TranscriptState`.
 *
 * Nothing here is persisted — transcript state resets on refresh, by
 * design (see .clinerules section 6).
 */
export function useSonioxTranscription(): UseSonioxTranscriptionResult {
  const [status, setStatus] = useState<TranscriptionStatus>("idle");
  const [transcript, setTranscript] = useState<TranscriptState>(
    INITIAL_TRANSCRIPT_STATE,
  );
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const finalTokensRef = useRef<SonioxToken[]>([]);
  // Buffers PCM chunks that arrive before the WS is open/configured.
  const pendingChunksRef = useRef<ArrayBuffer[]>([]);
  const isSessionConfiguredRef = useRef(false);

  const sendOrBuffer = useCallback((chunk: ArrayBuffer) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN && isSessionConfiguredRef.current) {
      socket.send(chunk);
    } else {
      pendingChunksRef.current.push(chunk);
    }
  }, []);

  const audioCapture = useAudioCapture({ onPcmChunk: sendOrBuffer });

  const closeSocket = useCallback(() => {
    const socket = socketRef.current;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      if (
        socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING
      ) {
        socket.close();
      }
    }
    socketRef.current = null;
    isSessionConfiguredRef.current = false;
    pendingChunksRef.current = [];
  }, []);

  const stop = useCallback(() => {
    setStatus((prev) => (prev === "idle" ? prev : "stopping"));
    audioCapture.stop();
    closeSocket();
    setStatus("idle");
  }, [audioCapture, closeSocket]);

  const start = useCallback(async () => {
    setError(null);
    setTranscript(INITIAL_TRANSCRIPT_STATE);
    finalTokensRef.current = [];
    setStatus("connecting");

    try {
      // Kick off mic capture and the Soniox temporary-key fetch in
      // parallel — starting the mic as early as possible (right after the
      // user's tap) minimizes the window where speech happens before
      // we're actually recording. PCM chunks that arrive before the
      // WebSocket is open/configured are safely buffered in
      // `pendingChunksRef` and flushed once the session is ready, so no
      // audio is lost either way.
      const audioCapturePromise = audioCapture.start();

      const { apiKey } = await fetchSonioxTemporaryKey();

      const socket = new WebSocket(SONIOX_WEBSOCKET_URL);
      socket.binaryType = "arraybuffer";
      socketRef.current = socket;

      socket.onopen = () => {
        const config: SonioxSessionConfig = {
          api_key: apiKey,
          model: SONIOX_MODEL,
          audio_format: SONIOX_AUDIO_FORMAT,
          sample_rate: SONIOX_SAMPLE_RATE,
          num_channels: SONIOX_NUM_CHANNELS,
          language_hints: SONIOX_LANGUAGE_HINTS,
          enable_speaker_diarization: true,
        };
        socket.send(JSON.stringify(config));
        isSessionConfiguredRef.current = true;

        for (const chunk of pendingChunksRef.current) {
          socket.send(chunk);
        }
        pendingChunksRef.current = [];
      };

      socket.onmessage = (event: MessageEvent<string>) => {
        let message: SonioxWebSocketMessage;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }

        if (message.error_message) {
          setError(message.error_message);
          setStatus("error");
          return;
        }

        setStatus((prev) => (prev === "connecting" ? "recording" : prev));

        const tokens = message.tokens ?? [];
        const newFinalTokens = tokens.filter((t) => t.is_final);
        const nonFinalTokens = tokens.filter((t) => !t.is_final);

        if (newFinalTokens.length > 0) {
          finalTokensRef.current = [...finalTokensRef.current, ...newFinalTokens];
        }

        setTranscript(() => rebuildTranscriptState(finalTokensRef.current, nonFinalTokens));
      };

      socket.onerror = () => {
        setError("Spojení se Soniox serverem selhalo.");
        setStatus("error");
      };

      socket.onclose = () => {
        isSessionConfiguredRef.current = false;
      };

      await audioCapturePromise;
    } catch (err) {
      closeSocket();
      audioCapture.stop();
      setError((err as Error).message);
      setStatus("error");
    }
  }, [audioCapture, closeSocket]);


  useEffect(() => {
    return () => {
      closeSocket();
    };
  }, [closeSocket]);

  const combinedStatus: TranscriptionStatus =
    audioCapture.status === "error" ? "error" : status;

  return {
    status: combinedStatus,
    transcript,
    error,
    audioError: audioCapture.error,
    start,
    stop,
  };
}

export type { AudioCaptureStatus };
