import { useCallback, useEffect, useRef } from "react";

/**
 * Requests a screen Wake Lock while `active` is true, so the display
 * doesn't sleep during a long transcription session (see .clinerules
 * section 5). Silently no-ops on browsers without Wake Lock API support
 * (e.g. older iOS Safari) — never throws, transcription must keep working
 * regardless.
 */
export function useWakeLock(active: boolean) {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const release = useCallback(async () => {
    try {
      await wakeLockRef.current?.release();
    } catch {
      // Ignore — nothing meaningful to recover from here.
    }
    wakeLockRef.current = null;
  }, []);

  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) {
      return;
    }

    let isCancelled = false;

    async function requestWakeLock() {
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (isCancelled) {
          await sentinel.release();
          return;
        }
        wakeLockRef.current = sentinel;
      } catch {
        // Wake Lock can be refused (e.g. low battery, backgrounded tab) —
        // not a fatal error for transcription.
      }
    }

    // Re-acquire when the tab becomes visible again — the OS releases the
    // lock automatically when the page is hidden.
    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && !wakeLockRef.current) {
        void requestWakeLock();
      }
    }

    void requestWakeLock();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isCancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void release();
    };
  }, [active, release]);
}
