/**
 * seed-global-leagues.ts
 *
 * Ingests players + stats for major international leagues via the Sportmonks
 * hierarchy pipeline: League → Season → Teams → Players + Stats + Overall
 *
 * League IDs confirmed from leagues.json (Sportmonks v3 football plan).
 * Season IDs are the currentSeasonId for each league as of 2025-26 season.
 *
 * USAGE
 *   # Ingest all leagues (slow — ~6-12 hours with rate limiting)
 *   npx ts-node src/scripts/seed-global-leagues.ts
 *
 *   # Single group
 *   npx ts-node src/scripts/seed-global-leagues.ts --group=europe_top5
 *   npx ts-node src/scripts/seed-global-leagues.ts --group=europe_mid
 *   npx ts-node src/scripts/seed-global-leagues.ts --group=south_america
 *
 *   # Single league by ID
 *   npx ts-node src/scripts/seed-global-leagues.ts --league=8
 *
 *   # Dry run (no DB writes)
 *   npx ts-node src/scripts/seed-global-leagues.ts --dry-run
 *
 * Requires: SPORTMONKS_API_TOKEN in .env
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { prisma } from "../lib/prisma";
import { ingestLeagueWithKnownSeason } from "../ingestion/hierarchy.ingestion.service";
import type { LeagueContext } from "../analytics/overall.engine";

// ─── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN    = args.includes("--dry-run");
const groupArg   = args.find((a) => a.startsWith("--group="))?.split("=")[1] ?? null;
const leagueArg  = args.find((a) => a.startsWith("--league="))?.split("=")[1] ?? null;

// ─── League registry ─────────────────────────────────────────────────────────

interface GlobalLeague {
  name:          string;
  country:       string;
  leagueId:      number;
  seasonId:      number;
  leagueContext: LeagueContext;
  group:         string;
}

/**
 * All season IDs are the currentSeasonId from leagues.json (2025-26 season).
 * Multi-season enrichment IDs are added to enrich-multi-season.ts separately.
 *
 * IDs marked "TO CONFIRM" were not present in the original leagues.json snapshot.
 * Use `npm run discover:seasons` to find the correct IDs for your Sportmonks plan,
 * then update the seasonId here.
 *
 * Africa leagues default to mock mode — set USE_MOCK_AFRICA=true to generate
 * intelligent mock players instead of querying the API.
 */
