/** Shared math helpers used across analytics engines. */

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function avg(values: (number | null | undefined)[]): number {
  const valid = values.filter((v): v is number => v != null && isFinite(v));
  if (valid.length === 0) return 50;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}
