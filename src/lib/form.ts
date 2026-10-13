// Small FormData readers. Blank or placeholder input becomes null (unknown), never 0.

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export function text(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s === "" ? null : s;
}

export function requiredText(fd: FormData, key: string, label: string): string {
  const v = text(fd, key);
  if (!v) throw new FormError(`${label} is required.`);
  return v;
}

export function number(fd: FormData, key: string, label = key): number | null {
  const v = text(fd, key);
  if (v === null) return null;
  const n = Number(v.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n)) throw new FormError(`${label} must be a number.`);
  return Math.round(n * 100) / 100;
}

export function isoDate(fd: FormData, key: string): string | null {
  const v = text(fd, key);
  if (v === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new FormError(`${key} must be a date.`);
  return v;
}

export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

export class FormError extends Error {}

/** Runs an action body, turning thrown errors into a friendly result. */
export async function attempt<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof FormError) return { ok: false, error: e.message };
    // Next's redirect()/notFound() throw special errors that must propagate
    if (e && typeof e === "object" && "digest" in e) throw e;
    console.error(e);
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}
