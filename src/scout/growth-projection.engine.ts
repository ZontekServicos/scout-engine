export type GrowthProjectionInput = {
  age: number;
  position: string;
  currentOverall: number;
  performanceHistory: number[];
  physicalLoad: number; // 0..100
  performanceStability: number; // 0..100
  leagueDifficultyCoefficient?: number; // 0..100
};

export type GrowthProjectionResult = {
  growthIndex: number;
  expectedOverallNextSeason: number;
  expectedPeak: number;
  developmentCurve: {
    season1: number;
    season2: number;
    season3: number;
  };
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function getAgeGrowthFactor(age: number): number {
  if (age <= 20) return 12;
  if (age <= 23) return 9;
  if (age <= 26) return 6;
  if (age <= 29) return 3;
  if (age <= 32) return 0;
  return -4;
}

function getPositionVolatility(position: string): number {
  if (["ST", "LW", "RW"].includes(position)) return 4;
  if (["CM", "CDM", "CB"].includes(position)) return 2;
  return 3;
}

export function calculateGrowthProjection(input: GrowthProjectionInput): GrowthProjectionResult {
  const {
    age,
    position,
    currentOverall,
    performanceHistory,
    physicalLoad,
    performanceStability,
    leagueDifficultyCoefficient = 75,
  } = input;

  const historyAvg = average(performanceHistory.length ? performanceHistory : [currentOverall]);
  const trend = historyAvg - currentOverall;
  const ageFactor = getAgeGrowthFactor(age);
  const loadPenalty = (physicalLoad - 50) * 0.08;
  const stabilityBonus = (performanceStability - 50) * 0.06;
  const leagueFactor = (leagueDifficultyCoefficient - 75) * 0.04;
  const volatility = getPositionVolatility(position);

  const growthRaw = ageFactor + trend * 0.4 - loadPenalty + stabilityBonus - volatility + leagueFactor;
  const growthIndex = clamp(Math.round(50 + growthRaw));

  const season1 = clamp(Math.round(currentOverall + growthRaw * 0.35));
  const season2 = clamp(Math.round(season1 + growthRaw * 0.25));
  const season3 = clamp(Math.round(season2 + growthRaw * 0.15));

  const expectedOverallNextSeason = season1;
  const expectedPeak = Math.max(season1, season2, season3);

  return {
    growthIndex,
    expectedOverallNextSeason,
    expectedPeak,
    developmentCurve: {
      season1,
      season2,
      season3,
    },
  };
}

