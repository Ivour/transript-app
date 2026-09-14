import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioCapture } from "./useAudioCapture";
import { useAuth } from "./useAuth";
import { supabase } from "../lib/supabase";
import {
  SONIOX_LANGUAGE_HINTS,
  SONIOX_NUM_CHANNELS,
  SONIOX_SESSION_EXPIRED_ERROR_TYPE,
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
import {
  AUDIO_QUALITY_FORMAT,
  AUDIO_QUALITY_SAMPLE_RATE,
  DEFAULT_AUDIO_QUALITY_MODE,
  NOISE_GATE_LEVEL_METER_MIN_DB,
  type AudioQualityMode,
} from "../audio/constants";
import type { AudioCaptureError, AudioCaptureStatus } from "../audio/types";


/** Soniox realtime model used for the live session — stt-rt-v5 is the latest production-grade low-latency model. */
const SONIOX_MODEL = "stt-rt-v5";

/**
 * Caps how many final tokens we keep in memory/rebuild on each message.
 * Without this, a long (10-30+ min) session would make `rebuildTranscriptState`
 * reprocess an ever-growing array on every WebSocket message, causing
 * progressively worse latency/battery drain on mobile. Older tokens beyond
 * this window are dropped — per product decision, only recent transcript
 * context matters, nothing is persisted anyway (see .clinerules section 6).
 * ~600 tokens covers several minutes of continuous speech.
 */
const MAX_FINAL_TOKENS = 600;


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
  /**
   * `audioQualityMode` ("normal" by default, or "low_bandwidth" for weak
   * signal networks — see AUDIO_QUALITY_* in ../audio/constants.ts) is
   * baked into both the AudioWorklet's output encoding AND the Soniox
   * session config sent once at WS open — cannot be switched mid-session.
   */
  start: (audioQualityMode?: AudioQualityMode) => Promise<void>;
  stop: () => void;
  /** Current live mic input level (dBFS), for the sensitivity slider's level meter. */
  micLevelDb: number;
  /** Live-updates the noise gate ("sensitivity") — 0 = off, 1 = aggressive. */
  setNoiseGateAmount: (amount: number) => void;
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

  for (let tokenIndex = 0; tokenIndex < combined.length; tokenIndex++) {
    const token = combined[tokenIndex];
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
  const { user } = useAuth();
  const [status, setStatus] = useState<TranscriptionStatus>("idle");
  const [transcript, setTranscript] = useState<TranscriptState>(
    INITIAL_TRANSCRIPT_STATE,
  );
  const [error, setError] = useState<string | null>(null);
  const [micLevelDb, setMicLevelDb] = useState(NOISE_GATE_LEVEL_METER_MIN_DB);


  const socketRef = useRef<WebSocket | null>(null);
  const finalTokensRef = useRef<SonioxToken[]>([]);
  const keepAliveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number | null>(null);
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

  const audioCapture = useAudioCapture({
    onPcmChunk: sendOrBuffer,
    onLevel: setMicLevelDb,
  });


  const closeSocket = useCallback(() => {
    if (keepAliveIntervalRef.current) {
      clearInterval(keepAliveIntervalRef.current);
      keepAliveIntervalRef.current = null;
    }
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

  /**
   * Calculates the just-finished session's duration from `startTimeRef`
   * and logs it to `usage_sessions`. Shared between the manual `stop()`
   * path and unexpected/server-initiated terminations (e.g. the
   * `max_session_duration_seconds` cutoff below) so usage stats stay
   * accurate no matter how the session ended.
   */
  const logUsageSession = useCallback(() => {
    if (!startTimeRef.current) return;

    const durationMs = Date.now() - startTimeRef.current;
    const durationSeconds = durationMs / 1000;
    startTimeRef.current = null; // Clear to prevent double logging

    // $0.037846 total cost / 0.46 hours = $0.0822739 USD/hour
    const COST_PER_HOUR = 0.0822739;
    const costUsd = (durationSeconds / 3600) * COST_PER_HOUR;

    if (user?.id && durationSeconds >= 1) {
      supabase
        .from("usage_sessions")
        .insert({
          user_id: user.id,
          duration_seconds: durationSeconds,
          cost_usd: parseFloat(costUsd.toFixed(8)),
        })
        .then(({ error }) => {
          if (error) {
            console.error("Failed to log usage session:", error);
          }
        });
    }
  }, [user]);

  /**
   * Full cleanup for sessions that end WITHOUT the user pressing stop:
   * the Soniox `max_session_duration_seconds` cutoff (see `soniox-token`
   * Edge Function) or an unexpected network/socket drop. Without this,
   * the mic (`MediaStreamTrack`) would keep running — and the browser/OS
   * recording indicator would stay lit — even though transcription has
   * already stopped server-side, since `audioCapture.stop()` would never
   * get called. Mirrors what `stop()` does, minus the "finalize" message
   * (the socket is already gone/gone-away, sending on it is pointless).
   */
  const handleUnexpectedTermination = useCallback(
    (message: string) => {
      audioCapture.stop();
      logUsageSession();
      setError(message);
      setStatus("error");
      closeSocket();
    },
    [audioCapture, logUsageSession, closeSocket],
  );

  const stop = useCallback(() => {
    setStatus((prev) => (prev === "idle" ? prev : "stopping"));
    audioCapture.stop();

    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        // Send a manual finalization command so outstanding words in the last segment are committed
        socket.send(JSON.stringify({ type: "finalize" }));
      } catch {
        // Safe fallback in case of write/network failures
      }
    }

    logUsageSession();

    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
    }
    // Give Soniox servers 300ms to send the finalized tokens before cleaning up
    stopTimeoutRef.current = setTimeout(() => {
      closeSocket();
      setStatus("idle");
      stopTimeoutRef.current = null;
    }, 300);
  }, [audioCapture, closeSocket, logUsageSession]);


  const start = useCallback(async (audioQualityMode: AudioQualityMode = DEFAULT_AUDIO_QUALITY_MODE) => {
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
      const audioCapturePromise = audioCapture.start(audioQualityMode);

      const { apiKey } = await fetchSonioxTemporaryKey();

      const socket = new WebSocket(SONIOX_WEBSOCKET_URL);
      socket.binaryType = "arraybuffer";
      socketRef.current = socket;

      socket.onopen = () => {
        const config: SonioxSessionConfig = {
          api_key: apiKey,
          model: SONIOX_MODEL,
          audio_format: AUDIO_QUALITY_FORMAT[audioQualityMode],
          sample_rate: AUDIO_QUALITY_SAMPLE_RATE[audioQualityMode],
          num_channels: SONIOX_NUM_CHANNELS,
           language_hints: [...SONIOX_LANGUAGE_HINTS],
           language_hints_strict: true,
           enable_speaker_diarization: true,
        };
        socket.send(JSON.stringify(config));
        isSessionConfiguredRef.current = true;

        for (const chunk of pendingChunksRef.current) {
          socket.send(chunk);
        }
        pendingChunksRef.current = [];

        // Connection Keep-Alive: send a ping every 10 seconds to keep mobile networks active
        if (keepAliveIntervalRef.current) {
          clearInterval(keepAliveIntervalRef.current);
        }
        keepAliveIntervalRef.current = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "keepalive" }));
          }
        }, 10000);
      };

      socket.onmessage = (event: MessageEvent<string>) => {
        let message: SonioxWebSocketMessage;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }

        if (message.error_message) {
          const friendlyMessage =
            message.error_type === SONIOX_SESSION_EXPIRED_ERROR_TYPE
              ? "Přepis byl automaticky zastaven po 30 minutách (bezpečnostní limit)."
              : message.error_message;
          handleUnexpectedTermination(friendlyMessage);
          return;
        }


        setStatus((prev) => {
          if (prev === "connecting") {
            startTimeRef.current = Date.now();
            return "recording";
          }
          return prev;
        });

        const tokens = message.tokens ?? [];
        const newFinalTokens = tokens.filter((t) => t.is_final);
        const nonFinalTokens = tokens.filter((t) => !t.is_final);

        if (newFinalTokens.length > 0) {
          const updated = [...finalTokensRef.current, ...newFinalTokens];
          // Prune oldest final tokens beyond the cap so rebuildTranscriptState
          // keeps operating on a bounded array regardless of session length.
          finalTokensRef.current =
            updated.length > MAX_FINAL_TOKENS
              ? updated.slice(updated.length - MAX_FINAL_TOKENS)
              : updated;
        }


        setTranscript(() => rebuildTranscriptState(finalTokensRef.current, nonFinalTokens));
      };

      socket.onerror = () => {
        handleUnexpectedTermination("Spojení se Soniox serverem selhalo.");
      };

      // Fires for genuinely unexpected closes only — our own `closeSocket()`
      // (used by `stop()` and the error paths above) always nulls out
      // `onclose` before calling `socket.close()`, so it never re-enters
      // here. A network drop/server-side close reaching this handler means
      // `audioCapture.stop()` was never called yet — do it now so the mic
      // doesn't keep running (and the OS recording indicator lit) after
      // the transcript has silently died.
      socket.onclose = () => {
        isSessionConfiguredRef.current = false;
        handleUnexpectedTermination("Spojení se Soniox serverem bylo neočekávaně přerušeno.");
      };


      await audioCapturePromise;
    } catch (err) {
      closeSocket();
      audioCapture.stop();
      setError((err as Error).message);
      setStatus("error");
    }
  }, [audioCapture, closeSocket, handleUnexpectedTermination]);



  useEffect(() => {
    return () => {
      if (stopTimeoutRef.current) {
        clearTimeout(stopTimeoutRef.current);
      }
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
    micLevelDb,
    setNoiseGateAmount: audioCapture.setNoiseGateAmount,
  };
}


export type { AudioCaptureStatus };
