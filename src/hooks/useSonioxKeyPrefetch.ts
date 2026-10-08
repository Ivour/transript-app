import { useCallback, useEffect, useRef } from "react";
import {
  fetchSonioxTemporaryKey,
  type SonioxTemporaryKeyResponse,
} from "../lib/soniox";

/**
 * A prefetched key is only handed out if it stays valid at least this long
 * — enough to open the WebSocket and send the config message.
 */
const MIN_REMAINING_VALIDITY_MS = 10_000;

/** Refresh the prefetched key this long before it expires. */
const REFRESH_BEFORE_EXPIRY_MS = 15_000;

/**
 * After a key is handed out, wait this long before prefetching the next
 * one, so that request doesn't compete with the starting session's
 * WebSocket handshake and first audio on a weak mobile connection.
 */
const NEXT_PREFETCH_DELAY_MS = 5_000;

interface PrefetchedKey {
  promise: Promise<SonioxTemporaryKeyResponse>;
  key: SonioxTemporaryKeyResponse | null;
}

function remainingValidityMs(key: SonioxTemporaryKeyResponse): number {
  return Date.parse(key.expiresAt) - Date.now();
}

/**
 * Keeps a Soniox temporary key ready before the user taps Start, so the
 * Supabase Edge Function round trip (incl. a possible cold start) is off
 * the critical path to the first transcribed word. The key is refreshed
 * shortly before it expires while the page is visible, and refetched when
 * the page becomes visible again (background timers are throttled on iOS).
 *
 * `takeKey()` hands out the prefetched key (each key is used for one
 * session; an in-flight prefetch is awaited rather than duplicated) and
 * schedules the next prefetch. If nothing valid is ready, it falls back to
 * a direct fetch.
 */
export function useSonioxKeyPrefetch() {
  const prefetchedRef = useRef<PrefetchedKey | null>(null);
  // Set by the effect below; (re)schedules the next prefetch.
  const schedulePrefetchRef = useRef<(delayMs: number) => void>(() => {});

  useEffect(() => {
    let prefetchTimeout: ReturnType<typeof setTimeout> | null = null;

    function schedulePrefetch(delayMs: number) {
      if (prefetchTimeout) clearTimeout(prefetchTimeout);
      prefetchTimeout = setTimeout(() => {
        prefetchTimeout = null;
        if (document.visibilityState === "visible") {
          prefetch();
        } else {
          // Let the visibilitychange handler refetch on return.
          prefetchedRef.current = null;
        }
      }, delayMs);
    }

    function prefetch() {
      if (prefetchTimeout) clearTimeout(prefetchTimeout);
      prefetchTimeout = null;

      const entry: PrefetchedKey = {
        promise: fetchSonioxTemporaryKey(),
        key: null,
      };
      prefetchedRef.current = entry;

      entry.promise.then(
        (key) => {
          if (prefetchedRef.current !== entry) return;
          entry.key = key;
          schedulePrefetch(
            Math.max(
              remainingValidityMs(key) - REFRESH_BEFORE_EXPIRY_MS,
              MIN_REMAINING_VALIDITY_MS,
            ),
          );
        },
        () => {
          // Failed prefetch is not fatal — takeKey() falls back to a direct
          // fetch, which surfaces the error to the user if it fails again.
          if (prefetchedRef.current === entry) prefetchedRef.current = null;
        },
      );
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      const entry = prefetchedRef.current;
      if (
        !entry ||
        (entry.key &&
          remainingValidityMs(entry.key) < REFRESH_BEFORE_EXPIRY_MS)
      ) {
        prefetch();
      }
    }

    schedulePrefetchRef.current = schedulePrefetch;
    prefetch();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (prefetchTimeout) clearTimeout(prefetchTimeout);
      schedulePrefetchRef.current = () => {};
      prefetchedRef.current = null;
    };
  }, []);

  const takeKey = useCallback(async (): Promise<SonioxTemporaryKeyResponse> => {
    const entry = prefetchedRef.current;
    prefetchedRef.current = null;
    schedulePrefetchRef.current(NEXT_PREFETCH_DELAY_MS);

    if (entry) {
      try {
        const key = await entry.promise;
        if (remainingValidityMs(key) >= MIN_REMAINING_VALIDITY_MS) {
          return key;
        }
      } catch {
        // Fall through to a direct fetch.
      }
    }
    return fetchSonioxTemporaryKey();
  }, []);

  return { takeKey };
}
