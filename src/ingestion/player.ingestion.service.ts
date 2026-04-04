import { prisma } from "../lib/prisma";
import { fetchPlayerWithStats } from "../integrations/sportmonks/sportmonks.client";
import { normalizeStats } from "../integrations/sportmonks/pipeline/normalize-stats";
import { calculateOverall } from "../analytics/overall.engine";
import type { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlayerWithStats = Prisma.PlayerGetPayload<{
  include: { statsSnapshots: true; dbTeam: true };
}>;

// ---------------------------------------------------------------------------
// ingestPlayerFromSportmonks
//
// Fetches player + stats from the Sportmonks API, persists to DB.
// Always creates a new PlayerStats row (historical snapshots).
// ---------------------------------------------------------------------------

export async function ingestPlayerFromSportmonks(sportmonksId: number): Promise<PlayerWithStats> {
  const raw = await fetchPlayerWithStats(sportmonksId);
  const { player, stats } = raw;

  // 1. Upsert team
  let teamDbId: string | null = null;
  if (player.team?.id) {
    const team = await prisma.team.upsert({
      where: { externalId: player.team.id },
      update: { name: player.team.name },
      create: { externalId: player.team.id, name: player.team.name },
    });
    teamDbId = team.id;
  }

  // 2. Derive age
  let age = 0;
  if (player.date_of_birth) {
    const birth = new Date(player.date_of_birth);
    const today = new Date();
    age = today.getFullYear() - birth.getFullYear();
    if (
      today.getMonth() < birth.getMonth() ||
      (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
    ) age--;
  }

  // 3. Normalize stats + calculate overall
  const normalized = normalizeStats(stats);
  const position = player.position?.name ?? player.detailedPosition?.name ?? null;
  const overallResult = calculateOverall(normalized, position);
  const contractEnd = player.contract_until ? new Date(player.contract_until) : null;

  // 4. Upsert player
  const slug = `sportmonks-${sportmonksId}`;
  const name = player.display_name;
  const nameNormalized = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const dbPlayer = await prisma.player.upsert({
    where: { slug },
    update: {
      name,
      nameNormalized,
      team: player.team?.name ?? null,
      league: player.league?.name ?? null,
      imagePath: player.image_path ?? null,
      imageFetched: true,
      age,
      teamDbId,
      height: player.height ?? null,
      weight: player.weight ?? null,
      foot: player.foot ?? null,
      marketValue: player.market_value ?? null,
      contractEnd,
      overall: overallResult.overall,
      overallPace:        overallResult.breakdown.pace,
      overallShooting:    overallResult.breakdown.shooting,
      overallPassing:     overallResult.breakdown.passing,
      overallDribbling:   overallResult.breakdown.dribbling,
      overallDefending:   overallResult.breakdown.defending,
      overallPhysical:    overallResult.breakdown.physical,
      overallGkDiving:    overallResult.breakdown.gkDiving    ?? null,
      overallGkHandling:  overallResult.breakdown.gkHandling  ?? null,
      overallGkKicking:   overallResult.breakdown.gkKicking   ?? null,
      overallGkReflex:    overallResult.breakdown.gkReflex    ?? null,
      overallGkPositioning: overallResult.breakdown.gkPositioning ?? null,
      overallCalculatedAt: new Date(),
    },
    create: {
      slug,
      name,
      nameNormalized,
      source: "sportmonks",
      externalId: String(sportmonksId),
      positions: position ? [position] : [],
      age,
      nationality: player.nationality?.name ?? "Desconhecida",
      team: player.team?.name ?? null,
      league: player.league?.name ?? null,
      imagePath: player.image_path ?? null,
      imageFetched: true,
      height: player.height ?? null,
      weight: player.weight ?? null,
      foot: player.foot ?? null,
      marketValue: player.market_value ?? null,
      contractEnd,
      attributes: {},
      archetype: {},
      teamDbId,
      overall: overallResult.overall,
      overallPace:        overallResult.breakdown.pace,
      overallShooting:    overallResult.breakdown.shooting,
      overallPassing:     overallResult.breakdown.passing,
      overallDribbling:   overallResult.breakdown.dribbling,
      overallDefending:   overallResult.breakdown.defending,
      overallPhysical:    overallResult.breakdown.physical,
      overallGkDiving:    overallResult.breakdown.gkDiving    ?? null,
      overallGkHandling:  overallResult.breakdown.gkHandling  ?? null,
      overallGkKicking:   overallResult.breakdown.gkKicking   ?? null,
      overallGkReflex:    overallResult.breakdown.gkReflex    ?? null,
      overallGkPositioning: overallResult.breakdown.gkPositioning ?? null,
      overallCalculatedAt: new Date(),
    },
  });

  // 5. Persist full stats snapshot
  await prisma.playerStats.create({
    data: {
      playerId: dbPlayer.id,
      source: "sportmonks",
      goals:        normalized.goals        > 0 ? normalized.goals        : null,
      assists:      normalized.assists      > 0 ? normalized.assists      : null,
      shots:            normalized.shotsTotal   > 0 ? normalized.shotsTotal   : null,
      shotsOnTarget:    normalized.shotsOnTarget > 0 ? normalized.shotsOnTarget : null,
      xG:               normalized.xG           > 0 ? normalized.xG           : null,
      xA:               normalized.xA           > 0 ? normalized.xA           : null,
      xGChain:          normalized.xGChain      > 0 ? normalized.xGChain      : null,
      xGBuildup:        normalized.xGBuildup    > 0 ? normalized.xGBuildup    : null,
      passes:               normalized.passesTotal       > 0 ? normalized.passesTotal       : null,
      passAccuracy:         normalized.passAccuracyPct   > 0 ? normalized.passAccuracyPct   : null,
      keyPasses:            normalized.keyPasses         > 0 ? normalized.keyPasses         : null,
      progressivePasses:    normalized.progressivePasses > 0 ? normalized.progressivePasses : null,
      longPasses:           normalized.longPasses        > 0 ? normalized.longPasses        : null,
      longPassAccuracy:     normalized.longPassAccuracy  > 0 ? normalized.longPassAccuracy  : null,
      crosses:              normalized.crosses           > 0 ? normalized.crosses           : null,
      crossAccuracy:        normalized.crossAccuracy     > 0 ? normalized.crossAccuracy     : null,
      dribblesAttempted:    normalized.dribblesAttempted  > 0 ? normalized.dribblesAttempted  : null,
      dribblesSuccess:      normalized.dribblesSuccess    > 0 ? normalized.dribblesSuccess    : null,
      carries:              normalized.carries            > 0 ? normalized.carries            : null,
      progressiveCarries:   normalized.progressiveCarries > 0 ? normalized.progressiveCarries : null,
      tackles:          normalized.tackles          > 0 ? normalized.tackles          : null,
      tacklesWon:       normalized.tacklesWon       > 0 ? normalized.tacklesWon       : null,
      interceptions:    normalized.interceptions    > 0 ? normalized.interceptions    : null,
      clearances:       normalized.clearances       > 0 ? normalized.clearances       : null,
      blocks:           normalized.blocks           > 0 ? normalized.blocks           : null,
      pressures:        normalized.pressures        > 0 ? normalized.pressures        : null,
      pressuresSuccess: normalized.pressuresSuccess > 0 ? normalized.pressuresSuccess : null,
      recoveries:       normalized.recoveries       > 0 ? normalized.recoveries       : null,
      duelsTotal:       normalized.duelsTotal       > 0 ? normalized.duelsTotal       : null,
      duelsWon:         normalized.duelsWon         > 0 ? normalized.duelsWon         : null,
      aerialDuelsTotal: normalized.aerialDuelsTotal > 0 ? normalized.aerialDuelsTotal : null,
      aerialDuelsWon:   normalized.aerialDuelsWon   > 0 ? normalized.aerialDuelsWon   : null,
      groundDuelsWon:   normalized.groundDuelsWon   > 0 ? normalized.groundDuelsWon   : null,
      yellowCards:    normalized.yellowCards    > 0 ? normalized.yellowCards    : null,
      redCards:       normalized.redCards       > 0 ? normalized.redCards       : null,
      foulsCommitted: normalized.foulsCommitted > 0 ? normalized.foulsCommitted : null,
      foulsDrawn:     normalized.foulsDrawn     > 0 ? normalized.foulsDrawn     : null,
      distanceCovered: normalized.distanceCovered > 0 ? normalized.distanceCovered : null,
      sprints:         normalized.sprints         > 0 ? normalized.sprints         : null,
      rating:          normalized.rating          > 0 ? normalized.rating          : null,
      minutes:         normalized.minutesPlayed   > 0 ? normalized.minutesPlayed   : null,
      appearances:     normalized.appearances     > 0 ? normalized.appearances     : null,
    },
  });

  // 6. Return fresh player with stats
  return prisma.player.findUniqueOrThrow({
    where: { id: dbPlayer.id },
    include: { statsSnapshots: true, dbTeam: true },
  });
}

// ---------------------------------------------------------------------------
// getOrIngestPlayer
//
// Cache-first: checks DB for existing player with stats.
// Falls back to Sportmonks API if not found.
// ---------------------------------------------------------------------------

export async function getOrIngestPlayer(sportmonksId: number): Promise<PlayerWithStats> {
  const existing = await prisma.player.findFirst({
    where: {
      source: "sportmonks",
      externalId: String(sportmonksId),
    },
    include: { statsSnapshots: true, dbTeam: true },
  });

  if (existing && existing.statsSnapshots.length > 0) {
    return existing;
  }

  return ingestPlayerFromSportmonks(sportmonksId);
}
