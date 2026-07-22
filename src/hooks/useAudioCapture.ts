import { useCallback, useEffect, useRef, useState } from "react";
import {
  CHUNK_DURATION_MS,
  PCM_RECORDER_PROCESSOR_NAME,
  PCM_RECORDER_WORKLET_URL,
  TARGET_SAMPLE_RATE,
} from "../audio/constants";
import type { AudioCaptureError, AudioCaptureStatus } from "../audio/types";

interface UseAudioCaptureOptions {
  /** Called on the main thread with each resampled PCM s16le chunk. */
  onPcmChunk: (chunk: ArrayBuffer) => void;
}

interface UseAudioCaptureResult {
  status: AudioCaptureStatus;
  error: AudioCaptureError | null;
  /**
   * Starts mic capture. MUST be invoked synchronously from a user gesture
   * (e.g. a button's onClick) — iOS Safari refuses to start/resume an
   * AudioContext otherwise (see .clinerules section 5).
   */
  start: () => Promise<void>;
  stop: () => void;
}

/**
 * Captures microphone audio via getUserMedia -> AudioContext ->
 * AudioWorkletNode and streams resampled 16 kHz mono PCM s16le chunks to
 * the caller. Deliberately does NOT use MediaRecorder (see .clinerules
 * section 4). Contains no Soniox/WebSocket logic — that lives in
 * `useSonioxTranscription`, which composes this hook.
 */
export function useAudioCapture({
  onPcmChunk,
}: UseAudioCaptureOptions): UseAudioCaptureResult {
  const [status, setStatus] = useState<AudioCaptureStatus>("idle");
  const [error, setError] = useState<AudioCaptureError | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const onPcmChunkRef = useRef(onPcmChunk);

  useEffect(() => {
    onPcmChunkRef.current = onPcmChunk;
  }, [onPcmChunk]);

  const teardown = useCallback(() => {
    workletNodeRef.current?.port.close();
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;

    sourceNodeRef.current?.disconnect();
    sourceNodeRef.current = null;

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close();
    }
    audioContextRef.current = null;
  }, []);

  const stop = useCallback(() => {
    teardown();
    setStatus("idle");
  }, [teardown]);

  const start = useCallback(async () => {
    setError(null);
    setStatus("starting");

    try {
      // Created synchronously within the caller's user-gesture callback —
      // do not `await` anything before this line.
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      audioContext.onstatechange = () => {
        if (audioContext.state === "suspended") {
          setStatus("suspended");
        } else if (audioContext.state === "running") {
          setStatus("recording");
        }
      };

      await audioContext.audioWorklet.addModule(PCM_RECORDER_WORKLET_URL);

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = mediaStream;

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const sourceNode = audioContext.createMediaStreamSource(mediaStream);
      sourceNodeRef.current = sourceNode;

      const workletNode = new AudioWorkletNode(
        audioContext,
        PCM_RECORDER_PROCESSOR_NAME,
        {
          numberOfInputs: 1,
          numberOfOutputs: 0,
          channelCount: 1,
          processorOptions: {
            targetSampleRate: TARGET_SAMPLE_RATE,
            chunkDurationMs: CHUNK_DURATION_MS,
          },
        },
      );
      workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        onPcmChunkRef.current(event.data);
      };
      workletNodeRef.current = workletNode;

      sourceNode.connect(workletNode);

      setStatus("recording");
    } catch (err) {
      teardown();
      const domError = err as DOMException;
      setError({
        message: domError.message || "Nepodařilo se spustit mikrofon.",
        isPermissionDenied:
          domError.name === "NotAllowedError" ||
          domError.name === "PermissionDeniedError",
      });
      setStatus("error");
    }
  }, [teardown]);

  // Detect the app being backgrounded/foregrounded — iOS may suspend the
  // AudioContext when the tab loses visibility (see .clinerules section 5).
  // We only reflect the resulting state; resuming requires a fresh user
  // gesture, which the UI layer must prompt for.
  useEffect(() => {
    function handleVisibilityChange() {
      const audioContext = audioContextRef.current;
      if (!audioContext) return;
      if (document.visibilityState === "visible" && audioContext.state === "running") {
        setStatus("recording");
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    return () => {
      teardown();
    };
  }, [teardown]);

  return { status, error, start, stop };
}
