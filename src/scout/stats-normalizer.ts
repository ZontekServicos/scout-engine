export function normalizeStat(value: number) {
  const min = 0;
  const max = 100;

  const normalized = Math.round(((value - min) / (max - min)) * 99);

  return Math.max(1, Math.min(normalized, 99));
}