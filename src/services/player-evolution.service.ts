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
  name:          string;
  playerName:    string;
  age:           number | null;
  height:        number | null;
  weight:        number | null;
  positions:     string[];
  position:      string | null;
  currentClub:   string | null;
  currentLeague: string | null;
  dominantFoot:  string | null;
  marketValue:   number | null;
  estimatedValue: number | null;
  agencyName:    string | null;
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
      height:      true,
      weight:      true,
      foot:        true,
      team:        true,
      league:      true,
      agencyName:  true,
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
          potential:   true,
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

  // Use the most recent season's overall/potential — fall back to Player-level fields
  const seasonsWithOverall = player.playerSeasons.filter((s) => s.overall != null);
  const latestSeason = seasonsWithOverall[seasonsWithOverall.length - 1] ?? null;
  const latestSeasonWithContext = player.playerSeasons[player.playerSeasons.length - 1] ?? null;
  const currentOverall  = latestSeason?.overall   ?? player.overall;
  const currentPotential = latestSeason?.potential ?? player.potential;

  const scoutingScore = computeScoutingScore({
    overall:     currentOverall,
    potential:   currentPotential,
    marketValue: player.marketValue,
    age:         player.age,
    trend,
  });

  return {
    playerId:       player.id,
    name:           player.name,
    playerName:     player.name,
    age:            player.age,
    height:         player.height,
    weight:         player.weight,
    positions:      player.positions,
    position:       player.positions[0] ?? null,
    currentClub:    player.team ?? latestSeasonWithContext?.teamName ?? null,
    currentLeague:  player.league ?? latestSeasonWithContext?.leagueName ?? null,
    dominantFoot:   player.foot,
    marketValue:    player.marketValue,
    estimatedValue: player.marketValue,
    agencyName:     player.agencyName,
    currentOverall,
    trend,
    scoutingScore,
  };
}
