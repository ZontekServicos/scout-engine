type ExplainabilityInput = {
  risk: {
    factors: string[];
    breakdown: {
      competitive: number;
      age: number;
      structural: number;
    };
  };
  antiFlop: {
    keyDrivers?: string[];
    breakdown: {
      structural: number;
      competitive: number;
      ageCurve: number;
      medical: number;
      uncertainty: number;
    };
  };
  financialRisk: {
    riskLevel: string;
    riskIndex: number;
  };
  growthProjection?: {
    growthIndex: number;
    expectedPeak: number;
  };
};

export type ExplainabilityResult = {
  topFactors: string[];
  riskDrivers: string[];
  positiveSignals: string[];
  negativeSignals: string[];
};

export function buildExplainability(input: ExplainabilityInput): ExplainabilityResult {
  const topFactors = [...input.risk.factors].slice(0, 3);

  const riskDrivers = input.antiFlop.keyDrivers?.length
    ? input.antiFlop.keyDrivers
    : Object.entries(input.antiFlop.breakdown)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([driver]) => driver);

  const positiveSignals: string[] = [];
  const negativeSignals: string[] = [];

  if (input.financialRisk.riskIndex < 40) positiveSignals.push("Controlled financial exposure");
  if (input.risk.breakdown.structural < 15) positiveSignals.push("Good structural balance");
  if ((input.growthProjection?.growthIndex ?? 0) >= 60) positiveSignals.push("High growth trajectory");

  if (input.financialRisk.riskLevel === "HIGH") negativeSignals.push("High financial risk profile");
  if (input.antiFlop.breakdown.medical > 15) negativeSignals.push("Medical risk is a key concern");
  if (input.risk.breakdown.age > 10) negativeSignals.push("Age curve may limit long-term return");

  return {
    topFactors,
    riskDrivers,
    positiveSignals,
    negativeSignals,
  };
}

