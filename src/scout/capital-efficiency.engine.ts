export type CapitalEfficiencyInput = {
  performanceScore: number;
  flopProbability: number;
  liquidityScore: number;
  financialRiskIndex: number;
};

export type CapitalEfficiencyResult = {
  index: number; // 0 a 10
  classification: "ELITE OPPORTUNITY" | "STRONG ASSET" | "STRATEGIC BET" | "HIGH EXPOSURE";
  breakdown: {
    riskAdjustedPerformance: number;
    liquidityImpact: number;
    financialPenalty: number;
  };
};

function classify(index: number): CapitalEfficiencyResult["classification"] {
  if (index >= 8.5) return "ELITE OPPORTUNITY";
  if (index >= 7) return "STRONG ASSET";
  if (index >= 6) return "STRATEGIC BET";
  return "HIGH EXPOSURE";
}

export function calculateCapitalEfficiency(input: CapitalEfficiencyInput): CapitalEfficiencyResult {
  const { performanceScore, flopProbability, liquidityScore, financialRiskIndex } = input;

  // 1️⃣ Performance ajustada ao risco de flop
  const riskAdjustedPerformance = performanceScore * (1 - flopProbability / 100);

  // 2️⃣ Base principal (0–10)
  const baseIndex = riskAdjustedPerformance / 10;

  // 3️⃣ Liquidez ajuda até +1 ponto
  const liquidityBonus = liquidityScore / 100;

  // 4️⃣ Risco financeiro penaliza até -2 pontos
  const financialPenalty = financialRiskIndex / 50;

  let rawIndex = baseIndex + liquidityBonus - financialPenalty;

  // 5️⃣ Clamp 0–10
  rawIndex = Math.max(0, Math.min(10, rawIndex));

  const index = Number(rawIndex.toFixed(2));

  return {
    index,
    classification: classify(index),
    breakdown: {
      riskAdjustedPerformance: Number(riskAdjustedPerformance.toFixed(2)),
      liquidityImpact: Number(liquidityBonus.toFixed(2)),
      financialPenalty: Number(financialPenalty.toFixed(2)),
    },
  };
}
