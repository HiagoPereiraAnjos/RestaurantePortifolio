import { useEffect, useRef } from "react";
import { getApiBaseUrl, getBackendMode } from "@/api/config";
import { fetchStateSnapshot } from "@/api/state";

function buildWsUrl(): string {
  const base = getApiBaseUrl();

  // If an API base is provided, derive ws(s) from it.
  if (base) {
    const u = new URL(base, window.location.origin);
    const protocol = u.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${u.host}/ws`;
  }

  // Default: same origin.
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

/**
 * Connects to the backend WebSocket (when VITE_BACKEND_MODE=api)
 * and refreshes the Zustand store via snapshot pulls.
 *
 * This is intentionally conservative:
 * - Debounces snapshot pulls
 * - Reconnects automatically
 * - If anything fails, the app keeps working in offline mode
 */
export function useRealtimeSync(opts: {
  enabled: boolean;
  onSnapshot: (snapshot: Awaited<ReturnType<typeof fetchStateSnapshot>>) => void;
}) {
  const { enabled, onSnapshot } = opts;
  const wsRef = useRef<WebSocket | null>(null);
  const debounceRef = useRef<number | null>(null);
  const retryRef = useRef<number>(0);
  const stoppedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!enabled) return;
    if (getBackendMode() !== "api") return;

    stoppedRef.current = false;
    const connect = () => {
      if (stoppedRef.current) return;

      const wsUrl = buildWsUrl();
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
      };

      const scheduleSnapshot = () => {
        if (debounceRef.current) window.clearTimeout(debounceRef.current);
        debounceRef.current = window.setTimeout(async () => {
          try {
            const snapshot = await fetchStateSnapshot();
            onSnapshot(snapshot);
          } catch {
            // ignore
          }
        }, 250);
      };

      ws.onmessage = () => {
        // We don't depend on the event type; snapshot is the source of truth.
        scheduleSnapshot();
      };

      ws.onerror = () => {
        // errors typically lead to close; keep logic in onclose.
      };

      ws.onclose = () => {
        if (stoppedRef.current) return;
        // Exponential-ish backoff, capped.
        retryRef.current += 1;
        const delay = Math.min(8000, 300 * Math.pow(2, retryRef.current));
        window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      stoppedRef.current = true;
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      try {
        wsRef.current?.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    };
  }, [enabled, onSnapshot]);
}
