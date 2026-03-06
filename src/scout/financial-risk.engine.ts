export type FinancialRiskInput = {
  structuralRisk: number;
  flopProbability: number;
  liquidityScore: number;
  age: number;
  overall: number;
};

export type FinancialRiskResult = {
  riskIndex: number;
  riskLevel: "LOW" | "CONTROLLED" | "ELEVATED" | "HIGH";
  expectedLossProbability: string;
  capitalExposure: string;
  investmentProfile: string;
};

function calculateAgeFactor(age: number): number {
  if (age <= 23) return 5;
  if (age <= 27) return 8;
  if (age <= 31) return 15;
  return 25;
}

export function calculateFinancialRisk(input: FinancialRiskInput): FinancialRiskResult {
  const { structuralRisk, flopProbability, liquidityScore, age, overall } = input;

  const ageFactor = calculateAgeFactor(age);

  const liquidityPenalty = 100 - liquidityScore;

  const riskIndex = Math.min(
    100,
    Math.round(
      structuralRisk * 0.4 + flopProbability * 0.3 + liquidityPenalty * 0.2 + ageFactor * 0.1,
    ),
  );

  let riskLevel: FinancialRiskResult["riskLevel"];
  if (riskIndex < 25) riskLevel = "LOW";
  else if (riskIndex < 45) riskLevel = "CONTROLLED";
  else if (riskIndex < 70) riskLevel = "ELEVATED";
  else riskLevel = "HIGH";

  let expectedLossProbability = "Low";
  if (riskIndex >= 60) expectedLossProbability = "High";
  else if (riskIndex >= 40) expectedLossProbability = "Moderate";

  let capitalExposure = "Low";
  if (riskIndex >= 60) capitalExposure = "High";
  else if (riskIndex >= 35) capitalExposure = "Moderate";

  let investmentProfile = "Stable Asset";

  if (overall >= 80 && riskIndex < 40) investmentProfile = "Strategic Asset";
  else if (riskIndex >= 60) investmentProfile = "Speculative Asset";

  return {
    riskIndex,
    riskLevel,
    expectedLossProbability,
    capitalExposure,
    investmentProfile,
  };
}
