// ===============================
// 💰 LIQUIDITY ENGINE v1
// ===============================

import { RiskResult } from "./risk.engine";
import { AntiFlopResult } from "./antiFlop.engine";

export type LiquidityResult = {
  liquidityScore: number;
  resaleWindow: string;
  marketProfile: string;
  investmentGrade: "A" | "B" | "C" | "D";
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export function calculateLiquidityScore(params: {
  age: number;
  performanceScore: number;
  averagePositionScore: number;
  risk: RiskResult;
  antiFlop: AntiFlopResult;
}): LiquidityResult {
  const { age, performanceScore, averagePositionScore, risk, antiFlop } = params;

  const performanceGap = performanceScore - averagePositionScore;

  // ===============================
  // 📊 COMPONENTES
  // ===============================

  // Idade ideal de revenda: 21–27
  let ageScore = 0;

  if (age >= 21 && age <= 27) ageScore = 30;
  else if (age >= 18 && age < 21) ageScore = 20;
  else if (age >= 28 && age <= 30) ageScore = 15;
  else if (age > 30) ageScore = 5;

  // Performance
  let performanceScoreWeight =
    performanceGap > 8 ? 30 : performanceGap > 3 ? 20 : performanceGap > -3 ? 10 : 0;

  // Segurança estrutural
  const structuralScore = (100 - risk.totalRisk) * 0.2;

  const antiFlopScore = antiFlop.safetyIndex * 0.2;

  // ===============================
  // 🎯 LIQUIDITY FINAL
  // ===============================

  let liquidityScore = ageScore + performanceScoreWeight + structuralScore + antiFlopScore;

  liquidityScore = clamp(Math.round(liquidityScore));

  let resaleWindow = "Low liquidity";

  if (liquidityScore >= 70) resaleWindow = "12-24 months";
  else if (liquidityScore >= 40) resaleWindow = "24-36 months";

  let marketProfile = "Limited resale potential";

  if (liquidityScore >= 70) marketProfile = "High resale potential";
  else if (liquidityScore >= 40) marketProfile = "Moderate resale potential";

  let investmentGrade: LiquidityResult["investmentGrade"] = "D";

  if (liquidityScore >= 80) investmentGrade = "A";
  else if (liquidityScore >= 60) investmentGrade = "B";
  else if (liquidityScore >= 40) investmentGrade = "C";

  return {
    liquidityScore,
    resaleWindow,
    marketProfile,
    investmentGrade,
  };
}
