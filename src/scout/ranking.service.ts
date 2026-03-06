import { prisma } from "../lib/prisma";
import { calculateRankingScore } from "./ranking.engine";
import { POSITION_WEIGHTS } from "./ranking.weights";
import { getPrimaryPosition } from "../utils/positions";

export async function getRankingByPosition(position: string, page: number = 1, limit: number = 10) {
  const weights = POSITION_WEIGHTS[position];
  if (!weights) {
    throw new Error("Invalid position");
  }

  const skip = (page - 1) * limit;

  const [players, total] = await Promise.all([
    prisma.player.findMany({
      where: { positions: { has: position } },
      skip,
      take: limit,
    }),
    prisma.player.count({
      where: { positions: { has: position } },
    }),
  ]);

  const ranking = players
    .map((player) => ({
      id: player.id,
      playerKey: player.id,
      name: player.name,
      nomeJogador: player.name,
      position: getPrimaryPosition(player),
      archetype: player.archetype,
      score: calculateRankingScore(player.attributes as any, weights),
    }))
    .sort((a, b) => b.score - a.score);

  return {
    position,
    page,
    limit,
    total,
    ranking,
  };
}
export async function getLeaderboard(position?: string, limit: number = 10) {
  const where = position ? { positions: { has: position } } : {};

  const players = await prisma.player.findMany({
    where,
  });

  const ranking = players
    .map((player) => {
      const primaryPosition = getPrimaryPosition(player);
      const weights = POSITION_WEIGHTS[primaryPosition];
      if (!weights) return null;

      return {
        id: player.id,
        playerKey: player.id,
        name: player.name,
        nomeJogador: player.name,
        position: primaryPosition,
        archetype: player.archetype,
        score: calculateRankingScore(player.attributes as any, weights),
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, limit);

  return ranking;
}
