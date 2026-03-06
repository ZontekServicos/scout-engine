// ===============================================
// 🧠 RISK ENGINE — ELITE STRUCTURAL VERSION
// ===============================================

import { EliteCategoryIndex } from "./skilltree.elite";

export type RiskInput = {
  age: number;
  position: string;
  performanceScore: number;
  averagePositionScore: number;
  categoryIndex: EliteCategoryIndex;
};

export type RiskBreakdown = {
  competitive: number;
  age: number;
  structural: number;
};

export type RiskResult = {
  totalRisk: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  breakdown: RiskBreakdown;
  factors: string[];
};

export function calculateRiskScore(input: RiskInput): RiskResult {
  let competitiveRisk = 0;
  let ageRisk = 0;
  let structuralRisk = 0;
  const factors: string[] = [];

  // =====================================
  // 1️⃣ COMPETITIVE GAP RISK
  // =====================================

  const performanceGap = input.performanceScore - input.averagePositionScore;

  if (performanceGap < -5) {
    competitiveRisk = 15;
    factors.push("Below positional benchmark.");
  } else if (performanceGap < -2) {
    competitiveRisk = 8;
    factors.push("Slight competitive gap detected.");
  }

  // =====================================
  // 2️⃣ AGE RISK
  // =====================================

  if (input.age > 32) {
    ageRisk = 15;
    factors.push("Advanced age risk.");
  } else if (input.age > 30) {
    ageRisk = 10;
    factors.push("Age-related decline risk.");
  }

  // =====================================
  // 3️⃣ STRUCTURAL CLUSTER RISK
  // =====================================

  const { attacking, skill, movement, power, mentality, defending } = input.categoryIndex;

  // 🔹 Fragilidade Mental
  if (mentality < 55) {
    structuralRisk += 15;
    factors.push("Low mental consistency.");
  }

  // 🔹 Fragilidade Física
  if (power < 55 || movement < 55) {
    structuralRisk += 10;
    factors.push("Physical vulnerability detected.");
  }

  // 🔹 Desbalanceamento estrutural
  const maxCluster = Math.max(attacking, skill, movement, power, mentality, defending);

  const minCluster = Math.min(attacking, skill, movement, power, mentality, defending);

  if (maxCluster - minCluster > 30) {
    structuralRisk += 12;
    factors.push("High structural imbalance detected.");
  }

  // 🔹 Cluster extremamente fraco
  if (minCluster < 45) {
    structuralRisk += 10;
    factors.push("Critical weakness in one technical sector.");
  }

  // =====================================
  // TOTAL RISK
  // =====================================

  const totalRisk = Math.min(100, competitiveRisk + ageRisk + structuralRisk);

  let riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";

  if (totalRisk >= 60) riskLevel = "CRITICAL";
  else if (totalRisk >= 40) riskLevel = "HIGH";
  else if (totalRisk >= 20) riskLevel = "MEDIUM";

  return {
    totalRisk,
    riskLevel,
    breakdown: {
      competitive: competitiveRisk,
      age: ageRisk,
      structural: structuralRisk,
    },
    factors,
  };
}
