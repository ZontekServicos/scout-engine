import { prisma } from "../lib/prisma";
import { fetchPlayerStatsMultiSeason } from "../integrations/sportmonks/sportmonks.client";

async function main() {
  // Salah's externalId
  const salah = await prisma.player.findFirst({
    where: { name: { contains: "Mohamed Salah", mode: "insensitive" } },
    select: { id: true, name: true, externalId: true },
  });
  console.log("Salah:", JSON.stringify(salah));

  if (!salah?.externalId) { console.log("Sem externalId!"); process.exit(0); }

  // Fetch raw stats — show all type_ids actually returned
  const result = await fetchPlayerStatsMultiSeason(
    Number(salah.externalId),
    [25583], // Premier League 2024-25
  );

  // result is the raw player data — show the details array
  const raw = result as any;
  const statistics = raw?.statistics ?? [];
  console.log(`\nStatistics seasons: ${statistics.length}`);

  for (const season of statistics) {
    const details: any[] = season.details ?? [];
    console.log(`\nSeason ${season.season_id}: ${details.length} detail entries`);
    // Show all type_ids with values
    for (const d of details.slice(0, 30)) {
      const val = typeof d.value === "object" ? JSON.stringify(d.value) : d.value;
      console.log(`  type_id=${d.type_id}  value=${val}`);
    }
  }

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
