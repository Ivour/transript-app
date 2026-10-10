import { useCallback, useEffect, useRef, useState } from "react";
import {
  AUDIO_QUALITY_FORMAT,
  AUDIO_QUALITY_SAMPLE_RATE,
  CHUNK_DURATION_MS,
  DEFAULT_AUDIO_QUALITY_MODE,
  DEFAULT_NOISE_GATE_AMOUNT,
  MIC_ECHO_CANCELLATION,
  MIC_NOISE_SUPPRESSION,
  NOISE_GATE_PARAM_NAME,
  PCM_RECORDER_PROCESSOR_NAME,
  PCM_RECORDER_WORKLET_URL,
  type AudioQualityMode,
} from "../audio/constants";
import type { AudioCaptureError, AudioCaptureStatus } from "../audio/types";

interface UseAudioCaptureOptions {
  /**
   * Called on the main thread with each resampled PCM chunk (encoding
   * depends on the `audioQualityMode` passed to `start()` — see below).
   */
  onPcmChunk: (chunk: ArrayBuffer) => void;
  /**
   * Called ~10x/second with the current smoothed mic input level (dBFS),
   * as measured by the AudioWorklet's noise-gate envelope follower.
   * Powers the live level meter next to the sensitivity slider. Optional
   * — omit if the level meter isn't needed.
   */
  onLevel?: (db: number) => void;
}

interface UseAudioCaptureResult {
  status: AudioCaptureStatus;
  error: AudioCaptureError | null;
  /**
   * Native sample rate (Hz) the browser runs the AudioContext at (not the
   * 16 kHz we send). Diagnostics only — shown in the test build, since a
   * PWA on iPhone has no console. `null` while not recording.
   */
  nativeSampleRate: number | null;
  /**
   * Starts mic capture. MUST be invoked synchronously from a user gesture
   * (e.g. a button's onClick) — iOS Safari refuses to start/resume an
   * AudioContext otherwise (see .clinerules section 5).
   *
   * `audioQualityMode` picks the worklet's output sample rate/encoding
   * ("normal" 16kHz pcm_s16le by default, or "low_bandwidth" 8kHz
   * pcm_mulaw for weak-signal networks — see AUDIO_QUALITY_* in
   * ../audio/constants.ts). Baked into the AudioWorkletNode at
   * construction — cannot change mid-recording, unlike the noise gate.
   */
  start: (audioQualityMode?: AudioQualityMode) => Promise<void>;
  stop: () => void;
  /**
   * Live-updates the noise gate sensitivity (0 = bypassed/off, 1 =
   * aggressive). Backed by a k-rate AudioParam on the worklet node, so it
   * takes effect within one render quantum — no reconnect needed. No-op
   * while not recording; the value is re-applied to the next worklet node
   * created by `start()` via `pendingNoiseGateAmountRef`.
   */
  setNoiseGateAmount: (amount: number) => void;
}


/**
 * Captures microphone audio via getUserMedia -> AudioContext ->
 * AudioWorkletNode and streams resampled mono PCM chunks to the caller —
 * 16 kHz pcm_s16le by default, or 8 kHz pcm_mulaw when `start()` is called
 * with `audioQualityMode: "low_bandwidth"` (see AUDIO_QUALITY_* in
 * ../audio/constants.ts). Deliberately does NOT use MediaRecorder (see
 * .clinerules section 4). Contains no Soniox/WebSocket logic — that lives
 * in `useSonioxTranscription`, which composes this hook.
 */
