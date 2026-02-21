import { getApiBaseUrl } from "./config";

async function throwIfResNotOk(res: Response) {
  if (res.ok) return;
  const text = (await res.text()) || res.statusText;
  throw new Error(`${res.status}: ${text}`);
}

export async function apiFetch<T>(
  path: string,
  opts?: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  },
): Promise<T> {
  const base = getApiBaseUrl();
  const url = `${base}${path}`;
  const method = opts?.method ?? "GET";

  const token = (() => {
    try {
      return localStorage.getItem("bb_admin_token") || "";
    } catch {
      return "";
    }
  })();

  const res = await fetch(url, {
    method,
    headers: {
      ...(opts?.body ? { "Content-Type": "application/json" } : {}),
      ...(token && !(opts?.headers?.authorization || opts?.headers?.Authorization)
        ? { Authorization: `Bearer ${token}` }
        : {}),
      ...(opts?.headers ?? {}),
    },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  // 204
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
