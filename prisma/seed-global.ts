/**
 * seed-global.ts
 *
 * Fixture-first global seed — populates the DB from all leagues available
 * in the Sportmonks plan without depending on /seasons, /teams, or /players filters.
 *
 * Flow:
 *   fetchLeagues()                    — all leagues in the plan
 *   slice(0, MAX_LEAGUES)             — volume cap
 *   per league:
 *     ingestLeagueViaFixtures()
 *       → fetchFixturesByLeague()     — filter=league_id (confirmed working)
 *       → upsert League, Season, Teams, Matches from fixture data
 *       → fetchMatchEvents()          — filter=fixture_id (confirmed working)
 *       → upsert MatchEvent with x/y coordinates
 *
 * Run:
 *   npm run seed:global
 *   npx cross-env NODE_ENV=development ts-node prisma/seed-global.ts
 *
 * ⚠️  Only runs when NODE_ENV=development.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { fetchLeagues } from "../src/integrations/sportmonks/sportmonks.client";
import { ingestLeagueViaFixtures } from "../src/ingestion/fixture-first.ingestion.service";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** How many leagues to process. Raise after confirming the pipeline works. */
const MAX_LEAGUES = 5;

/**
 * Max finished fixtures to ingest events for, per league.
 * Each fixture = 1 API call to /events — keep low initially.
 */
const MAX_FINISHED_FIXTURES = 5;

/**
 * Pagination cap for /fixtures per league (4 pages × 25 = ~100 fixtures).
 * Raise only if you need full season coverage.
 */
const FIXTURE_PAGES = 4;

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

function log(msg: string) {
  console.log(`[seed-global] ${new Date().toISOString().slice(11, 19)}  ${msg}`);
}

// ---------------------------------------------------------------------------
// Clear database
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
// Summary
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
    log("⚠  Zero events have coordinates.");
    log("   Sportmonks only includes x/y on Enterprise/advanced plans.");
    log("   Heatmaps will be empty until coordinates are available.");
  }
  if (events === 0) {
    log("⚠  No events ingested. Check if finished fixtures exist in the current season.");
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (process.env.NODE_ENV !== "development") {
    console.error("[seed-global] ❌  Aborted: NODE_ENV must be 'development'.");
    process.exit(1);
  }

  log(`Config: MAX_LEAGUES=${MAX_LEAGUES}  MAX_FINISHED_FIXTURES=${MAX_FINISHED_FIXTURES}  FIXTURE_PAGES=${FIXTURE_PAGES}`);

  await clearDatabase();

  // Fetch all available leagues
  log("Fetching leagues…");
  const allLeagues = await fetchLeagues();
  log(`${allLeagues.length} league(s) available in this plan:`);
  allLeagues.forEach((l) =>
    log(`  id=${l.id}  country="${l.country?.name ?? "?"}"  "${l.name}"`),
  );

  const toProcess = allLeagues.slice(0, MAX_LEAGUES);
  log(`\nProcessing ${toProcess.length} league(s)…`);

  let totalEvents = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const league = toProcess[i];
    log(`\n── [${i + 1}/${toProcess.length}] "${league.name}" (id=${league.id}) ──`);

    try {
      const result = await ingestLeagueViaFixtures(league.id, {
        maxFinishedFixtures: MAX_FINISHED_FIXTURES,
        maxPages: FIXTURE_PAGES,
      });

      totalEvents += result.eventsTotal;
      log(`  League    : ${result.leagueName}`);
      log(`  Fixtures  : ${result.fixturesTotal} total | ${result.fixturesFinished} finished | ${result.fixturesIngested} ingested`);
      log(`  Events    : ${result.eventsTotal}`);
    } catch (err) {
      log(`  ✗ Failed: ${(err as Error).message}`);
      log("  Continuing with next league…");
    }
  }

  log(`\nTotal events ingested: ${totalEvents}`);
  await printSummary();
  log("Done.");
}

main()
  .catch((err) => {
    console.error("[seed-global] Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
