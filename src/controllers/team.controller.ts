import { Request, Response } from "express";
import { successResponse, errorResponse } from "../lib/apiResponse";
import { withCache } from "../lib/cache";
import { analyzeTeamByPlayerIds } from "../scout/team-analysis.service";
import { teamAnalysisQuerySchema } from "../validators/simulation.validators";
import { prisma } from "../lib/prisma";

export async function analyzeTeamController(req: Request, res: Response) {
  const { playerIds } = teamAnalysisQuerySchema.parse(req.query);
  const cacheKey = `team:analysis:${playerIds.join(",")}`;
  const result = await withCache(cacheKey, 120, () => analyzeTeamByPlayerIds(playerIds));
  return res.json(successResponse(result));
}

// ---------------------------------------------------------------------------
// GET /api/teams/profile?name=Mirassol  (or ?externalId=11126)
// Returns team info + full squad with DNA + aggregate stats
// ---------------------------------------------------------------------------
export async function getTeamProfileController(req: Request, res: Response) {
  const { name, externalId } = req.query as Record<string, string>;

  if (!name && !externalId) {
    return res.status(400).json(errorResponse("Provide ?name= or ?externalId="));
  }

  const where = externalId
    ? { externalId: Number(externalId) }
    : { name: { contains: name, mode: "insensitive" as const } };

  const team = await prisma.team.findFirst({
    where,
    include: {
      country: { select: { name: true, iso2: true } },
      seasons: {
        orderBy: { externalId: "desc" },
        take: 1,
        select: { externalId: true, name: true },
      },
    },
  });

  if (!team) {
    return res.status(404).json(errorResponse("Team not found"));
  }

  // Fetch squad — all players linked to this team
  const players = await prisma.player.findMany({
    where: { teamDbId: team.id },
    select: {
      id: true,
      name: true,
      positions: true,
      age: true,
      nationality: true,
      imagePath: true,
      overall: true,
      potential: true,
      overallPace: true,
      overallShooting: true,
      overallPassing: true,
      overallDribbling: true,
      overallDefending: true,
      overallPhysical: true,
      marketValue: true,
      dnaScore: true,
    },
    orderBy: [{ overall: "desc" }, { name: "asc" }],
  });

  // Aggregate DNA + attribute scores across players that have overalls
  const scoredPlayers = players.filter((p) => p.overall !== null);

  function avgField(field: keyof typeof scoredPlayers[0]): number {
    const values = scoredPlayers
      .map((p) => p[field] as number | null)
      .filter((v): v is number => typeof v === "number");
    if (!values.length) return 0;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  }

  function avgDnaField(key: string): number {
    const values = scoredPlayers
      .map((p) => {
        const dna = p.dnaScore as Record<string, number> | null;
        return dna?.[key] ?? null;
      })
      .filter((v): v is number => typeof v === "number");
    if (!values.length) return 0;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  }

  // Position distribution
  const positionGroups: Record<string, typeof players> = {};
  for (const p of players) {
    const pos = p.positions[0] ?? "Unknown";
    if (!positionGroups[pos]) positionGroups[pos] = [];
    positionGroups[pos].push(p);
  }

  const squadStats = {
    totalPlayers: players.length,
    scoredPlayers: scoredPlayers.length,
    avgOverall:    avgField("overall"),
    avgPotential:  avgField("potential"),
    avgPace:       avgField("overallPace"),
    avgShooting:   avgField("overallShooting"),
    avgPassing:    avgField("overallPassing"),
    avgDribbling:  avgField("overallDribbling"),
    avgDefending:  avgField("overallDefending"),
    avgPhysical:   avgField("overallPhysical"),
    dnaAvg: {
      impact:      avgDnaField("impact"),
      intelligence: avgDnaField("intelligence"),
      defensiveIQ: avgDnaField("defensiveIQ"),
      consistency: avgDnaField("consistency"),
      potential:   avgDnaField("potential"),
    },
    positionDistribution: Object.entries(positionGroups).map(([pos, pList]) => ({
      position: pos,
      count: pList.length,
      avgOverall: pList.filter((p) => p.overall !== null).length > 0
        ? Math.round(
            pList
              .filter((p) => p.overall !== null)
              .reduce((a, b) => a + (b.overall ?? 0), 0) /
            pList.filter((p) => p.overall !== null).length
          )
        : null,
    })).sort((a, b) => b.count - a.count),
  };

  return res.json(successResponse({
    team: {
      id: team.id,
      externalId: team.externalId,
      name: team.name,
      shortCode: team.shortCode,
      logoPath: team.logoPath,
      country: team.country?.name ?? null,
      latestSeason: team.seasons[0]?.name ?? null,
    },
    squad: players.map((p) => ({
      id: p.id,
      name: p.name,
      positions: p.positions,
      age: p.age,
      nationality: p.nationality,
      image: p.imagePath,
      overall: p.overall,
      potential: p.potential,
      marketValue: p.marketValue,
      attributes: {
        pace: p.overallPace,
        shooting: p.overallShooting,
        passing: p.overallPassing,
        dribbling: p.overallDribbling,
        defending: p.overallDefending,
        physical: p.overallPhysical,
      },
      dna: p.dnaScore,
    })),
    stats: squadStats,
  }));
}
