/**
 * detect-league-capabilities.ts
 *
 * Probes a set of leagues against the Sportmonks API, detects their data tier,
 * and saves the result to LeagueDataProfile in the database.
 *
 * Usage:
 *   npx ts-node src/scripts/detect-league-capabilities.ts
 *   npx ts-node src/scripts/detect-league-capabilities.ts --leagues 2,5,8,564
 *   npx ts-node src/scripts/detect-league-capabilities.ts --refresh       ← ignores TTL
 *   npx ts-node src/scripts/detect-league-capabilities.ts --cached        ← DB only, no API
 *
 * npm scripts:
 *   npm run detect:capabilities
 *   npm run detect:capabilities:refresh
 *
 * Tier model:
 *   🟢 Tier 1 — Premium  : fixtures + events + coordinates
 *   🟡 Tier 2 — Standard : fixtures + events (no coordinates)
 *   🔴 Tier 3 — Basic    : fixtures only
 */

import * as dotenv from "dotenv";
import * as path from "path";
import pLimit from "p-limit";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import {
  detectLeagueCapabilities,
  getLeagueCapabilities,
  refreshLeagueCapabilities,
  getAllCachedProfiles,
  TIER_LABEL,
  TIER_EMOJI,
  type LeagueCapabilities,
} from "../integrations/sportmonks/league-capabilities";

// ---------------------------------------------------------------------------
// Default league list — edit freely
// ---------------------------------------------------------------------------

const DEFAULT_LEAGUES: Array<{ id: number; name: string }> = [
  // UEFA
  { id: 2,   name: "UEFA Champions League"    },
  { id: 5,   name: "UEFA Europa League"       },
  { id: 82,  name: "UEFA Conference League"   },

  // England
  { id: 8,   name: "Premier League"           },
  { id: 9,   name: "Championship"             },

  // Spain
  { id: 564, name: "La Liga"                  },
  { id: 567, name: "La Liga 2"                },

  // Germany
  { id: 82,  name: "Bundesliga"               },

  // Italy
  { id: 384, name: "Serie A"                  },

  // France
  { id: 301, name: "Ligue 1"                  },

  // Portugal
  { id: 462, name: "Primeira Liga"            },

  // Brazil
  { id: 325, name: "Brasileirão Série A"      },
  { id: 326, name: "Brasileirão Série B"      },
  { id: 71,  name: "Copa do Brasil"           },

  // Argentina
  { id: 155, name: "Liga Profesional"         },
];

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

const FLAG_REFRESH = args.includes("--refresh");
const FLAG_CACHED  = args.includes("--cached");

// --leagues 2,5,8
const leaguesFlag = args.find((a) => a.startsWith("--leagues="))?.split("=")[1]
  ?? args[args.indexOf("--leagues") + 1];

const LEAGUES_TO_PROBE: Array<{ id: number; name: string }> = leaguesFlag
  ? leaguesFlag.split(",").map((id) => ({ id: Number(id.trim()), name: `League #${id.trim()}` }))
  : DEFAULT_LEAGUES;

// Deduplicate by id
const UNIQUE_LEAGUES = [...new Map(LEAGUES_TO_PROBE.map((l) => [l.id, l])).values()];

// ---------------------------------------------------------------------------
// Reporting helpers
// ---------------------------------------------------------------------------

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function printTable(results: Array<{ league: string; caps: LeagueCapabilities | null }>): void {
  const SEP = "─".repeat(82);
  console.log("\n" + "═".repeat(82));
  console.log("  RESULTADO — PERFIL DE CAPACIDADE POR LIGA");
  console.log("═".repeat(82));
  console.log(
    "  " +
    pad("Liga", 30) +
    pad("Tier", 6) +
    pad("Fixtures", 10) +
    pad("Events", 10) +
    pad("Coords", 10) +
    "Fonte",
  );
  console.log("  " + SEP.slice(0, 80));

  // Group by tier
  const sorted = [...results].sort((a, b) => {
    const ta = a.caps?.tier ?? 9;
    const tb = b.caps?.tier ?? 9;
    return ta !== tb ? ta - tb : a.league.localeCompare(b.league);
  });

  let lastTier: number | null = null;
  for (const { league, caps } of sorted) {
    if (caps && caps.tier !== lastTier) {
      if (lastTier !== null) console.log("  " + "·".repeat(80));
      console.log(`  ${TIER_EMOJI[caps.tier]} ${TIER_LABEL[caps.tier]}`);
      lastTier = caps.tier;
    }

    if (!caps) {
      console.log("  " + pad(league, 30) + pad("ERR", 6) + "─".repeat(40));
      continue;
    }

    console.log(
      "  " +
      pad(league, 30) +
      pad(`${caps.tier}`, 6) +
      pad(String(caps.fixturesSample), 10) +
      pad(String(caps.eventsSample), 10) +
      pad(`${caps.coordsSample}/${caps.eventsSample}`, 10) +
      caps.source,
    );
  }

  console.log("  " + SEP.slice(0, 80));

  // Summary counts
  const t1 = results.filter((r) => r.caps?.tier === 1).length;
  const t2 = results.filter((r) => r.caps?.tier === 2).length;
  const t3 = results.filter((r) => r.caps?.tier === 3).length;
  const err = results.filter((r) => !r.caps).length;

  console.log(`\n  🟢 Tier 1 (Premium) : ${t1} liga(s)`);
  console.log(`  🟡 Tier 2 (Standard): ${t2} liga(s)`);
  console.log(`  🔴 Tier 3 (Basic)   : ${t3} liga(s)`);
  if (err > 0) console.log(`  ❌ Erro             : ${err} liga(s)`);
  console.log("═".repeat(82));
}

