/**
 * seed-brazil-validated.ts
 *
 * Ingests only the Brazilian leagues that passed API validation
 * (brazil-leagues-full.json — has fixtures, events, and x/y coordinates).
 *
 * Falls back to brazil-leagues-partial.json when --include-partial flag is set.
 *
 * Run:
 *   npm run seed:brazil:validated
 *   npx cross-env NODE_ENV=development ts-node prisma/seed-brazil-validated.ts
 *
 *   # include PARTIAL leagues too:
 *   npx cross-env NODE_ENV=development ts-node prisma/seed-brazil-validated.ts --include-partial
 *
 * ⚠  Requires brazil-leagues-full.json — run validate-brazil-leagues.ts first.
 * ⚠  Only runs when NODE_ENV=development.
 */

import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import pLimit from "p-limit";
import { PrismaClient } from "@prisma/client";
import { ingestLeagueViaFixtures } from "../src/ingestion/fixture-first.ingestion.service";
import type { LeagueValidation } from "../src/scripts/validate-brazil-leagues";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MAX_FINISHED_FIXTURES  = 15;
const FIXTURE_PAGES          = 6;   // 6 × 25 = up to 150 fixtures per league
const CONCURRENCY            = 2;   // Brazilian leagues have more depth — keep conservative

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const DATA_DIR      = path.resolve(__dirname, "../src/data");
const FULL_PATH     = path.join(DATA_DIR, "brazil-leagues-full.json");
const PARTIAL_PATH  = path.join(DATA_DIR, "brazil-leagues-partial.json");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const log = (msg: string) =>
  console.log(`[seed-brazil] ${new Date().toISOString().slice(11, 19)}  ${msg}`);

function loadLeagues(includPartial: boolean): LeagueValidation[] {
  if (!fs.existsSync(FULL_PATH)) {
    throw new Error(
      `brazil-leagues-full.json not found at ${FULL_PATH}.\n` +
      `Run first: npx ts-node src/scripts/validate-brazil-leagues.ts`,
    );
  }

  const full: LeagueValidation[] = JSON.parse(fs.readFileSync(FULL_PATH, "utf-8"));

  if (!includPartial) return full;

  const partial: LeagueValidation[] = fs.existsSync(PARTIAL_PATH)
    ? JSON.parse(fs.readFileSync(PARTIAL_PATH, "utf-8"))
    : [];

  return [...full, ...partial];
}

// ---------------------------------------------------------------------------
// Checkpoint helpers
// ---------------------------------------------------------------------------

async function getCheckpoint(leagueExternalId: number): Promise<Date | null> {
  const row = await prisma.ingestionCheckpoint.findUnique({
    where: { leagueExternalId },
    select: { lastFixtureDate: true },
  });
  return row?.lastFixtureDate ?? null;
}

async function saveCheckpoint(leagueExternalId: number) {
  await prisma.ingestionCheckpoint.upsert({
    where: { leagueExternalId },
    update: { lastFixtureDate: new Date() },
    create: { leagueExternalId, lastFixtureDate: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Per-league worker
// ---------------------------------------------------------------------------

async function processLeague(
  league: LeagueValidation,
  index: number,
  total: number,
): Promise<{ success: boolean; events: number; fixturesNew: number }> {
  const tag = `[${index + 1}/${total}] "${league.name}" (id=${league.id}) [${league.status}]`;
  log(`▶ ${tag}`);

  try {
    const sinceDate = await getCheckpoint(league.id);
    if (sinceDate) {
      log(`  ↳ Incremental since ${sinceDate.toISOString().slice(0, 10)}`);
    }

    const result = await ingestLeagueViaFixtures(league.id, {
      maxFinishedFixtures: MAX_FINISHED_FIXTURES,
      maxPages: FIXTURE_PAGES,
      sinceDate: sinceDate ?? undefined,
    });

    await saveCheckpoint(league.id);

    log(
      `  ✓ fixtures=${result.fixturesTotal} new=${result.fixturesNew}` +
      ` finished=${result.fixturesFinished} events=${result.eventsTotal}`,
    );

    return { success: true, events: result.eventsTotal, fixturesNew: result.fixturesNew };
  } catch (err) {
    log(`  ✗ ${(err as Error).message}`);
    return { success: false, events: 0, fixturesNew: 0 };
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

async function printSummary() {
  const [leagues, teams, matches, events] = await Promise.all([
    prisma.league.count(),
    prisma.team.count(),
    prisma.match.count(),
    prisma.matchEvent.count(),
  ]);

  const withCoords = await prisma.matchEvent.count({
    where: { x: { not: null }, y: { not: null } },
  });

  const brazilMatches = await prisma.match.count({
    where: {
      season: { league: { country: { name: { contains: "Brazil", mode: "insensitive" } } } },
    },
  });

  log("");
  log("── DB Summary ───────────────────────────────────────────");
  log(`  Leagues (total)   : ${leagues}`);
  log(`  Teams             : ${teams}`);
  log(`  Matches (total)   : ${matches}`);
  log(`  Matches (Brazil)  : ${brazilMatches}`);
  log(`  Events            : ${events}`);
  log(`  w/ coordinates    : ${withCoords} (${events > 0 ? Math.round((withCoords / events) * 100) : 0}%)`);
  log("─────────────────────────────────────────────────────────");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (process.env.NODE_ENV !== "development") {
    console.error("[seed-brazil] ❌  Aborted: NODE_ENV must be 'development'.");
    process.exit(1);
  }

  const includePartial = process.argv.includes("--include-partial");
  const leagues = loadLeagues(includePartial);

  log(`Mode: ${includePartial ? "FULL + PARTIAL" : "FULL only"}`);
  log(`Config: MAX_FINISHED_FIXTURES=${MAX_FINISHED_FIXTURES}  FIXTURE_PAGES=${FIXTURE_PAGES}  CONCURRENCY=${CONCURRENCY}`);
  log(`Leagues to ingest: ${leagues.length}`);
  leagues.forEach((l) => log(`  [${l.status}] ${l.name} (id=${l.id})`));
  log("");

  const limit = pLimit(CONCURRENCY);
  const results = await Promise.all(
    leagues.map((l, i) => limit(() => processLeague(l, i, leagues.length))),
  );

  const ok     = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const totalEvents   = results.reduce((s, r) => s + r.events, 0);
  const totalFixtures = results.reduce((s, r) => s + r.fixturesNew, 0);

  log(`\nSucceeded: ${ok}  Failed: ${failed}  New fixtures: ${totalFixtures}  Events: ${totalEvents}`);
  await printSummary();
  log("Done.");
}

main()
  .catch((err) => {
    console.error("[seed-brazil] Fatal:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
