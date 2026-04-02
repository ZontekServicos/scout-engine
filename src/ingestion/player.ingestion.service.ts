import { prisma } from "../lib/prisma";
import { fetchPlayerWithStats } from "../integrations/sportmonks/sportmonks.client";
import { normalizeStats } from "../integrations/sportmonks/pipeline/normalize-stats";
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

  // 3. Upsert player
  const slug = `sportmonks-${sportmonksId}`;
  const name = player.display_name;
  const nameNormalized = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const position = player.position?.name ?? player.detailedPosition?.name ?? null;

  const dbPlayer = await prisma.player.upsert({
    where: { slug },
    update: {
      name,
      nameNormalized,
      team: player.team?.name ?? null,
      league: player.league?.name ?? null,
      imagePath: player.image_path ?? null,
      age,
      teamDbId,
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
      attributes: {},
      archetype: {},
      teamDbId,
    },
  });

  // 4. Normalize stats from Sportmonks
  const normalized = normalizeStats(stats);

  // 5. Persist stats snapshot
  await prisma.playerStats.create({
    data: {
      playerId: dbPlayer.id,
      source: "sportmonks",
      goals: normalized.goals ?? 0,
      assists: normalized.assists ?? 0,
      shots: normalized.shotsTotal ?? 0,
      shotsOnTarget: normalized.shotsOnTarget ?? 0,
      keyPasses: normalized.keyPasses ?? 0,
      passes: normalized.passesTotal ?? 0,
      passAccuracy: normalized.passAccuracyPct ?? null,
      xG: normalized.xG ?? null,
      xA: normalized.xA ?? null,
      tackles: normalized.tackles ?? 0,
      interceptions: normalized.interceptions ?? 0,
      pressures: null, // not always available from Sportmonks
      rating: normalized.rating > 0 ? normalized.rating : null,
      minutes: normalized.minutesPlayed ?? 0,
      appearances: normalized.appearances ?? 0,
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
