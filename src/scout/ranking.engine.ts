export type Attributes = {
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
};

export type Weights = Partial<Record<keyof Attributes, number>>;

export function calculateRankingScore(
  attributes: Attributes,
  weights: Weights
): number {
  const score = Object.entries(weights).reduce((acc, [attr, weight]) => {
    const value = attributes[attr as keyof Attributes] ?? 0;
    return acc + value * (weight ?? 0);
  }, 0);

  // 🔹 Normalização visual (evita float bug do JS)
  return Number(score.toFixed(2));
}
