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
  ingestLeaguesByCountry,
  ingestSeasonsByLeague,
  ingestTeamsBySeason,
  ingestPlayersByTeam,
} from "../src/ingestion/hierarchy.ingestion.service";
import {
  ingestMatchesBySeason,
  ingestMatchFull,
} from "../src/ingestion/match.ingestion.service";
import {
  fetchCountryByName,
  fetchLeagues,
} from "../src/integrations/sportmonks/sportmonks.client";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * Keywords to match against Sportmonks league names (case-insensitive).
 * The seed discovers IDs dynamically — no hardcoded values.
 */
const TARGET_LEAGUE_KEYWORDS = [
  "Série A",
  "Serie A",
  "Brasileirao Serie A",
  "Brasileirão Série A",
];

const OPTIONAL_LEAGUE_KEYWORDS = [
  "Série B",
  "Serie B",
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

function matchesKeywords(name: string, keywords: string[]): boolean {
  const lower = name.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

async function seedBrazilData() {
  // ---- Discover Brazil country ID ----
  log("Discovering Brazil country ID from Sportmonks…");
  const brazilRaw = await fetchCountryByName("Brazil");
  if (!brazilRaw) {
    throw new Error("Could not find Brazil in Sportmonks /countries — check your API subscription.");
  }
  log(`  ✓ Found: "${brazilRaw.name}" (id=${brazilRaw.id})`);
  const country = await ingestCountry(brazilRaw.id);
  log(`  ✓ Country persisted: ${country.name}`);

  // ---- Discover Brazilian leagues ----
  log("Discovering Brazilian leagues…");
  const allLeagues = await fetchLeagues({ countryId: brazilRaw.id });
  log(`  Found ${allLeagues.length} league(s) for Brazil in Sportmonks`);
  allLeagues.forEach((l) => log(`    id=${l.id}  name="${l.name}"`));

  const targetLeagues = allLeagues.filter((l) =>
    matchesKeywords(l.name, TARGET_LEAGUE_KEYWORDS),
  );
  const optionalLeagues = allLeagues.filter((l) =>
    matchesKeywords(l.name, OPTIONAL_LEAGUE_KEYWORDS),
  );

  const leaguesToIngest = [...targetLeagues, ...optionalLeagues];

  if (leaguesToIngest.length === 0) {
    log("⚠  No target leagues found. Printing all available league names above — update TARGET_LEAGUE_KEYWORDS to match.");
    return;
  }

  log(`  Will ingest: ${leaguesToIngest.map((l) => l.name).join(", ")}`);

  for (const leagueRaw of leaguesToIngest) {
    log(`\n── League: ${leagueRaw.name} (id=${leagueRaw.id}) ──`);

    // ---- League ----
    const league = await ingestLeague(leagueRaw.id);
    log(`  ✓ League persisted: ${league.name}`);

    // ---- Seasons ----
    log(`  Fetching seasons…`);
    const seasons = await ingestSeasonsByLeague(leagueRaw.id);
    log(`  ✓ ${seasons.length} season(s) persisted`);

    // Pick current season; fall back to most recent
    const currentSeason =
      seasons.find((s) => s.isCurrent) ??
      seasons.sort((a, b) => (b.year ?? 0) - (a.year ?? 0))[0];

    if (!currentSeason) {
      log(`  ⚠ No season found for ${leagueRaw.name} — skipping`);
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
    log(`  ✓ ${totalEvents} total event(s) ingested for "${leagueRaw.name}"`);
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
