/**
 * backfill-player-seasons.ts
 *
 * Populates PlayerSeason rows from existing PlayerStats data in the DB.
 * Safe to re-run (uses upsert). Does not touch the API.
 *
 * WHAT IT DOES
 * ─────────────────────────────────────────────────────────────────────────────
 *   1. Reads all PlayerStats rows that have a seasonId (linked to Season).
 *   2. Groups by (playerId, seasonId) — takes the stats row with most minutes.
 *   3. Upserts one PlayerSeason per group.
 *   4. Derives current team/league from the most recent season per player
 *      and updates Player.currentLeagueId + teamDbId if null.
 *
 * USAGE
 *   npx ts-node src/scripts/backfill-player-seasons.ts
 *   npx ts-node src/scripts/backfill-player-seasons.ts --dry-run
 *   npx ts-node src/scripts/backfill-player-seasons.ts --force   # overwrite existing rows
 *   npx ts-node src/scripts/backfill-player-seasons.ts --current-only  # only update currentLeagueId
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { prisma } from "../lib/prisma";
import { upsertPlayerSeason, setCurrentContext } from "../ingestion/player-season.service";

// ─── CLI ─────────────────────────────────────────────────────────────────────

const args         = process.argv.slice(2);
const DRY_RUN      = args.includes("--dry-run");
const FORCE        = args.includes("--force");
const CURRENT_ONLY = args.includes("--current-only");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deriveYearFromLabel(label: string | null | undefined): number | null {
  if (!label) return null;
  const match = label.match(/(\d{4})/);
  return match ? Number(match[1]) : null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startedAt = Date.now();

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║      BACKFILL — PlayerSeason de PlayerStats          ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`  Dry run      : ${DRY_RUN}`);
  console.log(`  Force        : ${FORCE}`);
  console.log(`  Current only : ${CURRENT_ONLY}`);
  console.log();

  // ── Phase 1: update currentLeagueId for players missing it ─────────────────

  if (CURRENT_ONLY || true) {
    // Find players whose currentLeagueId is null but have a team with a known season
    const playersWithoutLeague = await prisma.player.findMany({
      where: {
        currentLeagueId: null,
        source: "sportmonks",
        teamDbId: { not: null },
      },
      select: { id: true, teamDbId: true },
      take: 5000,
    });

    console.log(`  Jogadores sem currentLeagueId : ${playersWithoutLeague.length}`);

    if (!DRY_RUN) {
      let fixed = 0;
      for (const p of playersWithoutLeague) {
        if (!p.teamDbId) continue;

        // Find the most recent season for this team that links to a league
        const latestSeasonTeam = await prisma.season.findFirst({
          where: { teams: { some: { id: p.teamDbId } } },
          orderBy: [{ isCurrent: "desc" }, { year: "desc" }],
          select: { leagueId: true, isCurrent: true },
        });

        if (latestSeasonTeam?.leagueId) {
          await prisma.player.update({
            where: { id: p.id },
            data: { currentLeagueId: latestSeasonTeam.leagueId },
          });
          fixed++;
        }
      }
      console.log(`  currentLeagueId preenchidos  : ${fixed}`);
    }
  }

  if (CURRENT_ONLY) {
    await prisma.$disconnect();
    return;
  }

  // ── Phase 2: backfill PlayerSeason from PlayerStats ─────────────────────────

  // Count total work
  const totalStats = await prisma.playerStats.count({
    where: { seasonId: { not: null } },
  });
  console.log(`\n  PlayerStats com seasonId : ${totalStats}`);

  const existingSeasons = await prisma.playerSeason.count();
  console.log(`  PlayerSeason existentes  : ${existingSeasons}`);

  if (totalStats === 0) {
    console.log("  Nada a backfillar.\n");
    await prisma.$disconnect();
    return;
  }

  // Load all seasons from DB (for label/year lookup)
  const allDbSeasons = await prisma.season.findMany({
    select: { id: true, name: true, year: true, isCurrent: true, leagueId: true,
      league: { select: { id: true, name: true } } },
  });
  const seasonMeta = new Map(allDbSeasons.map((s) => [s.id, s]));

  // Process in batches of 500 PlayerStats rows
  const BATCH = 500;
  let offset  = 0;
  let upserted = 0;
  let skipped  = 0;
  let errors   = 0;

  // Track which (playerId, seasonId) pairs we've already processed in this run
  const processed = new Set<string>();

  console.log();

  while (true) {
    const rows = await prisma.playerStats.findMany({
      where:   { seasonId: { not: null } },
      select:  {
        playerId:    true,
        seasonId:    true,
        source:      true,
        goals:       true,
        assists:     true,
        minutes:     true,
        appearances: true,
        rating:      true,
        player: {
          select: {
            id:              true,
            overall:         true,
            potential:       true,
            dnaScore:        true,
            teamDbId:        true,
            currentLeagueId: true,
          },
        },
      },
      orderBy: [{ playerId: "asc" }, { seasonId: "asc" }],
      skip:    offset,
      take:    BATCH,
    });

    if (rows.length === 0) break;

    for (const row of rows) {
      const key = `${row.playerId}::${row.seasonId}`;
      if (processed.has(key)) { skipped++; continue; }
      processed.add(key);

      const season = seasonMeta.get(row.seasonId!);
      if (!season) { skipped++; continue; }

      // Skip if already exists and not forcing
      if (!FORCE) {
        const existing = await prisma.playerSeason.findUnique({
          where: { playerId_seasonId: { playerId: row.playerId, seasonId: row.seasonId! } },
          select: { id: true },
        });
        if (existing) { skipped++; continue; }
      }

      if (DRY_RUN) { upserted++; continue; }

      try {
        await upsertPlayerSeason({
          playerId:    row.playerId,
          seasonId:    row.seasonId!,
          teamId:      row.player.teamDbId ?? null,
          leagueId:    season.leagueId ?? null,
          leagueName:  season.league?.name ?? null,
          seasonLabel: season.name,
          seasonYear:  season.year ?? deriveYearFromLabel(season.name),
          overall:     row.player.overall ?? null,
          potential:   row.player.potential ?? null,
          dnaScore:    row.player.dnaScore as Record<string, unknown> | null,
          goals:       row.goals       ?? null,
          assists:     row.assists     ?? null,
          minutes:     row.minutes     ?? null,
          appearances: row.appearances ?? null,
          rating:      row.rating      ?? null,
          source:      row.source,
          isCurrent:   season.isCurrent,
        });
        upserted++;
      } catch (err) {
        errors++;
        if (errors <= 5) {
          console.error(`  ✗ ${row.playerId} / ${row.seasonId}: ${(err as Error).message}`);
        }
      }
    }

    offset += rows.length;
    const pct = Math.round((offset / totalStats) * 100);
    process.stdout.write(`\r  Processados: ${offset}/${totalStats} (${pct}%) — upserted: ${upserted}`);
  }

  console.log(); // newline after progress

  // ── Phase 3: fix currentLeagueId for players processed above ──────────────

  if (!DRY_RUN) {
    console.log("\n  Atualizando currentLeagueId dos jogadores afetados…");

    // Find all unique playerIds that had PlayerSeason rows created
    const affectedPlayers = await prisma.playerSeason.findMany({
      distinct: ["playerId"],
      select:   { playerId: true },
      where:    { leagueId: { not: null } },
    });

    let currentFixed = 0;
    for (const { playerId } of affectedPlayers) {
      // Get the most recent season for this player
      const latest = await prisma.playerSeason.findFirst({
        where:   { playerId },
        orderBy: [{ seasonYear: "desc" }, { createdAt: "desc" }],
        select:  { teamId: true, leagueId: true },
      });

      if (!latest) continue;

      const player = await prisma.player.findUnique({
        where:  { id: playerId },
        select: { currentLeagueId: true, teamDbId: true },
      });

      // Only update if null (don't overwrite fresh ingestion data)
      if (!player?.currentLeagueId && latest.leagueId) {
        await setCurrentContext(playerId, {
          teamId:   player?.teamDbId ?? latest.teamId ?? undefined,
          leagueId: latest.leagueId,
        });
        currentFixed++;
      }
    }

    console.log(`  currentLeagueId atualizados : ${currentFixed}`);
  }

  // ── Final report ────────────────────────────────────────────────────────────

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const sep = "═".repeat(58);

  console.log("\n" + sep);
  console.log("  BACKFILL — RESULTADO FINAL");
  console.log(sep);
  if (DRY_RUN) console.log("  ⚠  DRY RUN — nenhuma escrita no banco.");
  console.log(`  PlayerSeason upserted : ${upserted}`);
  console.log(`  Pulados               : ${skipped}  (já existiam ou sem seasonId)`);
  console.log(`  Erros                 : ${errors}`);
  console.log(`  Duração               : ${elapsed}s`);

  if (!DRY_RUN) {
    const total = await prisma.playerSeason.count();
    console.log(`  Total PlayerSeason DB : ${total}`);
  }

  console.log(sep + "\n");

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("❌  Erro fatal:", (err as Error).message);
  await prisma.$disconnect();
  process.exit(1);
});
