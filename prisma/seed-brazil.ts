/**
 * seed-brazil.ts
 *
 * Populates the database with real Brazilian football data from Sportmonks v3.
 *
 * Flow:
 *   clearDatabase()           — deletes ingestion data in FK-safe order
 *   ingestCountryDirect()     — upserts Brazil without calling /countries (unavailable on some plans)
 *   fetchLeagues(countryId)   — discovers Brazilian leagues directly from /leagues
 *   per league:
 *     ingestLeague()
 *     ingestSeasonsByLeague() → picks current season
 *     ingestTeamsBySeason()
 *     per team: ingestPlayersByTeam()
 *     ingestMatchesBySeason() → picks N most recent FT matches
 *     per match: ingestMatchFull() (match + events with coordinates)
 *
 * Run:
 *   npm run seed:brazil
 *   npx cross-env NODE_ENV=development ts-node prisma/seed-brazil.ts
 *
 * ⚠️  Only runs when NODE_ENV=development.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  ingestCountryDirect,
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
import type { SportmonksLeague } from "../src/integrations/sportmonks/sportmonks.types";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * Brazil — hardcoded to avoid dependency on /countries endpoint.
 * Sportmonks v3 country_id for Brazil = 32.
 */
const BRAZIL = { externalId: 32, name: "Brazil", iso2: "BR" };

/**
 * Keywords matched against Sportmonks league names (case-insensitive, partial).
 * Run once to print all available leagues, then tune these if needed.
 */
const TARGET_LEAGUE_KEYWORDS = [
  "serie a",
  "série a",
  "brasileirao",
  "brasileirão",
];

const OPTIONAL_LEAGUE_KEYWORDS = [
  "serie b",
  "série b",
];

/** Max finished matches to ingest per league — controls volume and API calls. */
const MAX_MATCHES_PER_LEAGUE = 5;

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

