import type { PlayerIntelligenceProfile } from "../../domain/player-intelligence/types";
import { normalizeFromPlain } from "../normalizers/stats.normalizer";
import type { NormalizedPlayerStats } from "../types";

// Converts a PlayerIntelligenceProfile into isolated NormalizedPlayerStats for
// the analysis-engine comparator. The generated ratios are intentionally not
// constant; otherwise different profiles collapse after per-game normalization.

function pct(score: number, max: number): number {
  return Math.round((score / 100) * max * 100) / 100;
}

export function profileToNormalized(
  profile: PlayerIntelligenceProfile,
): NormalizedPlayerStats {
  const tech = profile.technical;
  const phys = profile.physical;
  const tac  = profile.tactical;
  const proj = profile.projection;

  const appearances = 30;
  const minutesPerGame = 55 + (phys.overall / 100) * 35;
  const minutesPlayed = Math.round(appearances * minutesPerGame);

  const goals = pct(tech.ballStriking, 24);
  const assists = pct(tech.creativity, 18);
  const shots = Math.max(goals + 1, pct((tech.ballStriking + tech.carrying) / 2, 92));
  const shotAccuracy = 0.28 + (tech.ballStriking / 100) * 0.38;
  const shotsOnTarget = Math.min(shots, Math.round(shots * shotAccuracy * 100) / 100);
  const keyPasses = pct(tech.creativity, 90);
  const passes = Math.round(tech.passing * appearances * 0.72);
  const passAccuracy = 50 + (tech.passing / 100) * 45;
  const goalEfficiency = 0.78 + (tech.ballStriking / 100) * 0.34;
  const assistEfficiency = 0.78 + (tech.creativity / 100) * 0.3;
  const xG = Math.round((goals / goalEfficiency) * 100) / 100;
  const xA = Math.round((assists / assistEfficiency) * 100) / 100;
  const tackles = pct(tac.defensiveAwareness, 88);
  const interceptions = pct(tac.defensiveAwareness, 68);
  const pressures = pct((tac.defensiveAwareness + tac.roleDiscipline) / 2, 420);
  const rating = 5.0 + (proj.currentOverall / 100) * 3.5;

  return normalizeFromPlain(
    {
      goals,
      assists,
      shots,
      shotsOnTarget,
      keyPasses,
      passes,
      passAccuracy: Math.round(passAccuracy * 10) / 10,
      xG,
      xA,
      tackles,
      interceptions,
      pressures,
      minutesPlayed,
      appearances,
      rating: Math.round(rating * 100) / 100,
    },
    {
      playerId: profile.identity.id,
      playerName: profile.identity.name,
      teamId: null,
      teamName: profile.identity.club,
      position: profile.identity.primaryPosition,
      age: profile.identity.age,
    },
  );
}
