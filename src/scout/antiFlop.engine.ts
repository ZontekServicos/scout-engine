import { RiskResult } from "./risk.engine";
import { MedicalRiskResult } from "./injury-risk.engine";

type AntiFlopInput = {
  risk: RiskResult;
  age: number;
  performanceScore: number;
  averagePositionScore: number;
  medicalRisk?: MedicalRiskResult;
  dataCompleteness?: number; // 0..100
  leagueDifficultyCoefficient?: number; // 0..100
};

export type AntiFlopResult = {
  flopProbability: number;
  safetyIndex: number;
  confidenceScore: number;
  classification: "SAFE" | "MODERATE" | "HIGH_RISK";
  decisionHint: "PROCEED" | "PROCEED_WITH_GUARDRAILS" | "HIGH_CAUTION";
  keyDrivers: string[];
  breakdown: {
    structural: number;
    competitive: number;
    ageCurve: number;
    medical: number;
    uncertainty: number;
  };
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function resolveAgeRisk(age: number): number {
  if (age < 19) return 8;
  if (age <= 22) return 3;
  if (age <= 29) return 0;
  if (age <= 31) return 6;
  if (age <= 33) return 10;
  return 14;
}

function resolveCompetitiveRisk(performanceGap: number): number {
  if (performanceGap < -8) return 18;
  if (performanceGap < -5) return 10;
  if (performanceGap < -2) return 5;
  if (performanceGap > 6) return -4;
  return 0;
}

export function calculateAntiFlopIndex(input: AntiFlopInput): AntiFlopResult {
  const {
    risk,
    age,
    performanceScore,
    averagePositionScore,
    medicalRisk,
    dataCompleteness = 85,
    leagueDifficultyCoefficient = 75,
  } = input;

  const performanceGap = performanceScore - averagePositionScore;
  const structuralComponent = risk.breakdown.structural * 0.45;
  const competitiveComponent =
    risk.breakdown.competitive * 0.7 + resolveCompetitiveRisk(performanceGap);
  const ageComponent = risk.breakdown.age * 0.5 + resolveAgeRisk(age);
  const medicalComponent = (medicalRisk?.medicalRisk ?? 0) * 0.5;

  const uncertaintyFromData = (100 - clamp(dataCompleteness)) * 0.2;
  const uncertaintyFromMedical = medicalRisk ? (100 - medicalRisk.confidenceScore) * 0.15 : 4;
  const uncertaintyComponent = uncertaintyFromData + uncertaintyFromMedical;
  const leagueAdjustment = Math.max(-6, Math.min(6, (leagueDifficultyCoefficient - 75) * 0.12));

  let flopProbability =
    structuralComponent +
    competitiveComponent +
    ageComponent +
    medicalComponent +
    uncertaintyComponent +
    leagueAdjustment;

  flopProbability = clamp(Math.round(flopProbability));
  const safetyIndex = 100 - flopProbability;

  const confidenceBase = dataCompleteness * 0.6 + (medicalRisk?.confidenceScore ?? 65) * 0.4;
  const confidenceScore = clamp(Math.round(confidenceBase));

  let classification: AntiFlopResult["classification"];
  if (flopProbability < 25) classification = "SAFE";
  else if (flopProbability < 55) classification = "MODERATE";
  else classification = "HIGH_RISK";

  let decisionHint: AntiFlopResult["decisionHint"] = "PROCEED";
  if (classification === "MODERATE") {
    decisionHint = "PROCEED_WITH_GUARDRAILS";
  } else if (classification === "HIGH_RISK") {
    decisionHint = "HIGH_CAUTION";
  }

  const keyDrivers = [
    { label: "Structural imbalance", value: structuralComponent },
    { label: "Competitive gap", value: competitiveComponent },
    { label: "Age curve", value: ageComponent },
    { label: "Medical history", value: medicalComponent },
    { label: "Data uncertainty", value: uncertaintyComponent },
    { label: "League adaptation", value: leagueAdjustment },
  ]
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .filter((item) => item.value > 0)
    .map((item) => item.label);

  return {
    flopProbability,
    safetyIndex,
    confidenceScore,
    classification,
    decisionHint,
    keyDrivers,
    breakdown: {
      structural: Number(structuralComponent.toFixed(2)),
      competitive: Number(competitiveComponent.toFixed(2)),
      ageCurve: Number(ageComponent.toFixed(2)),
      medical: Number(medicalComponent.toFixed(2)),
      uncertainty: Number(uncertaintyComponent.toFixed(2)),
    },
  };
}
