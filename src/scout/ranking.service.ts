import { prisma } from "../lib/prisma";
import { calculateRankingScore } from "./ranking.engine";
import { POSITION_WEIGHTS } from "./ranking.weights";

export async function getRankingByPosition(position: string, page: number = 1, limit: number = 10) {
  const weights = POSITION_WEIGHTS[position];
  if (!weights) {
    throw new Error("Invalid position");
  }

  const skip = (page - 1) * limit;

  const [players, total] = await Promise.all([
    prisma.player.findMany({
      where: { position },
      skip,
      take: limit,
    }),
    prisma.player.count({
      where: { position },
    }),
  ]);

  const ranking = players
    .map((player) => ({
      id: player.id,
      name: player.name,
      position: player.position,
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
  const where = position ? { position } : {};

  const players = await prisma.player.findMany({
    where,
  });

  const ranking = players
    .map((player) => {
      const weights = POSITION_WEIGHTS[player.position];
      if (!weights) return null;

      return {
        id: player.id,
        name: player.name,
        position: player.position,
        archetype: player.archetype,
        score: calculateRankingScore(player.attributes as any, weights),
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, limit);

  return ranking;
}
