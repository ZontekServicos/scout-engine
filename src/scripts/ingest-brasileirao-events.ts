import { prisma } from "../lib/prisma";
import { ingestMatchEvents } from "../ingestion/match.ingestion.service";

async function main() {
  // Get first 20 matches of the Brasileirão 2026 season
  const matches = await prisma.match.findMany({
    where: {
      season: {
        externalId: 26763,
      },
    },
    select: { id: true, externalId: true, status: true },
    orderBy: { startingAt: "asc" },
    take: 20,
  });

  console.log(`Found ${matches.length} matches to process`);

  let totalEvents = 0;
  let successCount = 0;
  let errorCount = 0;

  for (const match of matches) {
    try {
      console.log(`  Processing fixture ${match.externalId} (status: ${match.status})...`);
      const events = await ingestMatchEvents(match.externalId);
      totalEvents += events.length;
      successCount++;
      console.log(`    → ${events.length} events`);
      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 300));
    } catch (e: any) {
      console.error(`    Error: ${e.message}`);
      errorCount++;
    }
  }

  console.log(`\nDone. Matches: ${successCount} ok, ${errorCount} errors. Total events: ${totalEvents}`);
  process.exit(0);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
