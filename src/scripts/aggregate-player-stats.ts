import { prisma } from "../lib/prisma";

export async function aggregatePlayerStats() {
  console.log("Iniciando agregação de stats por jogador...");

  const playersWithEvents = await prisma.$queryRawUnsafe<{ playerId: string }[]>(`
    SELECT DISTINCT "playerId" FROM "MatchEvent" WHERE "playerId" IS NOT NULL
  `);
  console.log(`Jogadores com eventos: ${playersWithEvents.length}`);

  let processed = 0;
  let errors = 0;

  for (let i = 0; i < playersWithEvents.length; i++) {
    const { playerId } = playersWithEvents[i];

    try {
      // Load all events for this player with season info
      const events = await prisma.matchEvent.findMany({
        where: { playerId },
        select: {
          type: true,
          minute: true,
          matchId: true,
          match: { select: { seasonId: true, season: { select: { year: true } } } },
        },
      });

      // Group by seasonId
      const bySeason = new Map<string, typeof events>();
      for (const ev of events) {
        const seasonId = ev.match?.seasonId;
        if (!seasonId) continue;
        if (!bySeason.has(seasonId)) bySeason.set(seasonId, []);
        bySeason.get(seasonId)!.push(ev);
      }

      for (const [seasonId, seasonEvents] of bySeason) {
        const goals         = seasonEvents.filter(e => e.type === "GOAL").length;
        const yellowCards   = seasonEvents.filter(e => e.type === "YELLOW_CARD").length;
        const redCards      = seasonEvents.filter(e => e.type === "RED_CARD").length;
        const penalties     = seasonEvents.filter(e => e.type === "PENALTY").length;
        const substitutions = seasonEvents.filter(e => e.type === "SUBSTITUTION").length;

        const matchIds  = new Set(seasonEvents.map(e => e.matchId));
        const appearances = matchIds.size;

        // Estimate minutes: for each match, use substitution minute if available,
        // otherwise assume 90. Conservative cap at 90 per match.
        let minutes = 0;
        for (const matchId of matchIds) {
          const matchEvents = seasonEvents.filter(e => e.matchId === matchId);
          const subEvent = matchEvents.find(e => e.type === "SUBSTITUTION" && e.minute != null);
          if (subEvent?.minute != null) {
            // Substitution could be "in" or "out"; use 75 as middle ground
            // unless minute is clearly late-game (>60) suggesting sub-out
            minutes += subEvent.minute > 60 ? subEvent.minute : 90 - subEvent.minute;
          } else {
            minutes += 90;
          }
        }

        const seasonLabel = seasonEvents[0]?.match?.season?.year
          ? String(seasonEvents[0].match.season.year)
          : null;

        const data = {
          goals,
          yellowCards,
          redCards,
          appearances,
          minutes,
          assists: 0,
          source: "sportmonks",
          ...(seasonLabel ? { season: seasonLabel } : {}),
        };

        const existing = await prisma.playerStats.findFirst({
          where: { playerId, seasonId },
          select: { id: true },
        });

        if (existing) {
          await prisma.playerStats.update({ where: { id: existing.id }, data });
        } else {
          await prisma.playerStats.create({ data: { playerId, seasonId, ...data } });
        }

        processed++;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  Erro jogador ${playerId}: ${msg}`);
      errors++;
    }

    if ((i + 1) % 100 === 0 || i + 1 === playersWithEvents.length) {
      console.log(
        `[${i + 1}/${playersWithEvents.length}] ` +
          `registros=${processed} erros=${errors}`,
      );
    }
  }

  console.log("\n=== AGREGAÇÃO CONCLUÍDA ===");
  console.log(`✅ Registros criados/atualizados: ${processed}`);
  console.log(`❌ Erros: ${errors}`);
}

aggregatePlayerStats()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
