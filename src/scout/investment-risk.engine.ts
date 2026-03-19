import { FinancialRiskResult } from "./financial-risk.engine";
import { LiquidityResult } from "./liquidity.engine";
import { RiskResult } from "./risk.engine";

export type CompositeRiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type CompositeRiskProfile = {
  score: number;
  level: CompositeRiskLevel;
  explanation: string;
  components: {
    structuralRisk: number;
    financialRisk: number;
    liquidityScore: number;
    ageAdjustment: number;
    potentialAdjustment: number;
    compositeBase: number;
  };
};

function clamp(value: number, min = 0, max = 10) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number) {
  return Number(value.toFixed(1));
}

function normalizeStructuralRisk(rawStructuralRisk: number) {
  // The structural engine rarely reaches 100 in practice, so we normalize against
  // the real operating range to keep structural risk meaningful on a 0-10 scale.
  return clamp(rawStructuralRisk / 7);
}

function normalizeFinancialRisk(rawFinancialRisk: number) {
  return clamp(rawFinancialRisk / 7);
}

function normalizeLiquidityScore(rawLiquidityScore: number) {
  return clamp(rawLiquidityScore / 10);
}

function resolveAgeAdjustment(age: number) {
  if (age >= 32) return 0.45;
  if (age >= 29) return 0.2;
  if (age <= 20) return 0.15;
  return 0;
}

function resolvePotentialAdjustment(overall: number, potential: number) {
  const upside = Math.max(0, potential - overall);

  if (upside >= 6) return -0.35;
  if (upside >= 3) return -0.15;
  return 0;
}

export function resolveCompositeRiskLevel(score: number): CompositeRiskLevel {
  if (score >= 5.8) {
    return "HIGH";
  }

  if (score >= 4.2) {
    return "MEDIUM";
  }

  return "LOW";
}

function buildRiskExplanation(params: {
  level: CompositeRiskLevel;
  structuralRisk: number;
  financialRisk: number;
  liquidityScore: number;
  overall: number;
  potential: number;
}) {
  const { level, structuralRisk, financialRisk, liquidityScore, overall, potential } = params;
  const upside = Math.max(0, potential - overall);
  const structuralPressure = structuralRisk * 0.5;
  const financialPressure = financialRisk * 0.3;
  const liquidityPressure = (10 - liquidityScore) * 0.2;

  if (level === "HIGH") {
    if (liquidityScore <= 4.5 && financialPressure >= structuralPressure) {
      return "Alto risco por combinar baixa liquidez com exposicao financeira significativa.";
    }

    if (structuralPressure >= financialPressure) {
      return "Alto risco por combinar exposicao estrutural elevada com baixa margem para erro.";
    }

    return "Alto risco pelo acumulo de pressao estrutural, financeira e menor opcao de saida.";
  }

  if (level === "LOW") {
    if (liquidityScore >= 7.5 && structuralRisk <= 4.5) {
      return "Perfil de baixo risco, sustentado por boa liquidez e baixa exposicao estrutural.";
    }

    if (upside >= 5) {
      return "Perfil de baixo risco, com upside relevante e liquidez capaz de proteger a decisao.";
    }

    return "Perfil de baixo risco, com equilibrio entre custo, liquidez e exposicao estrutural.";
  }

  if (financialPressure >= structuralPressure && liquidityScore >= 6.5) {
    return "Risco moderado devido ao custo de entrada, compensado por liquidez saudavel.";
  }

  if (structuralPressure >= financialPressure) {
    return "Risco moderado por exposicao estrutural acima da media, ainda administravel.";
  }

  if (liquidityPressure >= 1) {
    return "Risco moderado com necessidade de monitorar liquidez e timing de saida.";
  }

  return "Risco moderado, com equilibrio razoavel entre exposicao estrutural e financeira.";
}

function buildStructuralBreakdown(risk: RiskResult) {
  if (!risk.factors.length) {
    return "Perfil estrutural equilibrado para o recorte atual.";
  }

  const highlights = risk.factors.slice(0, 2).map((factor) => factor.replace(/\.$/, "").toLowerCase());
  return `Leitura estrutural impactada por ${highlights.join(" e ")}.`;
}

