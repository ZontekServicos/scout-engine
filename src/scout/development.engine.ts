// ==========================================
// 📈 DEVELOPMENT ENGINE v1
// ==========================================

import { RiskResult } from "./risk.engine";
import { AntiFlopResult } from "./antiFlop.engine";

export type DevelopmentResult = {
  growthPotential: number;
  ceiling: "Elite Potential" | "High Potential" | "Moderate" | "Limited";
  developmentStage: "Ascending" | "Prime" | "Plateau" | "Declining";
  evolutionWindow: string;
  riskOfStagnation: "Low" | "Medium" | "High";
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export function calculateDevelopmentProfile(params: {
  age: number;
  performanceScore: number;
  averagePositionScore: number;
  risk: RiskResult;
  antiFlop: AntiFlopResult;
}): DevelopmentResult {
  const { age, performanceScore, averagePositionScore, risk, antiFlop } = params;

  const performanceGap = performanceScore - averagePositionScore;

  // ===============================
  // 📊 Growth Base
  // ===============================

  let ageFactor = 0;

  if (age <= 21) ageFactor = 35;
  else if (age <= 24) ageFactor = 25;
  else if (age <= 27) ageFactor = 15;
  else if (age <= 30) ageFactor = 5;
  else ageFactor = -10;

  const performanceFactor =
    performanceGap > 8 ? 25 : performanceGap > 3 ? 15 : performanceGap > -3 ? 5 : -10;

  const structuralFactor = (100 - risk.totalRisk) * 0.2;

  const safetyFactor = antiFlop.safetyIndex * 0.15;

  let growthPotential = ageFactor + performanceFactor + structuralFactor + safetyFactor;

  growthPotential = clamp(Math.round(growthPotential));

  // ===============================
  // 📈 Stage
  // ===============================

  let developmentStage: DevelopmentResult["developmentStage"] = "Plateau";

  if (age <= 24) developmentStage = "Ascending";
  else if (age <= 28) developmentStage = "Prime";
  else if (age <= 31) developmentStage = "Plateau";
  else developmentStage = "Declining";

  // ===============================
  // 🎯 Ceiling
  // ===============================

  let ceiling: DevelopmentResult["ceiling"] = "Limited";

  if (growthPotential >= 80) ceiling = "Elite Potential";
  else if (growthPotential >= 60) ceiling = "High Potential";
  else if (growthPotential >= 40) ceiling = "Moderate";

  // ===============================
  // 🕒 Evolution Window
  // ===============================

  let evolutionWindow = "Low evolution window";

  if (developmentStage === "Ascending") evolutionWindow = "2-3 seasons";
  else if (developmentStage === "Prime") evolutionWindow = "1-2 seasons";
  else if (developmentStage === "Plateau") evolutionWindow = "Short-term stability";
  else evolutionWindow = "Declining phase";

  // ===============================
  // ⚠ Risk of stagnation
  // ===============================

  let riskOfStagnation: DevelopmentResult["riskOfStagnation"] = "Low";

  if (growthPotential < 40) riskOfStagnation = "High";
  else if (growthPotential < 60) riskOfStagnation = "Medium";

  return {
    growthPotential,
    ceiling,
    developmentStage,
    evolutionWindow,
    riskOfStagnation,
  };
}
