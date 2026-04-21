/**
 * emerging-impact.engine.ts
 *
 * Detects players with limited sample (few minutes) but high relative efficiency.
 * Complements the overall rating — overall measures consolidated performance,
 * this module surfaces emerging or breakout signals.
 *
 * OUTPUT
 * ──────────────────────────────────────────────────────────────────────────────
 *   confidenceFactor   0–1      how much to trust the data (minutes-based)
 *   efficiencyPer90    0–100    raw per-90 quality score for the position
 *   emergingImpactScore 0–100   efficiencyPer90 × confidenceFactor
 *   lowSampleFlag      bool     true when confidenceFactor < 0.8
 *   label              string   categorical signal (see EmergingLabel)
 *   explanation        string   human-readable scout note
 */

import { clamp } from "./engine.utils";
import type { StatsInput } from "./overall.engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export type EmergingLabel =
  | "HIGH_IMPACT_LOW_SAMPLE"
  | "BREAKOUT_SIGNAL"
  | "EARLY_SIGNAL"
  | "LOW_SAMPLE_UNCERTAIN"
  | "CONSOLIDATED_PERFORMER";

export interface EmergingImpactResult {
  emergingImpactScore: number;    // 0–100
  confidenceFactor:    number;    // 0–1 (two decimals)
  efficiencyPer90:     number;    // 0–100 (raw quality, independent of minutes)
  lowSampleFlag:       boolean;
  label:               EmergingLabel;
  explanation:         string;
}

// ─── Position groups (simplified) ────────────────────────────────────────────

type BroadPos = "Attacker" | "Midfielder" | "Defender" | "Goalkeeper";

function broadPosFromRaw(position: string | null | undefined): BroadPos {
  if (!position) return "Midfielder";
  const p = position.toUpperCase();
  if (p === "GK")                                              return "Goalkeeper";
  if (["ST","CF","SS","W","RW","LW"].some(x => p === x))      return "Attacker";
  if (["CM","CAM","CDM","MEZ","WM","AM"].some(x => p === x))  return "Midfielder";
  return "Defender";
}

// ─── Confidence factor ────────────────────────────────────────────────────────

export function confidenceFactor(minutesPlayed: number): number {
  if (minutesPlayed < 90)   return 0.15;
  if (minutesPlayed < 300)  return 0.35;
  if (minutesPlayed < 900)  return 0.55;
  if (minutesPlayed < 1500) return 0.80;
  return 1.0;
}

// ─── Efficiency per 90 by position ───────────────────────────────────────────

function normalizeRating(rating: number): number {
  return clamp(((rating - 5.5) / 2.5) * 100, 0, 100);
}

function per90(value: number | null | undefined, minutes: number): number {
  if (!value || minutes <= 0) return 0;
  return (value / minutes) * 90;
}

export function calcEfficiencyPer90(
  stats:    StatsInput,
  position: string | null | undefined,
): number {
  const broadPos   = broadPosFromRaw(position);
  const minutes    = stats.minutes ?? 0;
  const normRating = normalizeRating(stats.rating ?? 6.5);

  if (broadPos === "Goalkeeper") {
    const savesPer90       = clamp(per90(stats.saves, minutes), 0, 10);
    const savesScore       = (savesPer90 / 5) * 100;          // 5 saves/90 = elite
    const cleanSheetScore  = clamp((stats.cleanSheets ?? 0) / 10, 0, 1) * 100;
    return clamp(
      normRating * 0.30 +
      savesScore * 0.40 +
      cleanSheetScore * 0.30,
      0, 100,
    );
  }

  const goalsPer90   = clamp(per90(stats.goals,   minutes), 0, 1.5);
  const assistsPer90 = clamp(per90(stats.assists, minutes), 0, 1.0);
  const appearances  = stats.appearances ?? 1;
  const consistency  = clamp(50 + appearances * 2, 0, 100);

  if (broadPos === "Attacker") {
    return clamp(
      (goalsPer90 / 1.5) * 50 +
      (assistsPer90 / 1.0) * 20 +
      normRating * 0.30,
      0, 100,
    );
  }

  if (broadPos === "Midfielder") {
    return clamp(
      (assistsPer90 / 1.0) * 30 +
      normRating * 0.45 +
      consistency  * 0.25,
      0, 100,
    );
  }

  // Defender
  const duelsWonPct = stats.duelsTotal && stats.duelsTotal > 0
    ? clamp((stats.duelsWon ?? 0) / stats.duelsTotal, 0, 1) * 100
    : 50;

  return clamp(
    normRating   * 0.50 +
    consistency  * 0.30 +
    duelsWonPct  * 0.20,
    0, 100,
  );
}

