import type { PlayerIntelligenceProfile } from "../../domain/player-intelligence/types";
import { normalizeFromPlain } from "../normalizers/stats.normalizer";
import type { NormalizedPlayerStats } from "../types";

// ---------------------------------------------------------------------------
// Converts a PlayerIntelligenceProfile (block scores 0-100) into
// NormalizedPlayerStats for the analysis-engine comparator.
//
// Scaling rationale:
//   block scores are 0-100; we scale to realistic per-season counts so that
//   the comparator's internal per-game rates produce meaningful deltas.
//   All values are relative — what matters is the ratio between players.
// ---------------------------------------------------------------------------

function pct(score: number, max: number): number {
  return Math.round((score / 100) * max);
}

export function profileToNormalized(
  profile: PlayerIntelligenceProfile,
): NormalizedPlayerStats {
  const tech = profile.technical;
  const phys = profile.physical;
  const tac  = profile.tactical;
  const mkt  = profile.market;
  const proj = profile.projection;

  // Derive appearances / minutes from physical stamina
  const appearances = Math.max(1, pct(phys.stamina, 36));
  const minutesPlayed = appearances * Math.round(60 + (phys.stamina / 100) * 30);

  // Goals: ballStriking drives goal rate (scale: top striker ~25/season)
  const goals      = pct(tech.ballStriking, 26);
  // Assists: creativity drives assist rate (scale: top creator ~18/season)
  const assists    = pct(tech.creativity, 18);
  // Shots: ballStriking + carrying (up to ~100/season)
  const shots      = pct((tech.ballStriking + tech.carrying) / 2, 90);
  // Shots on target: efficiency proxy
  const shotsOnTarget = Math.round(shots * (0.35 + (tech.ballStriking / 100) * 0.25));
  // Key passes: creativity (top ~90/season)
  const keyPasses  = pct(tech.creativity, 88);
  // Passes total: passing quality × appearances (top ~2500/season)
  const passes     = pct(tech.passing, 70) * appearances;
  // Pass accuracy: use passing block directly (it's already 0-100 scaled)
  const passAccuracy = 55 + (tech.passing / 100) * 40; // range: 55–95%
  // xG / xA: proportional to goals/assists with slight efficiency discount
  const xG         = Math.round(goals * 0.85);
  const xA         = Math.round(assists * 0.85);
  // Defensive: defensiveAwareness drives tackles/interceptions
  const tackles       = pct(tac.defensiveAwareness, 80);
  const interceptions = pct(tac.defensiveAwareness, 60);
  const pressures     = pct((tac.defensiveAwareness + tac.roleDiscipline) / 2, 400);
  // Rating: derived from currentOverall (proj range 60-99 → rating 6.2-8.5)
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
