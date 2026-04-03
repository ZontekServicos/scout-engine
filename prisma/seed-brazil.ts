/**
 * seed-brazil.ts
 *
 * Populates the database with real Brazilian football data from Sportmonks.
 *
 * Flow:
 *   clearDatabase()         — truncates all ingestion tables in FK-safe order
 *   ingestCountry(Brazil)   — persists country
 *   per target league:
 *     ingestLeague()
 *     ingestSeasonsByLeague() → pick current season
 *     ingestTeamsBySeason()
 *     per team: ingestPlayersByTeam()
 *     ingestMatchesBySeason() → pick N most recent finished matches
 *     per match: ingestMatchFull() (match + events with coordinates)
 *
 * Run:
 *   npx ts-node prisma/seed-brazil.ts
 *   or: npm run seed:brazil
 *
 * ⚠️  Only runs in NODE_ENV=development (guard at the bottom).
 *
 * ---------------------------------------------------------------------------
 * Sportmonks v3 IDs — verify at https://docs.sportmonks.com/football/
 * ---------------------------------------------------------------------------
 * Brazil country_id : 32
 * Brasileirão Série A (league) : 325
 * Brasileirão Série B (league) : 375
 * Copa do Brasil (league)      : 326
 *
 * If any ID returns 404, use GET /api/ingest/country/32/leagues to discover
 * the correct IDs for your API subscription tier.
 * ---------------------------------------------------------------------------
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  ingestCountry,
  ingestLeague,
  ingestSeasonsByLeague,
  ingestTeamsBySeason,
  ingestPlayersByTeam,
} from "../src/ingestion/hierarchy.ingestion.service";
import {
  ingestMatchesBySeason,
  ingestMatchFull,
} from "../src/ingestion/match.ingestion.service";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BRAZIL_COUNTRY_ID = 32;

/**
 * Target leagues — add or remove as needed.
 * Set `enabled: false` to skip a league without deleting the entry.
 */
const TARGET_LEAGUES: { id: number; name: string; enabled: boolean }[] = [
  { id: 325, name: "Brasileirão Série A", enabled: true },
  { id: 375, name: "Brasileirão Série B", enabled: true },
  { id: 326, name: "Copa do Brasil",      enabled: false }, // optional
];

/**
 * Max number of FINISHED matches to ingest per league season.
 * Each match triggers one extra API call for events — keep this conservative.
 */
const MAX_MATCHES_PER_LEAGUE = 8;

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

function log(msg: string) {
  console.log(`[seed-brazil] ${new Date().toISOString().slice(11, 19)}  ${msg}`);
}

// ---------------------------------------------------------------------------
// Step 1 — Clear database (dev only, FK-safe order)
// ---------------------------------------------------------------------------

async function clearDatabase() {
  log("Clearing database (ingestion tables only)…");

  // Order matters — children before parents
  await prisma.$transaction([
    prisma.matchEvent.deleteMany(),
    prisma.match.deleteMany(),
    prisma.playerStats.deleteMany(),
    prisma.playerMetrics.deleteMany(),
    prisma.playerFinancials.deleteMany(),
    prisma.playerRiskSnapshot.deleteMany(),
    prisma.analysisComparison.deleteMany(),
    // Players reference Teams (teamDbId) — delete players first
    prisma.player.deleteMany({ where: { source: "sportmonks" } }),
    prisma.team.deleteMany(),
    prisma.season.deleteMany(),
    prisma.league.deleteMany(),
    prisma.country.deleteMany(),
  ]);

  log("Database cleared (manual/seed players kept).");
}

// ---------------------------------------------------------------------------
// Step 2 — Ingest Brazil
// ---------------------------------------------------------------------------