// ─── Label assignment ─────────────────────────────────────────────────────────

function assignLabel(
  efficiency:  number,
  confidence:  number,
): EmergingLabel {
  if (confidence >= 0.80) return "CONSOLIDATED_PERFORMER";
  if (efficiency >= 68 && confidence <= 0.35) return "HIGH_IMPACT_LOW_SAMPLE";
  if (efficiency >= 55 && confidence <= 0.55) return "BREAKOUT_SIGNAL";
  if (efficiency >= 40 && confidence <= 0.55) return "EARLY_SIGNAL";
  return "LOW_SAMPLE_UNCERTAIN";
}

// ─── Explanation generator ────────────────────────────────────────────────────

function buildExplanation(
  label:     EmergingLabel,
  broadPos:  BroadPos,
  stats:     StatsInput,
  efficiency: number,
): string {
  const minutes = stats.minutes ?? 0;

  if (label === "CONSOLIDATED_PERFORMER") {
    return "Performance consolidada com volume de jogo suficiente para análise confiável.";
  }

  const minText = minutes < 90
    ? "menos de 90 minutos"
    : minutes < 300
      ? `apenas ${minutes} minutos`
      : `${minutes} minutos (amostra parcial)`;

  if (label === "HIGH_IMPACT_LOW_SAMPLE") {
    if (broadPos === "Attacker") {
      const g90 = clamp(per90(stats.goals, minutes), 0, 1.5);
      if (g90 >= 0.8) return `Alta eficiência de finalização (${g90.toFixed(2)} gols/90) com ${minText} — sinal de impacto ofensivo muito forte.`;
      return `Alta eficiência ofensiva em ${minText} — sinal emergente de impacto elevado.`;
    }
    if (broadPos === "Goalkeeper") return `Excelente desempenho técnico em ${minText} — goleiro com alto potencial de destaque.`;
    return `Alta eficiência por 90 minutos, mas com baixa amostragem (${minText}).`;
  }

  if (label === "BREAKOUT_SIGNAL") {
    if (broadPos === "Attacker") return `Sinal emergente de impacto ofensivo — boa produção relativa em ${minText}.`;
    if (broadPos === "Midfielder") return `Boa criação relativa em ${minText} — midfielder com tendência de breakout.`;
    if (broadPos === "Defender") return `Consistência defensiva acima da média em ${minText} — sinal de breakout.`;
    return `Boa eficiência relativa em ${minText} — sinal de breakout a monitorar.`;
  }

  if (label === "EARLY_SIGNAL") {
    if (efficiency >= 50) return `Boa produção relativa, porém ainda sem volume consolidado (${minText}).`;
    return `Alguns sinais positivos em ${minText} — necessita mais tempo de jogo para avaliação.`;
  }

  // LOW_SAMPLE_UNCERTAIN
  return `Amostra muito limitada (${minText}) — ainda não é possível determinar o nível de impacto.`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function calculateEmergingImpact(
  stats:    StatsInput,
  position: string | null | undefined,
): EmergingImpactResult {
  const minutes    = stats.minutes ?? 0;
  const confidence = confidenceFactor(minutes);
  const efficiency = Math.round(calcEfficiencyPer90(stats, position));
  const score      = Math.round(efficiency * confidence);
  const broadPos   = broadPosFromRaw(position);
  const label      = assignLabel(efficiency, confidence);
  const lowSample  = confidence < 0.80;
  const explanation = buildExplanation(label, broadPos, stats, efficiency);

  return {
    emergingImpactScore: score,
    confidenceFactor:    confidence,
    efficiencyPer90:     efficiency,
    lowSampleFlag:       lowSample,
    label,
    explanation,
  };
}
