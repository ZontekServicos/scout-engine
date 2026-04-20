/**
 * player-evolution.service.ts
 *
 * Returns the full season-by-season evolution of a player, including
 * a computed trend and scouting score.
 *
 * Endpoint: GET /api/player/:id/evolution
 */

import { prisma } from "../lib/prisma";
import { computePlayerTrend, type SeasonPoint } from "../analytics/player-trend.engine";
import { computeScoutingScore }                 from "../analytics/scouting-score.engine";

// ─── Output type ─────────────────────────────────────────────────────────────

export interface PlayerEvolutionResult {
  playerId:      string;
  playerName:    string;
  age:           number | null;
  positions:     string[];
  currentOverall: number | null;
  trend:         ReturnType<typeof computePlayerTrend>;
  scoutingScore: ReturnType<typeof computeScoutingScore>;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function getPlayerEvolution(playerId: string): Promise<PlayerEvolutionResult | null> {
  const player = await prisma.player.findUnique({
    where:  { id: playerId },
    select: {
      id:          true,
      name:        true,
      age:         true,
      positions:   true,
      overall:     true,
      potential:   true,
      marketValue: true,
      playerSeasons: {
        orderBy: [{ seasonYear: "asc" }, { createdAt: "asc" }],
        select: {
          seasonYear:  true,
          seasonLabel: true,
          overall:     true,
          goals:       true,
          assists:     true,
          minutes:     true,
          rating:      true,
          marketValue: true,
          leagueName:  true,
          teamName:    true,
        },
      },
    },
  });

  if (!player) return null;

  const seasonPoints: SeasonPoint[] = player.playerSeasons
    .filter((s) => s.seasonYear != null)
    .map((s) => ({
      seasonYear:  s.seasonYear!,
      seasonLabel: s.seasonLabel,
      overall:     s.overall,
      goals:       s.goals,
      assists:     s.assists,
      minutes:     s.minutes,
      rating:      s.rating,
      marketValue: s.marketValue,
      leagueName:  s.leagueName,
      teamName:    s.teamName,
    }));

  const trend = computePlayerTrend(seasonPoints);

  const scoutingScore = computeScoutingScore({
    overall:     player.overall,
    potential:   player.potential,
    marketValue: player.marketValue,
    age:         player.age,
    trend,
  });

  return {
    playerId:       player.id,
    playerName:     player.name,
    age:            player.age,
    positions:      player.positions,
    currentOverall: player.overall,
    trend,
    scoutingScore,
  };
}
