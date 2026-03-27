function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function getPlayerDisplayName(value: string | null | undefined) {
  const normalized = normalizeWhitespace(value ?? "");

  if (!normalized) {
    return "Jogador";
  }

  const latinPrefixMatch = normalized.match(/^[\p{Script=Latin}\p{M}.'\- ]+/u);
  if (!latinPrefixMatch) {
    return normalized;
  }

  const latinPrefix = normalizeWhitespace(latinPrefixMatch[0] ?? "");
  const remainder = normalized.slice(latinPrefixMatch[0].length).trim();

  if (latinPrefix && remainder && /\p{L}/u.test(remainder)) {
    return latinPrefix;
  }

  return normalized;
}

export function normalizeReportLiquidityScore(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const numericValue = Number(value);
  const normalized = numericValue > 10 ? numericValue / 10 : numericValue;
  return Number(Math.max(0, Math.min(10, normalized)).toFixed(1));
}
