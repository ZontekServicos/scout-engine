/**
 * hierarchy.ingestion.service.ts
 *
 * Cascade ingestion: Country → League → Season → Team → Player
 *
 * All operations use upsert (incremental, idempotent).
 * Player stats are appended as new snapshots (not overwritten).
 */

import { prisma } from "../lib/prisma";
import {
  fetchLeagueById,
  fetchLeagues,
  fetchSeasonsByLeague,
  fetchSeasonById,
  fetchTeamsBySeason,
  fetchPlayersByTeam,
} from "../integrations/sportmonks/sportmonks.client";
import { normalizeStats } from "../integrations/sportmonks/pipeline/normalize-stats";

// ---------------------------------------------------------------------------
// Country
// ---------------------------------------------------------------------------

/**
 * Ingest country from hardcoded data — no API call needed.
 * /countries is not available on all Sportmonks plans.
 * @deprecated Use ingestCountryDirect() instead.
 */
export async function ingestCountry(sportmonksId: number) {
  // Fallback: persist with minimal data (name will be updated when a league includes country info)
  return prisma.country.upsert({
    where: { externalId: sportmonksId },
    update: {},
    create: { externalId: sportmonksId, name: `Country #${sportmonksId}` },
  });
}

/**
 * Upsert country directly from hardcoded data — no API call.
 * Use when /countries endpoint is unavailable (e.g. plan restrictions).
 */
export async function ingestCountryDirect(data: {
  externalId: number;
  name: string;
  iso2?: string;
}) {
  return prisma.country.upsert({
    where: { externalId: data.externalId },
    update: { name: data.name, iso2: data.iso2 ?? null },
    create: { externalId: data.externalId, name: data.name, iso2: data.iso2 ?? null },
  });
}

// ---------------------------------------------------------------------------
// League
// ---------------------------------------------------------------------------

export async function ingestLeague(sportmonksLeagueId: number) {
  const raw = await fetchLeagueById(sportmonksLeagueId);

  // Ensure country exists first (if available)
  let countryDbId: string | null = null;
  if (raw.country_id) {
    const country = await prisma.country.upsert({
      where: { externalId: raw.country_id },
      update: { name: raw.country?.name ?? "Unknown" },
      create: {
        externalId: raw.country_id,
        name: raw.country?.name ?? "Unknown",
        iso2: raw.country?.iso2 ?? null,
        flagPath: raw.country?.image_path ?? null,
      },
    });
    countryDbId = country.id;
  }

  return prisma.league.upsert({
    where: { externalId: raw.id },
    update: {
      name: raw.name,
      countryId: countryDbId,
      type: raw.type ?? null,
      logoPath: raw.logo_path ?? raw.image_path ?? null,
    },
    create: {
      externalId: raw.id,
      name: raw.name,
      countryId: countryDbId,
      type: raw.type ?? null,
      logoPath: raw.logo_path ?? raw.image_path ?? null,
    },
  });
}

/**
 * Ingest all leagues for a country (fetches full list filtered by countryId).
 */
