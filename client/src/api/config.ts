export function getBackendMode(): "local" | "api" {
  const mode = import.meta.env.VITE_BACKEND_MODE;
  return mode === "api" ? "api" : "local";
}

export function getApiBaseUrl(): string {
  // If empty, use relative URLs (same origin).
  return (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
}

export function allowApiLocalFallback(): boolean {
  const raw = String(import.meta.env.VITE_ALLOW_API_LOCAL_FALLBACK ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}
