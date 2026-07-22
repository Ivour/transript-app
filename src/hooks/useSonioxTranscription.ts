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
} from "../lib/soniox";
import {
  INITIAL_TRANSCRIPT_STATE,
  SPEAKER_COLORS,
  type TranscriptSegment,
  type TranscriptState,
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

function createSegmentId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Applies a batch of Soniox tokens to the current transcript state,
 * grouping consecutive same-speaker tokens into segments and tracking
 * final vs. non-final text per segment (see .clinerules section 6).
 *
 * Soniox re-sends the still-open non-final tail on every message, so each
 * call replaces the previous non-final text rather than appending to it.
 */
function applyTokensToTranscript(
  state: TranscriptState,
  tokens: SonioxWebSocketMessage["tokens"],
): TranscriptState {
  if (!tokens || tokens.length === 0) {
    return state;
  }

  const segments = [...state.segments];
  const speakers = { ...state.speakers };

  // Clear all non-final text up front — it gets rebuilt from this batch.
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].nonFinalText) {
      segments[i] = { ...segments[i], nonFinalText: "" };
    }
  }

  for (const token of tokens) {
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
      lastSegment = {
        id: createSegmentId(),
        speakerId,
        finalText: "",
        nonFinalText: "",
      };
      segments.push(lastSegment);
    }

    const updated: TranscriptSegment = token.is_final
      ? { ...lastSegment, finalText: lastSegment.finalText + token.text }
      : { ...lastSegment, nonFinalText: lastSegment.nonFinalText + token.text };

    segments[segments.length - 1] = updated;
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
        setTranscript((prev) => applyTokensToTranscript(prev, message.tokens));
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
