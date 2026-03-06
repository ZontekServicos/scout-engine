import { RiskResult } from "./risk.engine";

export function buildExecutiveRiskSummary(playerName: string, risk: RiskResult): string {
  const { totalRisk, riskLevel, breakdown } = risk;

  let dominantFactor = "structural balance";

  // Detect dominant risk driver safely
  if (breakdown.competitive >= breakdown.age) {
    dominantFactor = "competitive gap";
  } else {
    dominantFactor = "age profile";
  }

  return `${playerName} presents ${riskLevel.toLowerCase()} structural risk (score ${totalRisk}), primarily driven by ${dominantFactor}.`;
}
