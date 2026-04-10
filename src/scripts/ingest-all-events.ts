import { prisma } from "../lib/prisma";
import { ingestMatchEvents } from "../ingestion/match.ingestion.service";

export const BATCH_SIZE = 5;
export const DELAY_MS = 1000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function ingestAllMatchEvents() {
  console.log("Buscando partidas finalizadas sem eventos...");

  const matchesWithEvents = await prisma.matchEvent.findMany({
    select: { matchId: true },
    distinct: ["matchId"],
  });
  const matchIdsWithEvents = new Set(matchesWithEvents.map((e) => e.matchId));

  // Filter: started in the past (proxy for "finished"), resilient to null status
  const now = new Date();
  const allMatches = await prisma.match.findMany({
    where: {
      startingAt: { lt: now },
    },
    select: { id: true, externalId: true },
    orderBy: { startingAt: "asc" },
  });

  const pending = allMatches.filter((m) => !matchIdsWithEvents.has(m.id));

  console.log(`Total partidas passadas: ${allMatches.length}`);
  console.log(`Já com eventos: ${matchIdsWithEvents.size}`);
  console.log(`Pendentes: ${pending.length}`);

  const estimatedMinutes = Math.ceil(
    (Math.ceil(pending.length / BATCH_SIZE) * DELAY_MS) / 60_000,
  );
  console.log(`Estimativa: ~${estimatedMinutes} min com batch=${BATCH_SIZE} delay=${DELAY_MS}ms\n`);

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (match) => {
        try {
          const events = await ingestMatchEvents(match.externalId);
          if (events.length > 0) {
            success++;
          } else {
            skipped++;
          }
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error(`  Erro fixture ${match.externalId}: ${msg}`);
          failed++;
        }
      }),
    );

    const progress = Math.min(i + BATCH_SIZE, pending.length);
    console.log(
      `[${progress}/${pending.length}] ` +
        `✅ ${success} | ⚠️ ${skipped} sem eventos | ❌ ${failed} erros`,
    );

    if (i + BATCH_SIZE < pending.length) {
      await delay(DELAY_MS);
    }
  }

  console.log("\n=== INGESTÃO CONCLUÍDA ===");
  console.log(`✅ Sucesso: ${success}`);
  console.log(`⚠️ Sem eventos: ${skipped}`);
  console.log(`❌ Erros: ${failed}`);
}

// Run directly
ingestAllMatchEvents()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
