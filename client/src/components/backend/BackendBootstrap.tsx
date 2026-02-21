import { useEffect } from "react";
import { getBackendMode } from "@/api/config";
import { fetchStateSnapshot } from "@/api/state";
import { useStore } from "@/store/useStore";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";

/**
 * Bootstraps the frontend when backend mode is enabled.
 *
 * IMPORTANT: This does NOT break offline mode.
 * - Default is local mode (localStorage)
 * - When enabled, it pulls a snapshot from `/api/state` and hydrates the Zustand store
 */
export function BackendBootstrap() {
  const hydrate = useStore((s) => s.hydrateFromBackendSnapshot);

  useEffect(() => {
    if (getBackendMode() !== "api") return;

    let cancelled = false;
    (async () => {
      try {
        const snapshot = await fetchStateSnapshot();
        if (cancelled) return;
        hydrate(snapshot);
      } catch {
        // Silent failure: if backend isn't up yet, keep offline mode working.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrate]);

  // Real-time sync: when server emits changes, we pull a fresh snapshot.
  useRealtimeSync({
    enabled: getBackendMode() === "api",
    onSnapshot: hydrate,
  });

  return null;
}