export async function ingestLeaguesByCountry(sportmonksCountryId: number) {
  // Ensure country
  const country = await ingestCountry(sportmonksCountryId);

  const rawLeagues = (await fetchLeagues()).filter((l) => l.country_id === sportmonksCountryId || l.country?.id === sportmonksCountryId);
  const results = [];

  for (const raw of rawLeagues) {
    const league = await prisma.league.upsert({
      where: { externalId: raw.id },
      update: {
        name: raw.name,
        countryId: country.id,
        type: raw.type ?? null,
        logoPath: raw.logo_path ?? raw.image_path ?? null,
      },
      create: {
        externalId: raw.id,
        name: raw.name,
        countryId: country.id,
        type: raw.type ?? null,
        logoPath: raw.logo_path ?? raw.image_path ?? null,
      },
    });
    results.push(league);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Season
// ---------------------------------------------------------------------------

export async function ingestSeason(sportmonksSeasonId: number) {
  const raw = await fetchSeasonById(sportmonksSeasonId);

  return prisma.season.upsert({
    where: { externalId: raw.id },
    update: {
      name: raw.name,
      year: raw.year ?? null,
      isCurrent: raw.is_current_season ?? false,
    },
    create: {
      externalId: raw.id,
      name: raw.name,
      year: raw.year ?? null,
      isCurrent: raw.is_current_season ?? false,
    },
  });
}

/**
 * Ingest all seasons for a league and link them.
 */
export async function ingestSeasonsByLeague(sportmonksLeagueId: number) {
  const league = await ingestLeague(sportmonksLeagueId);
  const rawSeasons = await fetchSeasonsByLeague(sportmonksLeagueId);
  const results = [];

  for (const raw of rawSeasons) {
    const season = await prisma.season.upsert({
      where: { externalId: raw.id },
      update: {
        name: raw.name,
        leagueId: league.id,
        year: raw.year ?? null,
        isCurrent: raw.is_current_season ?? false,
      },
      create: {
        externalId: raw.id,
        name: raw.name,
        leagueId: league.id,
        year: raw.year ?? null,
        isCurrent: raw.is_current_season ?? false,
      },
    });
    results.push(season);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Teams by Season
// ---------------------------------------------------------------------------

export async function ingestTeamsBySeason(sportmonksSeasonId: number) {
  // Ensure season exists
  const season = await ingestSeason(sportmonksSeasonId);

  const rawTeams = await fetchTeamsBySeason(sportmonksSeasonId);
  const results = [];

  for (const raw of rawTeams) {
    const team = await prisma.team.upsert({
      where: { externalId: raw.id },
      update: { name: raw.name },
      create: { externalId: raw.id, name: raw.name },
    });

    // Link team ↔ season (implicit M2M — idempotent via connect)
    await prisma.season.update({
      where: { id: season.id },
      data: {
        teams: {
          connect: { id: team.id },
        },
      },
    });

    results.push(team);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Players by Team
// ---------------------------------------------------------------------------

export async function ingestPlayersByTeam(
  sportmonksTeamId: number,
  sportmonksSeasonId: number,
) {
  // Ensure team and season exist
  const [team, season] = await Promise.all([
    prisma.team.findUnique({ where: { externalId: sportmonksTeamId } }),
    prisma.season.findUnique({ where: { externalId: sportmonksSeasonId } }),
  ]);

  if (!team) {
    throw new Error(`Team ${sportmonksTeamId} not found in DB. Ingest teams first.`);
  }

  const rawPlayers = await fetchPlayersByTeam(sportmonksTeamId, sportmonksSeasonId);
  const results = [];

  for (const raw of rawPlayers) {
    const { player, stats } = raw;

    // Derive age
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

    const slug = `sportmonks-${player.id}`;
    const name = player.display_name;
    const nameNormalized = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const position = player.position?.name ?? player.detailedPosition?.name ?? null;

    const dbPlayer = await prisma.player.upsert({
      where: { slug },
      update: {
        name,
        nameNormalized,
        team: team.name,
        age,
        teamDbId: team.id,
      },
      create: {
        slug,
        name,
        nameNormalized,
        source: "sportmonks",
        externalId: String(player.id),
        positions: position ? [position] : [],
        age,
        nationality: player.nationality?.name ?? "Unknown",
        team: team.name,
        league: null,
        attributes: {},
        archetype: {},
        teamDbId: team.id,
      },
    });

    // Stats snapshot
    const normalized = normalizeStats(stats);

    await prisma.playerStats.create({
      data: {
        playerId: dbPlayer.id,
        seasonId: season?.id ?? null,
        season: season?.name ?? null,
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
        pressures: null,
        rating: normalized.rating > 0 ? normalized.rating : null,
        minutes: normalized.minutesPlayed ?? 0,
        appearances: normalized.appearances ?? 0,
      },
    });

    results.push(dbPlayer);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Full cascade: League → Seasons → Teams → Players
// ---------------------------------------------------------------------------

export async function ingestLeagueFull(sportmonksLeagueId: number, onlyCurrentSeason = true) {
  const league = await ingestLeague(sportmonksLeagueId);
  const seasons = await ingestSeasonsByLeague(sportmonksLeagueId);

  const targetSeasons = onlyCurrentSeason ? seasons.filter((s) => s.isCurrent) : seasons;

  const summary = {
    league: league.name,
    seasons: [] as { season: string; teams: number; players: number }[],
  };

  for (const season of targetSeasons) {
    const rawSeason = await prisma.season.findUnique({
      where: { id: season.id },
      select: { externalId: true, name: true },
    });
    if (!rawSeason) continue;

    const teams = await ingestTeamsBySeason(rawSeason.externalId);
    let totalPlayers = 0;

    for (const team of teams) {
      const players = await ingestPlayersByTeam(team.externalId, rawSeason.externalId);
      totalPlayers += players.length;
    }

    summary.seasons.push({
      season: rawSeason.name,
      teams: teams.length,
      players: totalPlayers,
    });
  }

  return summary;
}