// ---------------------------------------------------------------------------
// Cached-only mode (no API calls)
// ---------------------------------------------------------------------------

async function runCachedMode(): Promise<void> {
  console.log("\n[detect] Modo --cached: lendo perfis do banco sem chamar a API…");
  const profiles = await getAllCachedProfiles();

  if (profiles.length === 0) {
    console.log("\n⚠  Nenhum perfil encontrado no banco.");
    console.log("   Execute sem --cached primeiro para popular o banco.");
    return;
  }

  const results = profiles.map((caps) => ({
    league: `League #${caps.leagueId}`,
    caps,
  }));
  printTable(results);
}

// ---------------------------------------------------------------------------
// Detection mode (calls API)
// ---------------------------------------------------------------------------

async function runDetectionMode(): Promise<void> {
  const limit = pLimit(2);   // max 2 concurrent API calls — respect rate limits

  console.log(`\n[detect] Detectando ${UNIQUE_LEAGUES.length} liga(s)${FLAG_REFRESH ? " (--refresh: ignora TTL)" : ""}…`);
  console.log("[detect] Concorrencia: 2 | credencial Sportmonks configurada");

  const results: Array<{ league: string; caps: LeagueCapabilities | null }> = [];

  const tasks = UNIQUE_LEAGUES.map(({ id, name }) =>
    limit(async () => {
      const label = `${name} (#${id})`;
      try {
        const caps = FLAG_REFRESH
          ? await refreshLeagueCapabilities(id)
          : await getLeagueCapabilities(id);
        results.push({ league: label, caps });
      } catch (err) {
        console.error(`[detect] ERRO em ${label}: ${(err as Error).message.split("\n")[0]}`);
        results.push({ league: label, caps: null });
      }
    }),
  );

  await Promise.all(tasks);
  printTable(results);
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

function printRecommendations(results: Array<{ league: string; caps: LeagueCapabilities | null }>): void {
  const tier1 = results.filter((r) => r.caps?.tier === 1);
  const tier2 = results.filter((r) => r.caps?.tier === 2);
  const tier3 = results.filter((r) => r.caps?.tier === 3);

  console.log("\n💡 RECOMENDAÇÕES PARA O PIPELINE:");

  if (tier1.length > 0) {
    console.log(`\n  🟢 Ligas Tier 1 — habilitar heatmap, shot map, pass map:`);
    tier1.forEach((r) => console.log(`     • ${r.league}`));
  }

  if (tier2.length > 0) {
    console.log(`\n  🟡 Ligas Tier 2 — buscar events mas desabilitar analytics espaciais:`);
    tier2.forEach((r) => console.log(`     • ${r.league}`));
  }

  if (tier3.length > 0) {
    console.log(`\n  🔴 Ligas Tier 3 — NÃO buscar /events (call desnecessária):`);
    tier3.forEach((r) => console.log(`     • ${r.league}`));
    console.log(`\n     → O pipeline já usa hasEvents=false para pular essas chamadas.`);
  }

  console.log("\n  ℹ  Perfis salvos em LeagueDataProfile. TTL: 7 dias.");
  console.log("     Após upgrade de plano, rode com --refresh para forçar reavaliação.");
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const token = process.env.SPORTMONKS_API_TOKEN;
  if (!token && !FLAG_CACHED) {
    console.error("❌ SPORTMONKS_API_TOKEN não definido no .env");
    process.exit(1);
  }

  console.log("╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║          SPORTMONKS — DETECÇÃO DE CAPACIDADES POR LIGA                     ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝");

  if (FLAG_CACHED) {
    await runCachedMode();
    return;
  }

  await runDetectionMode();

  // Re-read from DB for recommendations (ensures we show persisted data)
  const allProfiles = await getAllCachedProfiles();
  const resultsForRec = allProfiles
    .filter((p) => UNIQUE_LEAGUES.some((l) => l.id === p.leagueId))
    .map((caps) => ({
      league: UNIQUE_LEAGUES.find((l) => l.id === caps.leagueId)?.name ?? `League #${caps.leagueId}`,
      caps,
    }));
  printRecommendations(resultsForRec);

  console.log("\n[detect] Concluído.\n");
}

main().catch((err) => {
  console.error("❌ Erro fatal:", (err as Error).message);
  process.exit(1);
});
