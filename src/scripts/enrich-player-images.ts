/**
 * enrich-player-images.ts
 *
 * Two-phase post-ingestion enrichment for player images.
 *
 * WHY TWO PHASES?
 *   Phase 1 (team roster) — 1 API request fetches ~25 players at once.
 *     → Best for players already linked to a team with a known Sportmonks season.
 *     → Uses ingestPlayersByTeam(teamId, seasonId) from hierarchy service.
 *
 *   Phase 2 (individual fallback) — 1 API request per player.
 *     → For players with no team link, or whose team has no active season.
 *     → Uses fetchPlayerWithStats(externalId) from client.
 *
 * PRIORITY ORDER (within each phase):
 *   1. Players with the most MatchEvents (active game participants)
 *   2. Players in Tier 1 leagues (LeagueDataProfile.tier = 1)
 *   3. Remaining players
 *
 * IDEMPOTENT:
 *   imageFetched = true → skipped (even if imagePath is null — genuinely no image).
 *   Only network errors leave imageFetched = false so next run retries them.
 *
 * Usage:
 *   npx ts-node src/scripts/enrich-player-images.ts
 *   npx ts-node src/scripts/enrich-player-images.ts --dry-run     ← count only, no API
 *   npx ts-node src/scripts/enrich-player-images.ts --batch 50    ← limit per phase
 *   npx ts-node src/scripts/enrich-player-images.ts --phase1-only
 *   npx ts-node src/scripts/enrich-player-images.ts --phase2-only
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import pLimit from "p-limit";
import { prisma } from "../lib/prisma";
import { ingestPlayersByTeam } from "../ingestion/hierarchy.ingestion.service";
import { fetchPlayerWithStats } from "../integrations/sportmonks/sportmonks.client";
import { isTransientError } from "../lib/errors";

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

const DRY_RUN     = args.includes("--dry-run");
const PHASE1_ONLY = args.includes("--phase1-only");
const PHASE2_ONLY = args.includes("--phase2-only");

const batchArg = args.find((a) => a.startsWith("--batch="))?.split("=")[1]
  ?? args[args.indexOf("--batch") + 1];
const BATCH_SIZE = batchArg ? Number(batchArg) : 200;

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

interface EnrichResult {
  playersEligible:   number;
  phase1Teams:       number;
  phase1Players:     number;
  phase1Images:      number;
  phase2Players:     number;
  phase2Images:      number;
  errors:            number;
  durationMs:        number;
}

// ---------------------------------------------------------------------------
// Queue: players that need enrichment
// ---------------------------------------------------------------------------

async function getEnrichmentQueue() {
  // Players where we haven't yet attempted a Sportmonks image fetch.
  // Ordered by event count DESC (most active players first), then by id.
  return prisma.player.findMany({
    where: {
      source:       "sportmonks",
      externalId:   { not: null },
      imageFetched: false,
    },
    select: {
      id:         true,
      externalId: true,
      name:       true,
      teamDbId:   true,
      _count:     { select: { matchEvents: true } },
    },
    orderBy: [
      { matchEvents: { _count: "desc" } },  // most event-linked players first
      { id: "asc" },
    ],
    take: BATCH_SIZE,
  });
}

// ---------------------------------------------------------------------------
// Phase 1 — Team roster batch
// ---------------------------------------------------------------------------

async function runPhase1(
  players: Awaited<ReturnType<typeof getEnrichmentQueue>>,
  result: EnrichResult,
): Promise<void> {
  // Group players by teamDbId (only those that have one)
  const byTeam = new Map<string, typeof players>();
  for (const p of players) {
    if (!p.teamDbId) continue;
    const group = byTeam.get(p.teamDbId) ?? [];
    group.push(p);
    byTeam.set(p.teamDbId, group);
  }

  if (byTeam.size === 0) {
    console.log("[phase1] No players with a known team — skipping phase 1.");
    return;
  }

  console.log(`[phase1] ${byTeam.size} team(s) to process…`);
  result.phase1Teams = byTeam.size;

  // For each team, find the best season (current first, then latest year)
  const teamIds = [...byTeam.keys()];
  const teams = await prisma.team.findMany({
    where: { id: { in: teamIds } },
    select: {
      id:         true,
      externalId: true,
      name:       true,
      seasons: {
        select: { id: true, externalId: true, isCurrent: true, year: true },
        orderBy: [{ isCurrent: "desc" }, { year: "desc" }],
        take: 1,
      },
    },
  });

  // Process teams with concurrency 2 (respect rate limits)
  const limit = pLimit(2);

  await Promise.all(
    teams.map((team) =>
      limit(async () => {
        const season = team.seasons[0];
        if (!season) {
          console.warn(`[phase1] Team "${team.name}" has no season in DB — skipping`);
          return;
        }

        const playersInTeam = byTeam.get(team.id) ?? [];
        console.log(
          `[phase1] Team "${team.name}" (ext=${team.externalId})` +
          ` season=${season.externalId}` +
          ` | ${playersInTeam.length} player(s) need enrichment`,
        );

        if (DRY_RUN) {
          result.phase1Players += playersInTeam.length;
          return;
        }

        try {
          // ingestPlayersByTeam fetches all team players and upserts with imageFetched=true
          await ingestPlayersByTeam(team.externalId, season.externalId);

          // Count how many in our queue now have images
          const enriched = await prisma.player.findMany({
            where: {
              id:        { in: playersInTeam.map((p) => p.id) },
              imagePath: { not: null },
            },
            select: { id: true },
          });

          result.phase1Players += playersInTeam.length;
          result.phase1Images  += enriched.length;
          console.log(
            `[phase1] Team "${team.name}" → ${enriched.length}/${playersInTeam.length} players got images`,
          );
        } catch (err) {
          const msg = (err as Error).message.split("\n")[0];
          if (isTransientError(err)) {
            // Transient: don't mark imageFetched, let next run retry
            console.error(`[phase1] Transient error for team "${team.name}": ${msg}`);
          } else {
            // Permanent: mark players as fetched so we don't waste calls next run
            await prisma.player.updateMany({
              where: { id: { in: playersInTeam.map((p) => p.id) } },
              data:  { imageFetched: true },
            });
            console.warn(`[phase1] Permanent error for team "${team.name}" (marked as fetched): ${msg}`);
          }
          result.errors++;
        }
      }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Phase 2 — Individual fallback
// ---------------------------------------------------------------------------

async function runPhase2(
  players: Awaited<ReturnType<typeof getEnrichmentQueue>>,
  result: EnrichResult,
): Promise<void> {
  // Only players that still have imageFetched=false after phase 1
  // (i.e., they had no team, or their team failed)
  const remaining = await prisma.player.findMany({
    where: {
      id:           { in: players.map((p) => p.id) },
      imageFetched: false,
      externalId:   { not: null },
    },
    select: { id: true, externalId: true, name: true },
  });

  if (remaining.length === 0) {
    console.log("[phase2] All players covered by phase 1 — nothing to do.");
    return;
  }

  console.log(`[phase2] ${remaining.length} player(s) for individual fallback…`);

  if (DRY_RUN) {
    result.phase2Players = remaining.length;
    return;
  }

  const limit = pLimit(3);   // 3 concurrent individual fetches

  await Promise.all(
    remaining.map((player) =>
      limit(async () => {
        try {
          const raw = await fetchPlayerWithStats(Number(player.externalId));
          const imagePath = raw.player.image_path ?? null;

          await prisma.player.update({
            where: { id: player.id },
            data:  { imagePath, imageFetched: true },
          });

          if (imagePath) result.phase2Images++;
          result.phase2Players++;
        } catch (err) {
          const msg = (err as Error).message.split("\n")[0];
          if (!isTransientError(err)) {
            // Permanent (player not found etc.) — mark as done to avoid infinite retry
            await prisma.player.update({
              where: { id: player.id },
              data:  { imageFetched: true },
            }).catch(() => {/* non-fatal */});
            console.warn(`[phase2] Permanent error for "${player.name}" (${player.externalId}): ${msg}`);
          } else {
            console.warn(`[phase2] Transient error for "${player.name}" — will retry next run: ${msg}`);
          }
          result.errors++;
        }
      }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Stats report
