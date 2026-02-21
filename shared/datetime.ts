export const APP_TIMEZONE = "America/Sao_Paulo";

export type DateLike = Date | string | number | null | undefined;

export function toDateOrNull(value: DateLike): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toEpochMs(value: DateLike): number | null {
  const date = toDateOrNull(value);
  return date ? date.getTime() : null;
}

export function nowIsoUtc(): string {
  return new Date().toISOString();
}

export function formatDateTimeBR(value: DateLike): string {
  const date = toDateOrNull(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: APP_TIMEZONE,
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

export function localDateBoundaryMs(dateYYYYMMDD: string, boundary: "start" | "end"): number | null {
  const raw = String(dateYYYYMMDD ?? "").trim();
  if (!raw) return null;
  const suffix = boundary === "start" ? "T00:00:00" : "T23:59:59.999";
  return toEpochMs(`${raw}${suffix}`);
}

export function serializeDatesForApi<T>(input: T): T {
  if (input instanceof Date) return input.toISOString() as T;
  if (Array.isArray(input)) return input.map((x) => serializeDatesForApi(x)) as T;
  if (input && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = serializeDatesForApi(v);
    }
    return out as T;
  }
  return input;
}
