/**
 * discover-seasons.ts
 *
 * Lists all historical seasons available in Sportmonks for the Brazilian leagues,
 * so you can find the season IDs needed for multi-season enrichment.
 *
 * USAGE
 *   npx ts-node src/scripts/discover-seasons.ts
 *   npx ts-node src/scripts/discover-seasons.ts --league=648     # Série A only
 *   npx ts-node src/scripts/discover-seasons.ts --league=651     # Série B only
 *
 * Known Brazilian league IDs (Sportmonks):
 *   648 — Brasileirão Série A
 *   651 — Brasileirão Série B
 *   444 — Copa do Brasil
 *
 * Note: 325 = La Liga (Spain), 390 = Championship (England) — NOT Brazilian.
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { fetchWithRetry } from "../integrations/sportmonks/sportmonks.client";

// ---------------------------------------------------------------------------
// Known Brazilian league IDs
// ---------------------------------------------------------------------------
const BRAZILIAN_LEAGUES: Record<number, string> = {
  648: "Série A",
  651: "Série B",
  444: "Copa do Brasil",
};

const BASE_URL = "https://api.sportmonks.com/v3/football";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const leagueArg = args.find((a) => a.startsWith("--league="))?.split("=")[1];
const targetLeagueId = leagueArg ? Number(leagueArg) : null;

const leaguesToQuery = targetLeagueId
  ? { [targetLeagueId]: BRAZILIAN_LEAGUES[targetLeagueId] ?? `League ${targetLeagueId}` }
  : BRAZILIAN_LEAGUES;

// ---------------------------------------------------------------------------
// Season interface (Sportmonks v3)
// ---------------------------------------------------------------------------
interface SportmonksSeasonRaw {
  id:          number;
  name:        string;
  league_id:   number;
  starting_at: string | null;
  ending_at:   string | null;
  finished:    boolean;
  pending:     boolean;
  is_current:  boolean;
}

interface PaginatedResponse<T> {
  data: T[];
  meta?: { pagination?: { total_pages?: number } };
}

// ---------------------------------------------------------------------------
// Fetch seasons via GET /leagues/{id}?include=seasons
// The /seasons?filters=leagueId:X endpoint is not available on all plans.
// The league include approach works universally.
// ---------------------------------------------------------------------------
interface LeagueWithSeasons {
  id:      number;
  name:    string;
  seasons: SportmonksSeasonRaw[];
}

async function fetchSeasonsForLeague(leagueId: number): Promise<SportmonksSeasonRaw[]> {
  const token = process.env.SPORTMONKS_API_TOKEN!;
  const url = `${BASE_URL}/leagues/${leagueId}?api_token=${token}&include=seasons`;

  const res = await fetchWithRetry(url);
  const json = await res.json() as { data: LeagueWithSeasons };
  return json.data?.seasons ?? [];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║          DISCOVER SEASONS — LIGAS BRASILEIRAS        ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  for (const [leagueIdStr, leagueName] of Object.entries(leaguesToQuery)) {
    const leagueId = Number(leagueIdStr);

    console.log(`  ── ${leagueName} (league_id: ${leagueId}) ──`);

    let seasons: SportmonksSeasonRaw[];
    try {
      seasons = await fetchSeasonsForLeague(leagueId);
    } catch (err) {
      console.error(`  ✗ Erro ao buscar temporadas: ${(err as Error).message}\n`);
      continue;
    }

    if (seasons.length === 0) {
      console.log("  Nenhuma temporada encontrada (verifique o league_id ou plano da API).\n");
      continue;
    }

    // Sort newest first
    seasons.sort((a, b) => (b.starting_at ?? "").localeCompare(a.starting_at ?? ""));

    const pad = (s: string, n: number) => s.padEnd(n);

    console.log(
      "  " +
      pad("ID",     8) +
      pad("Nome",   16) +
      pad("Início", 14) +
      pad("Fim",    14) +
      "Status",
    );
    console.log("  " + "─".repeat(64));

    for (const s of seasons) {
      const status = s.is_current
        ? "✅ ATUAL"
        : s.finished
        ? "concluída"
        : s.pending
        ? "pendente"
        : "em andamento";

      console.log(
        "  " +
        pad(String(s.id),          8) +
        pad(s.name,                16) +
        pad(s.starting_at ?? "-",  14) +
        pad(s.ending_at   ?? "-",  14) +
        status,
      );
    }

    // Print ready-to-use CLI suggestion for multi-season enrichment
    const recentIds = seasons
      .filter((s) => !s.pending)
      .slice(0, 3)
      .map((s) => s.id)
      .join(",");

    console.log(`\n  Sugestão --seasons para enrich-multi-season.ts:`);
    console.log(`  --seasons=${recentIds}\n`);
  }

  console.log("Pronto. Use os IDs acima com enrich-multi-season.ts.");
}

main().catch((err) => {
  console.error("❌ Erro fatal:", err.message);
  process.exit(1);
});
