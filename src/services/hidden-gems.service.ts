/**
 * hidden-gems.service.ts
 *
 * Identifies players with strong overall, positive trend and favourable
 * market value — "hidden gems" for scouting.
 *
 * v2 changes vs original:
 *   • Uses PlayerSeason history to compute trend per player.
 *   • Ranks by ScoutingScore (overall 40% + trend 30% + value 20% + ceiling 10%)
 *     instead of just overall/valueScore.
 *   • Keeps age ≤ 26 and overall ≥ 68 as entry gates (slightly wider than v1).
 *
 * Endpoint: GET /api/players/hidden-gems
 */

import { prisma }                                            from "../lib/prisma";
import { computePlayerTrend, type SeasonPoint }             from "../analytics/player-trend.engine";
import { computeScoutingScore, type ScoutingScore }         from "../analytics/scouting-score.engine";
import type { PlayerSearchResult }                          from "../modules/player/player.search.service";

// ─── Extended result type ─────────────────────────────────────────────────────

export interface HiddenGemResult extends PlayerSearchResult {
  scoutingScore:  ScoutingScore;
  trendDirection: string;
  trendDelta:     number;
  seasonCount:    number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function findHiddenGems(limit = 20): Promise<HiddenGemResult[]> {
  const candidates = await prisma.player.findMany({
    where: {
      overall:     { gte: 68 },
      age:         { lte: 26 },
      marketValue: { not: null, gt: 0 },
    },
    select: {
      id:          true,
      name:        true,
      team:        true,
      league:      true,
      nationality: true,
      age:         true,
      positions:   true,
      overall:     true,
      potential:   true,
      marketValue: true,
      imagePath:   true,
      dnaScore:    true,
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
    take: 600,
  });

  if (candidates.length === 0) return [];

  // Compute avg market value for the group (value-efficiency gate)
  const totalValue = candidates.reduce((s, p) => s + (p.marketValue ?? 0), 0);
  const avgValue   = totalValue / candidates.length;

  const scored = candidates
    .filter((p) => (p.marketValue ?? Infinity) < avgValue)
    .map((p) => {
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

      return {
        id:             p.id,
        name:           p.name,
        team:           p.team,
        league:         p.league,
        nationality:    p.nationality,
        age:            p.age,
        positions:      p.positions,
        overall:        p.overall,
        potential:      p.potential,
        marketValue:    p.marketValue,
        imagePath:      p.imagePath,
        dnaScore:       (p.dnaScore as Record<string, unknown> | null) ?? null,
        valueScore:     scoutingScore.breakdown.valueScore,
        scoutingScore,
        trendDirection: trend.direction,
        trendDelta:     trend.overallDelta,
        seasonCount:    trend.seasonCount,
      } satisfies HiddenGemResult;
    });

  // Sort by scoutingScore total desc, then by overall desc as tiebreaker
  scored.sort((a, b) =>
    b.scoutingScore.total - a.scoutingScore.total ||
    (b.overall ?? 0) - (a.overall ?? 0),
  );

  return scored.slice(0, limit);
}