function log(msg: string) {
  console.log(`[seed-brazil] ${new Date().toISOString().slice(11, 19)}  ${msg}`);
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
// Step 2 — Seed Brazil
// ---------------------------------------------------------------------------

function matchesAny(name: string, keywords: string[]): boolean {
  const lower = name.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

async function seedBrazilData() {
  // ---- Country (no API call — hardcoded) ----
  const country = await ingestCountryDirect(BRAZIL);
  log(`Country: "${country.name}" (id=${country.id})`);

  // ---- Fetch ALL leagues then filter by country client-side ----
  // /leagues does not support country_id filter — must filter locally.
  log("Fetching all leagues from Sportmonks (will filter by country locally)…");
  const allLeagues = await fetchLeagues();
  log(`  Total leagues in response: ${allLeagues.length}`);

  // Log ALL leagues so we can see exactly what the API returns
  log("  Full league list:");
  allLeagues.forEach((l) =>
    log(`    id=${l.id}  country_id=${l.country_id}  country="${l.country?.name ?? "?"}"  name="${l.name}"`),
  );

  // Strategy 1: filter by country_id
  const byCountryId = allLeagues.filter(
    (l) => l.country_id === BRAZIL.externalId || l.country?.id === BRAZIL.externalId,
  );

  // Strategy 2: filter by name (fallback when country_id is missing/wrong)
  const byName = allLeagues.filter((l) => {
    const n = l.name.toLowerCase();
    const c = (l.country?.name ?? "").toLowerCase();
    return n.includes("brazil") || n.includes("brasil") ||
           c.includes("brazil") || c.includes("brasil");
  });

  // Merge both strategies (deduplicated)
  const brazilLeagues = [
    ...byCountryId,
    ...byName.filter((l) => !byCountryId.find((x) => x.id === l.id)),
  ];

  log(`  By country_id: ${byCountryId.length}  By name: ${byName.length}  Total unique: ${brazilLeagues.length}`);
  brazilLeagues.forEach((l) => log(`    id=${l.id}  "${l.name}"`));

  if (brazilLeagues.length === 0) {
    log("⚠  No Brazilian leagues found by country_id OR name.");
    log("   The 25 leagues above are all your plan returns from /leagues.");
    log("   OPTIONS:");
    log("   1. Hardcode league IDs: add them to HARDCODED_LEAGUE_IDS below and re-run.");
    log("   2. Check if your Sportmonks plan includes South American leagues.");
    log(`   3. Try fetching a known league ID directly: POST /api/ingest/league/<id>`);
    return;
  }

  // ---- Filter target leagues ----
  const primary = brazilLeagues.filter((l) => matchesAny(l.name, TARGET_LEAGUE_KEYWORDS));
  const secondary = brazilLeagues.filter((l) => matchesAny(l.name, OPTIONAL_LEAGUE_KEYWORDS));
  const toIngest = [...primary, ...secondary];

  if (toIngest.length === 0) {
    log("⚠  No leagues matched TARGET_LEAGUE_KEYWORDS.");
    log("   Update the keywords above to match the league names printed.");
    return;
  }

  log(`Will ingest: ${toIngest.map((l) => l.name).join(" | ")}`);

  // ---- Per-league ingestion ----
  for (const leagueRaw of toIngest) {
    log(`\n${"─".repeat(60)}`);
    log(`League: "${leagueRaw.name}" (sportmonks id=${leagueRaw.id})`);

    try {
      await ingestLeagueData(leagueRaw.id, leagueRaw.name);
    } catch (err) {
      log(`⚠  League "${leagueRaw.name}" failed: ${(err as Error).message}`);
      log("   Continuing with next league…");
    }
  }
}

async function ingestLeagueData(leagueExternalId: number, leagueName: string) {
  // League
  const league = await ingestLeague(leagueExternalId);
  log(`  League persisted: "${league.name}" (db id=${league.id})`);

  // Seasons
  const seasons = await ingestSeasonsByLeague(leagueExternalId);
  log(`  ${seasons.length} season(s) persisted`);

  // Pick current season; fall back to most recent by year
  const currentSeason =
    seasons.find((s) => s.isCurrent) ??
    [...seasons].sort((a, b) => (b.year ?? 0) - (a.year ?? 0))[0];

  if (!currentSeason) {
    log(`  ⚠  No season found — skipping`);
    return;
  }

  log(`  Season: "${currentSeason.name}" (externalId=${currentSeason.externalId}, isCurrent=${currentSeason.isCurrent})`);

  // Teams
  let teams;
  try {
    teams = await ingestTeamsBySeason(currentSeason.externalId);
    log(`  ${teams.length} team(s) persisted`);
  } catch (err) {
    log(`  ⚠  Teams failed: ${(err as Error).message}`);
    return;
  }

  // Players (per team — each failure is isolated)
  let totalPlayers = 0;
  for (const team of teams) {
    try {
      const players = await ingestPlayersByTeam(team.externalId, currentSeason.externalId);
      totalPlayers += players.length;
      log(`    ${team.name}: ${players.length} player(s)`);
    } catch (err) {
      log(`    ⚠  Players for "${team.name}": ${(err as Error).message}`);
    }
  }
  log(`  ${totalPlayers} total player(s)`);

  // Matches
  let allMatches;
  try {
    allMatches = await ingestMatchesBySeason(currentSeason.externalId);
    log(`  ${allMatches.length} match(es) persisted`);
  } catch (err) {
    log(`  ⚠  Matches failed: ${(err as Error).message}`);
    return;
  }

  // Pick finished matches — most recent first — capped
  const finished = allMatches
    .filter((m) => ["FT", "AET", "PEN", "FT_PEN"].includes(m.status ?? ""))
    .sort((a, b) => (b.startingAt?.getTime() ?? 0) - (a.startingAt?.getTime() ?? 0))
    .slice(0, MAX_MATCHES_PER_LEAGUE);

  log(`  Ingesting events for ${finished.length} finished match(es) (cap=${MAX_MATCHES_PER_LEAGUE})…`);

  let totalEvents = 0;
  for (const match of finished) {
    try {
      const result = await ingestMatchFull(match.externalId);
      totalEvents += result.eventsIngested;
      log(`    Match ${match.externalId}: ${result.eventsIngested} event(s)`);
    } catch (err) {
      log(`    ⚠  Match ${match.externalId}: ${(err as Error).message}`);
    }
  }

  log(`  Total events for "${leagueName}": ${totalEvents}`);
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

  const withCoords = await prisma.matchEvent.count({
    where: { x: { not: null }, y: { not: null } },
  });

  log("");
  log("── Summary ──────────────────────────────────────────────");
  log(`  Countries  : ${countries}`);
  log(`  Leagues    : ${leagues}`);
  log(`  Seasons    : ${seasons}`);
  log(`  Teams      : ${teams}`);
  log(`  Players    : ${players}`);
  log(`  Matches    : ${matches}`);
  log(`  Events     : ${events}`);
  log(`  w/ coords  : ${withCoords} (${events > 0 ? Math.round((withCoords / events) * 100) : 0}%)`);
  log("─────────────────────────────────────────────────────────");

  if (withCoords === 0 && events > 0) {
    log("⚠  No events have coordinates. Verify your Sportmonks plan includes spatial data.");
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  if (process.env.NODE_ENV !== "development") {
    console.error(
      "[seed-brazil] ❌  Aborted: NODE_ENV is not 'development'.\n" +
      "               Set NODE_ENV=development to run this script.",
    );
    process.exit(1);
  }

  log(`Starting Brazil seed  (MAX_MATCHES_PER_LEAGUE=${MAX_MATCHES_PER_LEAGUE})`);

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
