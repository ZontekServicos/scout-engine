/**
 * dump-player-type-ids.ts
 *
 * Fetches ALL stat type_ids returned by Sportmonks for a given player + season
 * and prints them as a sorted table. Use this to verify/update SM_TYPE_ID mappings.
 *
 * Usage:
 *   npx ts-node src/scripts/dump-player-type-ids.ts --player=<externalId> --season=<seasonId>
 *   npx ts-node src/scripts/dump-player-type-ids.ts  # auto-picks first player with externalId
 *
 * Example (Salah, PL 2024-25):
 *   npx ts-node src/scripts/dump-player-type-ids.ts --player=14722 --season=25583
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { prisma } from "../lib/prisma";
import { fetchPlayerStatsMultiSeason } from "../integrations/sportmonks/sportmonks.client";

const args = process.argv.slice(2);

function getArg(key: string): string | undefined {
  const entry = args.find((a) => a.startsWith(`--${key}=`));
  return entry?.split("=")[1];
}

async function main() {
  const playerArg = getArg("player");
  const seasonArg = getArg("season");

  let externalId: number;
  let seasonId: number;

  if (playerArg && seasonArg) {
    externalId = Number(playerArg);
    seasonId   = Number(seasonArg);
  } else {
    // Auto-pick: find a player with externalId in DB
    const player = await prisma.player.findFirst({
      where: { externalId: { not: null } },
      select: { id: true, name: true, externalId: true, league: true },
    });
    if (!player?.externalId) {
      console.error("No player with externalId found in DB. Pass --player=<id> --season=<id>");
      process.exit(1);
    }
    externalId = Number(player.externalId);
    // Use known PL season ID as default
    seasonId   = Number(seasonArg ?? "25583");
    console.log(`Auto-selected: ${player.name} (externalId=${externalId}, league=${player.league})`);
  }

  console.log(`\nFetching stats for player=${externalId} season=${seasonId}...\n`);

  const data = await fetchPlayerStatsMultiSeason(externalId, [seasonId]);

  // The statistics array
  const statistics: any[] = (data as any).statistics ?? [];
  const group = statistics.find((g: any) => g.season_id === seasonId);
  const details: any[] = group?.details ?? [];

  if (details.length === 0) {
    console.log("No details found. The player may not have stats for this season,");
    console.log("or the season ID is wrong. Try --season=<another_id>.");
    console.log("\nRaw statistics groups found:");
    for (const g of statistics) {
      console.log("  season_id=" + g.season_id + "  details=" + (g.details?.length ?? 0));
    }
    await prisma.$disconnect();
    return;
  }

  console.log("type_id  | raw_value                      | type_name (Sportmonks)");
  console.log("---------+--------------------------------+---------------------------");

  // Sort by type_id for easy reading
  const sorted = [...details].sort((a, b) => a.type_id - b.type_id);

  for (const d of sorted) {
    const tid   = String(d.type_id).padEnd(8);
    const val   = JSON.stringify(d.value ?? d.data ?? null);
    const short = val.length > 30 ? val.slice(0, 27) + "..." : val;
    const name  = d.type?.name ?? d.stat_type?.name ?? "";
    console.log(tid + " | " + short.padEnd(30) + " | " + name);
  }

  console.log(`\nTotal type_ids: ${sorted.length}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