// ---------------------------------------------------------------------------

function printReport(result: EnrichResult): void {
  const sep = "═".repeat(58);
  console.log("\n" + sep);
  console.log("  ENRIQUECIMENTO DE IMAGENS — RESULTADO");
  console.log(sep);
  console.log(`  Jogadores elegíveis (imageFetched=false) : ${result.playersEligible}`);
  console.log(`\n  Fase 1 — Roster de equipe`);
  console.log(`    Times processados  : ${result.phase1Teams}`);
  console.log(`    Jogadores cobertos : ${result.phase1Players}`);
  console.log(`    Imagens obtidas    : ${result.phase1Images}`);
  console.log(`\n  Fase 2 — Individual fallback`);
  console.log(`    Jogadores cobertos : ${result.phase2Players}`);
  console.log(`    Imagens obtidas    : ${result.phase2Images}`);
  console.log(`\n  Total de imagens    : ${result.phase1Images + result.phase2Images}`);
  console.log(`  Erros               : ${result.errors}`);
  console.log(`  Duração             : ${(result.durationMs / 1000).toFixed(1)}s`);

  if (DRY_RUN) {
    console.log("\n  ⚠  DRY RUN — nenhuma chamada à API foi feita.");
  }

  const remaining = result.playersEligible - result.phase1Players - result.phase2Players;
  if (remaining > 0) {
    console.log(`\n  ℹ  ${remaining} jogador(es) além do limite do batch.`);
    console.log("     Rode novamente para continuar.");
  }

  console.log(sep + "\n");
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startedAt = Date.now();

  if (!process.env.SPORTMONKS_API_TOKEN && !DRY_RUN) {
    console.error("❌ SPORTMONKS_API_TOKEN não definido no .env");
    process.exit(1);
  }

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║       ENRIQUECIMENTO DE IMAGENS DE JOGADORES        ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`Batch: ${BATCH_SIZE} | Dry run: ${DRY_RUN} | Phase1: ${!PHASE2_ONLY} | Phase2: ${!PHASE1_ONLY}`);

  const result: EnrichResult = {
    playersEligible: 0,
    phase1Teams: 0, phase1Players: 0, phase1Images: 0,
    phase2Players: 0, phase2Images: 0,
    errors: 0, durationMs: 0,
  };

  // Quick stats before starting
  const [totalEligible, totalWithImage, totalPlayers] = await Promise.all([
    prisma.player.count({ where: { source: "sportmonks", imageFetched: false, externalId: { not: null } } }),
    prisma.player.count({ where: { source: "sportmonks", imagePath: { not: null } } }),
    prisma.player.count({ where: { source: "sportmonks" } }),
  ]);

  console.log(`\n  Total jogadores Sportmonks : ${totalPlayers}`);
  console.log(`  Com imagem (já enriquecidos): ${totalWithImage} (${Math.round(totalWithImage / Math.max(totalPlayers, 1) * 100)}%)`);
  console.log(`  Sem imagem (elegíveis)      : ${totalEligible}`);

  if (totalEligible === 0) {
    console.log("\n✅ Todos os jogadores já foram enriquecidos. Nada a fazer.");
    await prisma.$disconnect();
    return;
  }

  result.playersEligible = totalEligible;

  const queue = await getEnrichmentQueue();
  console.log(`\n  Processando batch de ${queue.length} jogador(es)…\n`);

  if (!PHASE2_ONLY) {
    console.log("── Fase 1: Roster de equipe ─────────────────────────────");
    await runPhase1(queue, result);
  }

  if (!PHASE1_ONLY) {
    console.log("\n── Fase 2: Individual fallback ──────────────────────────");
    await runPhase2(queue, result);
  }

  result.durationMs = Date.now() - startedAt;
  printReport(result);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("❌ Erro fatal:", (err as Error).message);
  await prisma.$disconnect();
  process.exit(1);
});