export function useAudioCapture({
  onPcmChunk,
  onLevel,
}: UseAudioCaptureOptions): UseAudioCaptureResult {
  const [status, setStatus] = useState<AudioCaptureStatus>("idle");
  const [error, setError] = useState<AudioCaptureError | null>(null);
  const [nativeSampleRate, setNativeSampleRate] = useState<number | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const onPcmChunkRef = useRef(onPcmChunk);
  const onLevelRef = useRef(onLevel);
  // Holds the sensitivity value across `stop()`/`start()` cycles and until
  // the worklet node exists, so `setNoiseGateAmount` calls made before/
  // between recordings aren't lost — the next `start()` re-applies it.
  const noiseGateAmountRef = useRef(DEFAULT_NOISE_GATE_AMOUNT);

  useEffect(() => {
    onPcmChunkRef.current = onPcmChunk;
  }, [onPcmChunk]);

  useEffect(() => {
    onLevelRef.current = onLevel;
  }, [onLevel]);


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
    setNativeSampleRate(null);
  }, [teardown]);

  const start = useCallback(async (audioQualityMode: AudioQualityMode = DEFAULT_AUDIO_QUALITY_MODE) => {
    setError(null);
    setStatus("starting");

    try {
      // Created synchronously within the caller's user-gesture callback —
      // do not `await` anything before this line. `latencyHint: "interactive"`
      // asks the browser to minimize internal audio buffering (vs. the
      // "balanced"/"playback" defaults), which reduces the time between mic
      // input and the worklet receiving it — pure latency win, no effect on
      // the audio content itself (safe for diarization accuracy).
      const audioContext = new AudioContext({ latencyHint: "interactive" });
      audioContextRef.current = audioContext;
      setNativeSampleRate(audioContext.sampleRate);

      audioContext.onstatechange = () => {
        if (audioContext.state === "suspended") {
          setStatus("suspended");
        } else if (audioContext.state === "running") {
          setStatus("recording");
        }
      };

      // Keep sequential: a version running addModule() in parallel with
      // getUserMedia() left the worklet module request pending forever
      // (seen in Arc/Chromium on localhost; root cause not pinned down).
      await audioContext.audioWorklet.addModule(PCM_RECORDER_WORKLET_URL);

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: MIC_ECHO_CANCELLATION,
          noiseSuppression: MIC_NOISE_SUPPRESSION,
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
          // "explicit" makes Web Audio actually downmix to mono (L+R average).
          // The default "max" mode ignores channelCount, so a stereo source
          // (e.g. an external wireless mic receiver) would reach the worklet
          // as 2 channels and only the left one would be used.
          channelCount: 1,
          channelCountMode: "explicit",
          processorOptions: {
            targetSampleRate: AUDIO_QUALITY_SAMPLE_RATE[audioQualityMode],
            chunkDurationMs: CHUNK_DURATION_MS,
            audioFormat: AUDIO_QUALITY_FORMAT[audioQualityMode],
          },
        },
      );
      workletNode.port.onmessage = (
        event: MessageEvent<ArrayBuffer | { type: "level"; db: number }>,
      ) => {
        const data = event.data;
        if (data instanceof ArrayBuffer) {
          onPcmChunkRef.current(data);
        } else if (data?.type === "level") {
          onLevelRef.current?.(data.db);
        }
      };
      workletNodeRef.current = workletNode;

      // Re-apply whatever sensitivity was set (even before this recording
      // started, or during a previous one) to the freshly created node's
      // AudioParam.
      workletNode.parameters
        .get(NOISE_GATE_PARAM_NAME)
        ?.setValueAtTime(noiseGateAmountRef.current, audioContext.currentTime);

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

  const setNoiseGateAmount = useCallback((amount: number) => {
    noiseGateAmountRef.current = amount;
    const audioContext = audioContextRef.current;
    const workletNode = workletNodeRef.current;
    if (!audioContext || !workletNode) return;
    // Live update — takes effect on the next render quantum (~2.7 ms),
    // no reconnect/round-trip needed (see .clinerules low-latency
    // priority + section 4).
    workletNode.parameters
      .get(NOISE_GATE_PARAM_NAME)
      ?.setValueAtTime(amount, audioContext.currentTime);
  }, []);

  useEffect(() => {
    return () => {
      teardown();
    };
  }, [teardown]);

  return { status, error, nativeSampleRate, start, stop, setNoiseGateAmount };
}