function buildInvestmentProfile(level: CompositeRiskLevel, liquidityScore: number, potential: number, overall: number) {
  const upside = Math.max(0, potential - overall);

  if (level === "LOW" && liquidityScore >= 7) {
    return "Entrada com boa protecao de liquidez e retorno mais previsivel.";
  }

  if (level === "MEDIUM" && upside >= 4) {
    return "Custo relevante, mas com upside que pode compensar a exposicao.";
  }

  if (level === "HIGH") {
    return "Tese exige disciplina de preco e conviccao esportiva acima da media.";
  }

  return "Perfil equilibrado entre retorno esportivo, custo e opcionalidade de revenda.";
}

function buildCapitalExposure(financialRisk: number) {
  if (financialRisk >= 6.5) return "Alta";
  if (financialRisk >= 4.2) return "Media";
  return "Baixa";
}

export function buildCompositeRiskProfile(params: {
  age: number;
  overall: number;
  potential: number;
  structuralRisk: RiskResult;
  financialRisk: FinancialRiskResult;
  liquidity: LiquidityResult;
}): CompositeRiskProfile {
  const structuralRisk = normalizeStructuralRisk(params.structuralRisk.totalRisk);
  const financialRisk = normalizeFinancialRisk(params.financialRisk.riskIndex);
  const liquidityScore = normalizeLiquidityScore(params.liquidity.liquidityScore);
  const ageAdjustment = resolveAgeAdjustment(params.age);
  const potentialAdjustment = resolvePotentialAdjustment(params.overall, params.potential);
  const compositeBase = structuralRisk * 0.5 + financialRisk * 0.3 + (10 - liquidityScore) * 0.2;
  const score = clamp(compositeBase + ageAdjustment + potentialAdjustment);
  const level = resolveCompositeRiskLevel(score);

  return {
    score: round(score),
    level,
    explanation: buildRiskExplanation({
      level,
      structuralRisk,
      financialRisk,
      liquidityScore,
      overall: params.overall,
      potential: params.potential,
    }),
    components: {
      structuralRisk: round(structuralRisk),
      financialRisk: round(financialRisk),
      liquidityScore: round(liquidityScore),
      ageAdjustment: round(ageAdjustment),
      potentialAdjustment: round(potentialAdjustment),
      compositeBase: round(compositeBase),
    },
  };
}

export function buildNormalizedRiskPayload(params: {
  age: number;
  overall: number;
  potential: number;
  structuralRisk: RiskResult;
  financialRisk: FinancialRiskResult;
  liquidity: LiquidityResult;
}) {
  const compositeRisk = buildCompositeRiskProfile(params);
  const structuralScore = compositeRisk.components.structuralRisk;
  const financialScore = compositeRisk.components.financialRisk;
  const liquidityScore = compositeRisk.components.liquidityScore;

  return {
    risk: compositeRisk,
    structuralRisk: {
      score: structuralScore,
      level: resolveCompositeRiskLevel(structuralScore),
      breakdown: buildStructuralBreakdown(params.structuralRisk),
      rawScore: params.structuralRisk.totalRisk,
      rawLevel: params.structuralRisk.riskLevel,
      factors: params.structuralRisk.factors,
    },
    financialRisk: {
      index: financialScore,
      capitalExposure: buildCapitalExposure(financialScore),
      investmentProfile: buildInvestmentProfile(
        compositeRisk.level,
        liquidityScore,
        params.potential,
        params.overall,
      ),
      rawIndex: params.financialRisk.riskIndex,
      rawLevel: params.financialRisk.riskLevel,
      expectedLossProbability: params.financialRisk.expectedLossProbability,
    },
    liquidity: {
      score: liquidityScore,
      resaleWindow: params.liquidity.resaleWindow,
      marketProfile: params.liquidity.marketProfile,
      investmentGrade: params.liquidity.investmentGrade,
      rawScore: params.liquidity.liquidityScore,
    },
  };
}
