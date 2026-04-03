/**
 * seed-global.ts
 *
 * Populates the database with real data from all leagues available in the
 * Sportmonks plan. Volume is controlled by MAX_LEAGUES and MAX_MATCHES_PER_LEAGUE.
 *
 * Flow:
 *   clearDatabase()
 *   fetchLeagues()               — all leagues the plan exposes
 *   slice(0, MAX_LEAGUES)        — cap to avoid massive ingestion
 *   per league:
 *     ingestLeague()
 *     ingestSeasonsByLeague()    → picks current season (falls back to most recent)
 *     ingestTeamsBySeason()
 *     per team: ingestPlayersByTeam()
 *     ingestMatchesBySeason()    → picks N most recent FT/AET/PEN matches
 *     per match: ingestMatchFull() (match + events with coordinates)
 *
 * Run:
 *   npm run seed:global
 *   npx cross-env NODE_ENV=development ts-node prisma/seed-global.ts
 *
 * ⚠️  Only runs when NODE_ENV=development.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  ingestLeague,
  ingestSeasonsByLeague,
  ingestTeamsBySeason,
  ingestPlayersByTeam,
} from "../src/ingestion/hierarchy.ingestion.service";
import {
  ingestMatchesBySeason,
  ingestMatchFull,
} from "../src/ingestion/match.ingestion.service";
import { fetchLeagues } from "../src/integrations/sportmonks/sportmonks.client";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Config — tune these to control ingestion volume
// ---------------------------------------------------------------------------

/** How many leagues to process. Set to Infinity to process all. */
const MAX_LEAGUES = 5;

/** Max finished matches to ingest per league. Each match = 1 extra API call for events. */
const MAX_MATCHES_PER_LEAGUE = 5;

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

function log(msg: string) {
  console.log(`[seed-global] ${new Date().toISOString().slice(11, 19)}  ${msg}`);
}

// ---------------------------------------------------------------------------
// Step 1 — Clear database (ingestion tables only, FK-safe order)
// ---------------------------------------------------------------------------

async function clearDatabase() {
  log("Clearing ingestion tables…");
  await prisma.$transaction([
    prisma.matchEvent.deleteMany(),
    prisma.match.deleteMany(),
    prisma.playerStats.deleteMany(),
    prisma.playerMetrics.deleteMany(),
    prisma.playerFinancials.deleteMany(),
    prisma.playerRiskSnapshot.deleteMany(),
    prisma.analysisComparison.deleteMany(),
    prisma.player.deleteMany({ where: { source: "sportmonks" } }),
    prisma.team.deleteMany(),
    prisma.season.deleteMany(),
    prisma.league.deleteMany(),
    prisma.country.deleteMany(),
  ]);
  log("Done. Manual/seed players kept.");
}

// ---------------------------------------------------------------------------
// Step 2 — Per-league ingestion
// ---------------------------------------------------------------------------

