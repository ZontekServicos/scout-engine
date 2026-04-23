/**
 * scouting-ranking.service.ts
 *
 * Smart ranking that combines overall, trend and value efficiency.
 * Returns a ranked list of players for a given set of filters.
 *
 * Endpoint: GET /api/scouting/ranking
 *
 * Query params:
 *   position    — filter by position code (e.g. "ST", "CB")
 *   leagueId    — filter by league DB id
 *   ageMin      — minimum age
 *   ageMax      — maximum age (default 99)
 *   overallMin  — minimum overall (default 55)
 *   label       — filter by ScoutingLabel (e.g. "RISING_STAR")
 *   limit       — max results (default 50, max 100)
 */

import { Prisma }                                from "@prisma/client";
import { prisma }                                from "../lib/prisma";
import { computePlayerTrend, type SeasonPoint }  from "../analytics/player-trend.engine";
import { computeScoutingScore }                  from "../analytics/scouting-score.engine";
import type { ScoutingLabel }                    from "../analytics/scouting-score.engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScoutingRankingParams {
  position?:   string;
  leagueId?:   string;
  ageMin?:     number;
  ageMax?:     number;
  overallMin?: number;
  label?:      ScoutingLabel;
  limit?:      number;
}

export interface ScoutingRankingEntry {
  rank:           number;
  playerId:       string;
  name:           string;
  age:            number | null;
  positions:      string[];
  team:           string | null;
  league:         string | null;
  nationality:    string | null;
  imagePath:      string | null;
  overall:        number | null;
  potential:      number | null;
  marketValue:    number | null;
  scoutingTotal:  number;
  scoutingLabel:  ScoutingLabel;
  trendDirection: string;
  trendDelta:     number;
  slopePerYear:   number;
  seasonCount:    number;
  breakdown: {
    overallScore:  number;
    trendScore:    number;
    valueScore:    number;
    ceilingScore:  number;
  };
}

// ─── Position code → DB value mapping ────────────────────────────────────────

const POSITION_CODE_MAP: Record<string, string[]> = {
  GK:  ["Goalkeeper"],
  CB:  ["Centre Back", "Defender"],
  LB:  ["Left Back"],
  RB:  ["Right Back"],
  CDM: ["Defensive Midfield"],
  CM:  ["Central Midfield", "Midfielder"],
  CAM: ["Attacking Midfield"],
  LW:  ["Left Wing", "Attacker"],
  RW:  ["Right Wing", "Attacker"],
  SS:  ["Attacking Midfield", "Attacker"],
  CF:  ["Centre Forward", "Attacker"],
  ST:  ["Centre Forward", "Attacker"],
  FW:  ["Attacker", "Centre Forward"],
};

function resolvePositionFilter(position: string): string[] {
  // If it's a known short code, expand it; otherwise use as-is
  return POSITION_CODE_MAP[position.toUpperCase()] ?? [position];
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function getScoutingRanking(
  params: ScoutingRankingParams,
): Promise<{ total: number; results: ScoutingRankingEntry[] }> {
  const {
    position,
    leagueId,
    ageMin,
    ageMax    = 99,
    overallMin = 55,
    label,
    limit     = 50,
  } = params;

  const cappedLimit = Math.min(limit, 100);

  // Build Prisma where clause
  const positionDbValues = position ? resolvePositionFilter(position) : null;

  const where: Prisma.PlayerWhereInput = {
    overall:       { gte: overallMin },
    age:           { lte: ageMax, ...(ageMin != null ? { gte: ageMin } : {}) },
    playerSeasons: { some: {} },
    ...(positionDbValues ? { positions: { hasSome: positionDbValues } } : {}),
    ...(leagueId  ? { currentLeagueId: leagueId } : {}),
  };

  // Fetch candidates — we over-fetch to allow label post-filter
  const FETCH_LIMIT = Math.min(cappedLimit * 10, 2000);

  const players = await prisma.player.findMany({
    where,
    select: {
      id:              true,
      name:            true,
      age:             true,
      positions:       true,
      team:            true,
      league:          true,
      nationality:     true,
      imagePath:       true,
      overall:         true,
      potential:       true,
      marketValue:     true,
      playerSeasons: {
        orderBy: [{ seasonYear: "asc" }],
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
    take: FETCH_LIMIT,
    orderBy: { overall: "desc" },
  });

  // Score each player
  const scored = players.map((p) => {
    const seasonPoints: SeasonPoint[] = p.playerSeasons
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

    const trend        = computePlayerTrend(seasonPoints);
    const scoutingScore = computeScoutingScore({
      overall:     p.overall,
      potential:   p.potential,
      marketValue: p.marketValue,
      age:         p.age,
      trend,
    });

    return { p, trend, scoutingScore };
  });

  // Apply label filter after scoring
  const filtered = label
    ? scored.filter((s) => s.scoutingScore.label === label)
    : scored;

  // Sort by scoutingTotal desc
  filtered.sort((a, b) => b.scoutingScore.total - a.scoutingScore.total);

  const total   = filtered.length;
  const results = filtered.slice(0, cappedLimit).map(({ p, trend, scoutingScore }, i) => ({
    rank:           i + 1,
    playerId:       p.id,
    name:           p.name,
    age:            p.age,
    positions:      p.positions,
    team:           p.team,
    league:         p.league,
    nationality:    p.nationality,
    imagePath:      p.imagePath,
    overall:        p.overall,
    potential:      p.potential,
    marketValue:    p.marketValue,
    scoutingTotal:  scoutingScore.total,
    scoutingLabel:  scoutingScore.label,
    trendDirection: trend.direction,
    trendDelta:     trend.overallDelta,
    slopePerYear:   trend.slopePerYear,
    seasonCount:    trend.seasonCount,
    breakdown:      scoutingScore.breakdown,
  }));

  return { total, results };
}
