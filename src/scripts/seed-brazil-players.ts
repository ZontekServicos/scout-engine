/**
 * seed-brazil-players.ts
 *
 * Ingests players + stats for the main Brazilian football leagues from the
 * Sportmonks API, using the hierarchy ingestion pipeline:
 *
 *   League → Season (known ID) → Teams → Players + Stats + Overall
 *
 * Uses ingestLeagueWithKnownSeason() to bypass /seasons?filters=league_id:X
 * which returns HTTP 400 on plans that don't support that filter.
 *
 * Leagues targeted:
 *   - Série A        (leagueId=648,  seasonId=26763)
 *   - Série B        (leagueId=651,  seasonId=27198)
 *   - Copa do Brasil (leagueId=654,  seasonId=27151)  ← --include-copa flag
 *
 * Each player gets:
 *   ✓ Photo (image_path)
 *   ✓ Physical (height, weight, foot)
 *   ✓ Contract / market value
 *   ✓ Full stats snapshot (goals, assists, xG, passes, tackles, saves…)
 *   ✓ Overall + attribute blocks calculated from stats
 *
 * Usage:
 *   npx ts-node src/scripts/seed-brazil-players.ts
 *   npx ts-node src/scripts/seed-brazil-players.ts --dry-run
 *   npx ts-node src/scripts/seed-brazil-players.ts --serie-a-only
 *   npx ts-node src/scripts/seed-brazil-players.ts --include-copa
 *
 * Requires: SPORTMONKS_API_TOKEN in .env
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { prisma } from "../lib/prisma";
import { ingestLeagueWithKnownSeason } from "../ingestion/hierarchy.ingestion.service";

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

const DRY_RUN      = args.includes("--dry-run");
const SERIE_A_ONLY = args.includes("--serie-a-only");
const INCLUDE_COPA = args.includes("--include-copa");

// ---------------------------------------------------------------------------
// League registry — season IDs from validate-brazil-leagues output
// (avoids /seasons?filters=league_id:X which returns 400 on this plan)
// ---------------------------------------------------------------------------

interface BrazilLeague {
  name:      string;
  leagueId:  number;
  seasonId:  number;
  tier:      string;
  include:   boolean;
}

const BRAZIL_LEAGUES: BrazilLeague[] = [
  { name: "Série A",        leagueId: 648, seasonId: 26763, tier: "1ª divisão",    include: true },
  { name: "Série B",        leagueId: 651, seasonId: 27198, tier: "2ª divisão",    include: !SERIE_A_ONLY },
  { name: "Copa do Brasil", leagueId: 654, seasonId: 27151, tier: "Copa nacional", include: INCLUDE_COPA },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startedAt = Date.now();

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║        INGESTÃO DE JOGADORES — LIGAS BRASILEIRAS    ║");
  console.log("╚══════════════════════════════════════════════════════╝");

  const toProcess = BRAZIL_LEAGUES.filter((l) => l.include);

  console.log(`\n  Ligas a processar: ${toProcess.length}`);
  toProcess.forEach((l) =>
    console.log(`    [${l.tier}] ${l.name} (leagueId=${l.leagueId}, seasonId=${l.seasonId})`),
  );
  console.log(`  Modo dry-run: ${DRY_RUN}`);

  if (DRY_RUN) {
    console.log("\n  ⚠  DRY RUN — nenhuma escrita no banco.");
    console.log("     Remove --dry-run para executar.\n");
    await prisma.$disconnect();
    return;
  }

  const results: Array<{
    league:   string;
    season:   string;
    teams:    number;
    players:  number;
    error?:   string;
  }> = [];

  for (const league of toProcess) {
    console.log(`\n  ▶ ${league.name} (leagueId=${league.leagueId}, seasonId=${league.seasonId})…`);

    try {
      const summary = await ingestLeagueWithKnownSeason(league.leagueId, league.seasonId);
      results.push(summary);
      console.log(
        `    ✓ Temporada: ${summary.season} | Times: ${summary.teams} | Jogadores: ${summary.players}`,
      );
    } catch (err) {
      const msg = (err as Error).message;
      console.error(`    ✗ Erro: ${msg}`);
      results.push({ league: league.name, season: "-", teams: 0, players: 0, error: msg });
    }
  }

  // -------------------------------------------------------------------------
  // Final report
  // -------------------------------------------------------------------------

  const durationMs = Date.now() - startedAt;
  const sep = "═".repeat(58);

  console.log("\n" + sep);
  console.log("  INGESTÃO CONCLUÍDA — RESULTADO");
  console.log(sep);

  let grandPlayers = 0;
  let grandTeams   = 0;

  for (const r of results) {
    grandPlayers += r.players;
    grandTeams   += r.teams;

    if (r.error) {
      console.log(`  ✗  ${r.league.padEnd(20)} : ERRO — ${r.error.slice(0, 60)}`);
    } else {
      console.log(`  ✓  ${r.league.padEnd(20)} : ${r.season} | ${r.teams} times | ${r.players} jogadores`);
    }
  }

  console.log(sep);
  console.log(`  Total times      : ${grandTeams}`);
  console.log(`  Total jogadores  : ${grandPlayers}`);
  console.log(`  Duração          : ${(durationMs / 1_000).toFixed(1)}s`);
  console.log(sep);

  // DB summary
  const [smPlayers, teams, leagues, seasons] = await Promise.all([
    prisma.player.count({ where: { source: "sportmonks" } }),
    prisma.team.count(),
    prisma.league.count(),
    prisma.season.count(),
  ]);

  const [withOverall, withImage] = await Promise.all([
    prisma.player.count({ where: { source: "sportmonks", overallCalculatedAt: { not: null } } }),
    prisma.player.count({ where: { source: "sportmonks", imagePath: { not: null } } }),
  ]);

  console.log("\n  Estado do banco:");
  console.log(`    Ligas         : ${leagues}`);
  console.log(`    Temporadas    : ${seasons}`);
  console.log(`    Times         : ${teams}`);
  console.log(`    Jogadores SM  : ${smPlayers}`);
  console.log(`    Com overall   : ${withOverall} (${smPlayers > 0 ? Math.round((withOverall / smPlayers) * 100) : 0}%)`);
  console.log(`    Com foto      : ${withImage} (${smPlayers > 0 ? Math.round((withImage / smPlayers) * 100) : 0}%)`);
  console.log(sep + "\n");

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("❌ Erro fatal:", (err as Error).message);
  await prisma.$disconnect();
  process.exit(1);
});