const GLOBAL_LEAGUES: GlobalLeague[] = [
  // ── European top-5 (volume reference = 1.00) ──────────────────────────────
  {
    name: "Premier League",
    country: "England",
    leagueId: 8,
    seasonId: 25583,
    leagueContext: "DEFAULT",
    group: "europe_top5",
  },
  {
    name: "La Liga",
    country: "Spain",
    leagueId: 564,
    seasonId: 25659,
    leagueContext: "DEFAULT",
    group: "europe_top5",
  },
  {
    name: "Serie A",
    country: "Italy",
    leagueId: 384,
    seasonId: 25533,
    leagueContext: "DEFAULT",
    group: "europe_top5",
  },
  {
    name: "Bundesliga",
    country: "Germany",
    leagueId: 82,
    seasonId: 25646,
    leagueContext: "DEFAULT",
    group: "europe_top5",
  },
  {
    name: "Ligue 1",
    country: "France",
    leagueId: 301,
    seasonId: 25651,
    leagueContext: "DEFAULT",
    group: "europe_top5",
  },

  // ── European mid-tier (volume ~5% below reference) ────────────────────────
  {
    name: "Eredivisie",
    country: "Netherlands",
    leagueId: 72,
    seasonId: 25597,
    leagueContext: "EUR_MID",
    group: "europe_mid",
  },
  {
    name: "Liga Portugal",
    country: "Portugal",
    leagueId: 462,
    seasonId: 25745,
    leagueContext: "EUR_MID",
    group: "europe_mid",
  },
  {
    name: "Scottish Premiership",
    country: "Scotland",
    leagueId: 501,
    seasonId: 25598,
    leagueContext: "EUR_MID",
    group: "europe_mid",
  },

  // ── European lower-tier (volume ~10% below reference) ─────────────────────
  {
    name: "Belgian Pro League",
    country: "Belgium",
    leagueId: 208,
    seasonId: 25600,
    leagueContext: "EUR_LOWER",
    group: "europe_mid",
  },
  {
    name: "Süper Lig",
    country: "Turkey",
    leagueId: 600,
    seasonId: 25682,
    leagueContext: "EUR_LOWER",
    group: "europe_mid",
  },

  // ── European extra-tier (volume ~12% below reference) ─────────────────────
  {
    name: "Admiral Bundesliga",   // Austrian top division
    country: "Austria",
    leagueId: 44,
    seasonId: 25910,              // TO CONFIRM via discover-seasons
    leagueContext: "EUR_EXTRA",
    group: "europe_extra",
  },
  {
    name: "Superliga",            // Danish Superliga
    country: "Denmark",
    leagueId: 271,
    seasonId: 25801,              // TO CONFIRM via discover-seasons
    leagueContext: "EUR_EXTRA",
    group: "europe_extra",
  },
  {
    name: "Allsvenskan",          // Swedish top division
    country: "Sweden",
    leagueId: 375,
    seasonId: 26100,              // TO CONFIRM via discover-seasons
    leagueContext: "EUR_EXTRA",
    group: "europe_extra",
  },
  {
    name: "SuperSport HNL",       // Croatian top division
    country: "Croatia",
    leagueId: 119,
    seasonId: 25830,              // TO CONFIRM via discover-seasons
    leagueContext: "EUR_EXTRA",
    group: "europe_extra",
  },
  {
    name: "Fortuna Liga",         // Czech First League
    country: "Czech Republic",
    leagueId: 134,
    seasonId: 25835,              // TO CONFIRM via discover-seasons
    leagueContext: "EUR_EXTRA",
    group: "europe_extra",
  },

  // ── South America top (volume ~15% below reference) ───────────────────────
  {
    name: "Liga Profesional de Fútbol",
    country: "Argentina",
    leagueId: 636,
    seasonId: 26808,
    leagueContext: "SA_TOP",
    group: "south_america",
  },
  {
    name: "Liga MX",
    country: "Mexico",
    leagueId: 444,
    seasonId: 27050,              // TO CONFIRM via discover-seasons
    leagueContext: "SA_TOP",
    group: "south_america",
  },
  {
    name: "MLS",
    country: "USA",
    leagueId: 1,
    seasonId: 26920,              // TO CONFIRM via discover-seasons
    leagueContext: "SA_TOP",
    group: "south_america",
  },

  // ── South America mid (volume ~22% below reference) ───────────────────────
  {
    name: "Primera División (Chile)",
    country: "Chile",
    leagueId: 663,
    seasonId: 26873,
    leagueContext: "SA_MID",
    group: "south_america",
  },
  {
    name: "Liga BetPlay (Colombia)",
    country: "Colombia",
    leagueId: 672,
    seasonId: 26881,
    leagueContext: "SA_MID",
    group: "south_america",
  },
  {
    name: "Primera División (Uruguay)",
    country: "Uruguay",
    leagueId: 649,
    seasonId: 27020,              // TO CONFIRM via discover-seasons
    leagueContext: "SA_MID",
    group: "south_america",
  },

  // ── South America lower (volume ~28% below reference) ─────────────────────
  {
    name: "Liga 1 (Peru)",
    country: "Peru",
    leagueId: 659,
    seasonId: 27010,              // TO CONFIRM via discover-seasons
    leagueContext: "SA_LOWER",
    group: "south_america",
  },

  // ── Africa top (volume ~25% below reference) ──────────────────────────────
  // NOTE: Confirm IDs via discover-seasons. Mock data available via
  //       `npm run seed:mock:players -- --group=africa`
  {
    name: "DStv Premiership",     // South Africa PSL
    country: "South Africa",
    leagueId: 672,
    seasonId: 27100,              // TO CONFIRM via discover-seasons
    leagueContext: "AFRICA_TOP",
    group: "africa",
  },
  {
    name: "Egyptian Premier League",
    country: "Egypt",
    leagueId: 237,
    seasonId: 27110,              // TO CONFIRM via discover-seasons
    leagueContext: "AFRICA_TOP",
    group: "africa",
  },
  {
    name: "Botola Pro",           // Morocco top division
    country: "Morocco",
    leagueId: 429,
    seasonId: 27120,              // TO CONFIRM via discover-seasons
    leagueContext: "AFRICA_TOP",
    group: "africa",
  },

  // ── Africa mid (volume ~32% below reference) ──────────────────────────────
  // Nigeria NPFL: limited API coverage — use mock mode recommended
  {
    name: "Nigeria Premier Football League",
    country: "Nigeria",
    leagueId: 479,
    seasonId: 27130,              // TO CONFIRM via discover-seasons
    leagueContext: "AFRICA_MID",
    group: "africa",
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function selectLeagues(): GlobalLeague[] {
  if (leagueArg) {
    const id = Number(leagueArg);
    const match = GLOBAL_LEAGUES.find((l) => l.leagueId === id);
    if (!match) {
      console.error(`❌  Nenhuma liga encontrada com leagueId=${id}`);
      process.exit(1);
    }
    return [match];
  }

  if (groupArg) {
    const matched = GLOBAL_LEAGUES.filter((l) => l.group === groupArg);
    if (matched.length === 0) {
      const validGroups = [...new Set(GLOBAL_LEAGUES.map((l) => l.group))].join(", ");
      console.error(`❌  Grupo inválido: "${groupArg}". Use: ${validGroups}`);
      process.exit(1);
    }
    return matched;
  }

  return GLOBAL_LEAGUES;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startedAt = Date.now();
  const toProcess = selectLeagues();

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║      INGESTÃO DE JOGADORES — LIGAS GLOBAIS          ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`\n  Ligas a processar : ${toProcess.length}`);
  console.log(`  Modo dry-run      : ${DRY_RUN}`);
  console.log(`  Grupo             : ${groupArg ?? "all"}`);
  console.log();

  toProcess.forEach((l) =>
    console.log(
      `  [${l.group.padEnd(12)}] ${l.name.padEnd(32)} leagueId=${l.leagueId}  season=${l.seasonId}  ctx=${l.leagueContext}`,
    ),
  );

  if (DRY_RUN) {
    console.log("\n  ⚠  DRY RUN — nenhuma escrita no banco.\n");
    await prisma.$disconnect();
    return;
  }

  const results: Array<{
    league:   string;
    country:  string;
    season:   string;
    teams:    number;
    players:  number;
    error?:   string;
  }> = [];

  for (const league of toProcess) {
    console.log(`\n  ▶ [${league.country}] ${league.name}  (ctx=${league.leagueContext})…`);

    try {
      const summary = await ingestLeagueWithKnownSeason(
        league.leagueId,
        league.seasonId,
        league.leagueContext,
      );

      results.push({ ...summary, country: league.country });
      console.log(
        `    ✓ Temporada: ${summary.season} | Times: ${summary.teams} | Jogadores: ${summary.players}`,
      );
    } catch (err) {
      const msg = (err as Error).message;
      console.error(`    ✗ Erro: ${msg}`);
      results.push({
        league:  league.name,
        country: league.country,
        season:  "-",
        teams:   0,
        players: 0,
        error:   msg,
      });
    }
  }

  // ── Final report ────────────────────────────────────────────────────────────

  const durationMs = Date.now() - startedAt;
  const sep = "═".repeat(62);

  console.log("\n" + sep);
  console.log("  INGESTÃO GLOBAL — RESULTADO FINAL");
  console.log(sep);

  let grandPlayers = 0;
  let grandTeams   = 0;

  for (const r of results) {
    grandPlayers += r.players;
    grandTeams   += r.teams;

    if (r.error) {
      console.log(`  ✗  [${r.country.padEnd(12)}] ${r.league.padEnd(32)}: ERRO — ${r.error.slice(0, 50)}`);
    } else {
      console.log(
        `  ✓  [${r.country.padEnd(12)}] ${r.league.padEnd(32)}: ${r.season} | ${r.teams} times | ${r.players} jogs`,
      );
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

  console.log("\n  Estado do banco após ingestão:");
  console.log(`    Ligas         : ${leagues}`);
  console.log(`    Temporadas    : ${seasons}`);
  console.log(`    Times         : ${teams}`);
  console.log(`    Jogadores SM  : ${smPlayers}`);
  console.log(`    Com overall   : ${withOverall}  (${smPlayers > 0 ? Math.round((withOverall / smPlayers) * 100) : 0}%)`);
  console.log(`    Com foto      : ${withImage}  (${smPlayers > 0 ? Math.round((withImage / smPlayers) * 100) : 0}%)`);
  console.log(sep + "\n");

  console.log("  ⚡ Próximo passo:");
  console.log("     Rode o enriquecimento multi-temporada para calcular");
  console.log("     overall DNA baseado em dados históricos:");
  console.log("     npm run enrich:global:all\n");

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("❌  Erro fatal:", (err as Error).message);
  await prisma.$disconnect();
  process.exit(1);
});