async function seedBrazilData() {
  // ---- Country ----
  log(`Ingesting country: Brazil (id=${BRAZIL_COUNTRY_ID})`);
  const country = await ingestCountry(BRAZIL_COUNTRY_ID);
  log(`  ✓ Country: ${country.name}`);

  for (const leagueCfg of TARGET_LEAGUES) {
    if (!leagueCfg.enabled) {
      log(`Skipping league "${leagueCfg.name}" (disabled)`);
      continue;
    }

    log(`\n── League: ${leagueCfg.name} (id=${leagueCfg.id}) ──`);

    // ---- League ----
    const league = await ingestLeague(leagueCfg.id);
    log(`  ✓ League persisted: ${league.name}`);

    // ---- Seasons ----
    log(`  Fetching seasons…`);
    const seasons = await ingestSeasonsByLeague(leagueCfg.id);
    log(`  ✓ ${seasons.length} season(s) persisted`);

    // Pick current season; fall back to most recent
    const currentSeason =
      seasons.find((s) => s.isCurrent) ??
      seasons.sort((a, b) => (b.year ?? 0) - (a.year ?? 0))[0];

    if (!currentSeason) {
      log(`  ⚠ No season found for ${leagueCfg.name} — skipping`);
      continue;
    }

    log(`  Target season: "${currentSeason.name}" (externalId=${currentSeason.externalId})`);

    // ---- Teams ----
    log(`  Fetching teams…`);
    const teams = await ingestTeamsBySeason(currentSeason.externalId);
    log(`  ✓ ${teams.length} team(s) persisted`);

    // ---- Players (per team) ----
    let totalPlayers = 0;
    for (const team of teams) {
      try {
        const players = await ingestPlayersByTeam(team.externalId, currentSeason.externalId);
        totalPlayers += players.length;
        log(`    Team "${team.name}": ${players.length} player(s)`);
      } catch (err) {
        log(`    ⚠ Skipping players for "${team.name}": ${(err as Error).message}`);
      }
    }
    log(`  ✓ ${totalPlayers} total player(s) for season "${currentSeason.name}"`);

    // ---- Matches ----
    log(`  Fetching matches for season ${currentSeason.externalId}…`);
    const allMatches = await ingestMatchesBySeason(currentSeason.externalId);
    log(`  ✓ ${allMatches.length} match(es) persisted`);

    // Select only finished matches, most recent first, capped at MAX_MATCHES_PER_LEAGUE
    const finishedMatches = allMatches
      .filter((m) => m.status === "FT" || m.status === "AET" || m.status === "PEN")
      .sort((a, b) => {
        const aTime = a.startingAt?.getTime() ?? 0;
        const bTime = b.startingAt?.getTime() ?? 0;
        return bTime - aTime; // most recent first
      })
      .slice(0, MAX_MATCHES_PER_LEAGUE);

    log(`  Ingesting events for ${finishedMatches.length} finished match(es)…`);

    let totalEvents = 0;
    for (const match of finishedMatches) {
      try {
        const result = await ingestMatchFull(match.externalId);
        totalEvents += result.eventsIngested;
        log(`    Match ${match.externalId}: ${result.eventsIngested} event(s)`);
      } catch (err) {
        log(`    ⚠ Failed events for match ${match.externalId}: ${(err as Error).message}`);
      }
    }
    log(`  ✓ ${totalEvents} total event(s) ingested for "${leagueCfg.name}"`);
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

async function printSummary() {
  const [countries, leagues, seasons, teams, players, matches, events] =
    await Promise.all([
      prisma.country.count(),
      prisma.league.count(),
      prisma.season.count(),
      prisma.team.count(),
      prisma.player.count({ where: { source: "sportmonks" } }),
      prisma.match.count(),
      prisma.matchEvent.count(),
    ]);

  log("\n── Summary ──────────────────────────────");
  log(`  Countries : ${countries}`);
  log(`  Leagues   : ${leagues}`);
  log(`  Seasons   : ${seasons}`);
  log(`  Teams     : ${teams}`);
  log(`  Players   : ${players}`);
  log(`  Matches   : ${matches}`);
  log(`  Events    : ${events}`);

  const withCoords = await prisma.matchEvent.count({
    where: { x: { not: null }, y: { not: null } },
  });
  log(`  Events w/ coordinates: ${withCoords} (${events > 0 ? Math.round((withCoords / events) * 100) : 0}%)`);
  log("─────────────────────────────────────────\n");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  if (process.env.NODE_ENV !== "development") {
    console.error(
      "[seed-brazil] ❌  Aborted: NODE_ENV is not 'development'.\n" +
      "                  Set NODE_ENV=development to run this script.",
    );
    process.exit(1);
  }

  log("Starting Brazil seed…");
  log(`MAX_MATCHES_PER_LEAGUE = ${MAX_MATCHES_PER_LEAGUE}`);

  await clearDatabase();
  await seedBrazilData();
  await printSummary();

  log("Done.");
}

main()
  .catch((err) => {
    console.error("[seed-brazil] Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