async function ingestLeagueData(leagueExternalId: number, leagueName: string): Promise<{
  teams: number;
  players: number;
  matches: number;
  events: number;
}> {
  const stats = { teams: 0, players: 0, matches: 0, events: 0 };

  // League
  await ingestLeague(leagueExternalId);

  // Seasons → pick current, fall back to most recent
  const seasons = await ingestSeasonsByLeague(leagueExternalId);
  if (seasons.length === 0) {
    log(`  ⚠  No seasons found`);
    return stats;
  }

  const season =
    seasons.find((s) => s.isCurrent) ??
    [...seasons].sort((a, b) => (b.year ?? 0) - (a.year ?? 0))[0];

  log(`  Season: "${season.name}" (isCurrent=${season.isCurrent})`);

  // Teams
  let teams;
  try {
    teams = await ingestTeamsBySeason(season.externalId);
    stats.teams = teams.length;
    log(`  Teams: ${stats.teams}`);
  } catch (err) {
    log(`  ⚠  Teams failed: ${(err as Error).message}`);
    return stats;
  }

  // Players (per team — each failure isolated)
  for (const team of teams) {
    try {
      const players = await ingestPlayersByTeam(team.externalId, season.externalId);
      stats.players += players.length;
    } catch (err) {
      log(`  ⚠  Players "${team.name}": ${(err as Error).message}`);
    }
  }
  log(`  Players: ${stats.players}`);

  // Matches
  let allMatches;
  try {
    allMatches = await ingestMatchesBySeason(season.externalId);
    log(`  Total matches in season: ${allMatches.length}`);
  } catch (err) {
    log(`  ⚠  Matches failed: ${(err as Error).message}`);
    return stats;
  }

  // Finished matches — most recent first — capped
  const finished = allMatches
    .filter((m) => ["FT", "AET", "PEN", "FT_PEN"].includes(m.status ?? ""))
    .sort((a, b) => (b.startingAt?.getTime() ?? 0) - (a.startingAt?.getTime() ?? 0))
    .slice(0, MAX_MATCHES_PER_LEAGUE);

  stats.matches = finished.length;
  log(`  Ingesting events for ${stats.matches} finished match(es) (cap=${MAX_MATCHES_PER_LEAGUE})…`);

  // Events
  for (const match of finished) {
    try {
      const result = await ingestMatchFull(match.externalId);
      stats.events += result.eventsIngested;
      log(`    Match ${match.externalId}: ${result.eventsIngested} event(s)`);
    } catch (err) {
      log(`    ⚠  Match ${match.externalId}: ${(err as Error).message}`);
    }
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Step 3 — Summary
// ---------------------------------------------------------------------------

async function printSummary() {
  const [leagues, seasons, teams, players, matches, events] = await Promise.all([
    prisma.league.count(),
    prisma.season.count(),
    prisma.team.count(),
    prisma.player.count({ where: { source: "sportmonks" } }),
    prisma.match.count(),
    prisma.matchEvent.count(),
  ]);

  const withCoords = await prisma.matchEvent.count({
    where: { x: { not: null }, y: { not: null } },
  });

  log("");
  log("── Summary ──────────────────────────────────────────────");
  log(`  Leagues    : ${leagues}`);
  log(`  Seasons    : ${seasons}`);
  log(`  Teams      : ${teams}`);
  log(`  Players    : ${players}`);
  log(`  Matches    : ${matches}`);
  log(`  Events     : ${events}`);
  log(`  w/ coords  : ${withCoords} (${events > 0 ? Math.round((withCoords / events) * 100) : 0}%)`);
  log("─────────────────────────────────────────────────────────");

  if (events > 0 && withCoords === 0) {
    log("⚠  Events have no coordinates — verify your Sportmonks plan includes spatial data.");
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (process.env.NODE_ENV !== "development") {
    console.error(
      "[seed-global] ❌  Aborted: NODE_ENV is not 'development'.",
    );
    process.exit(1);
  }

  log(`Starting global seed  (MAX_LEAGUES=${MAX_LEAGUES}  MAX_MATCHES=${MAX_MATCHES_PER_LEAGUE})`);

  await clearDatabase();

  // Fetch all available leagues
  log("Fetching leagues from Sportmonks…");
  const allLeagues = await fetchLeagues();
  log(`Found ${allLeagues.length} league(s) available in this plan:`);
  allLeagues.forEach((l) =>
    log(`  id=${l.id}  country_id=${l.country_id}  country="${l.country?.name ?? "?"}"  "${l.name}"`),
  );

  const leaguesToProcess = allLeagues.slice(0, MAX_LEAGUES);
  log(`\nWill process ${leaguesToProcess.length} league(s) (capped at MAX_LEAGUES=${MAX_LEAGUES})`);

  // Per-league ingestion totals
  let totalTeams = 0, totalPlayers = 0, totalMatches = 0, totalEvents = 0;

  for (let i = 0; i < leaguesToProcess.length; i++) {
    const l = leaguesToProcess[i];
    log(`\n── [${i + 1}/${leaguesToProcess.length}] "${l.name}" (id=${l.id}) ──`);

    try {
      const stats = await ingestLeagueData(l.id, l.name);
      totalTeams   += stats.teams;
      totalPlayers += stats.players;
      totalMatches += stats.matches;
      totalEvents  += stats.events;
      log(`  ✓ Done: ${stats.teams} teams | ${stats.players} players | ${stats.matches} matches | ${stats.events} events`);
    } catch (err) {
      log(`  ✗ League "${l.name}" failed: ${(err as Error).message}`);
      log("  Continuing with next league…");
    }
  }

  log(`\nIngestion complete: ${totalTeams} teams | ${totalPlayers} players | ${totalMatches} matches | ${totalEvents} events`);

  await printSummary();
  log("Done.");
}

main()
  .catch((err) => {
    console.error("[seed-global] Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
