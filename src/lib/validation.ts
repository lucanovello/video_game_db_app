export function toSingle(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}

export function normalizeHandle(value: string): string {
  return value.trim().toLowerCase();
}

export const INVALID_HANDLE_MESSAGE =
  "Invalid handle. Use 3-30 chars: a-z, 0-9, _";

export function isValidHandle(value: string): boolean {
  return /^[a-z0-9_]{3,30}$/.test(value);
}

export function isValidQid(value: string): boolean {
  return /^Q\d+$/.test(value);
}

export function cleanOptionalText(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function parseOptionalInt(value: string | null, min: number, max: number): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < min || parsed > max) return null;
  return parsed;
}

export function parseOptionalDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
