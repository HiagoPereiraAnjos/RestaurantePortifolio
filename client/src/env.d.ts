/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Backend mode:
   * - "local" (default): keep using localStorage/offline store
   * - "api": read/write through the backend API (Postgres)
   */
  readonly VITE_BACKEND_MODE?: "local" | "api";

  /** Base URL for the backend API (optional). Example: http://localhost:5000 */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
