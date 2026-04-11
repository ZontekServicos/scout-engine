import { prisma } from "../lib/prisma";
import { calculateOverallV2 } from "../analytics/overall-v2.engine";

async function main() {
  // Find a player with both overallPace populated and PlayerStats
  const player = await prisma.player.findFirst({
    where: {
      overallPace: { not: null },
      statsSnapshots: { some: {} },
    },
    select: {
      id: true, name: true, positions: true, age: true, league: true,
      overallPace: true, overallShooting: true, overallPassing: true,
      overallDribbling: true, overallDefending: true, overallPhysical: true,
      overall: true,
    },
  });

  if (!player) {
    console.log("Nenhum jogador com macro blocks E PlayerStats encontrado.");
    process.exit(0);
  }

  const stats = await prisma.playerStats.findFirst({
    where: { playerId: player.id },
    orderBy: { createdAt: "desc" },
    select: {
      goals: true, assists: true, xG: true, xA: true,
      passAccuracy: true, tackles: true, interceptions: true,
      rating: true, minutes: true, appearances: true,
    },
  });

  const result = calculateOverallV2(player, stats);

  console.log(`\nJogador: ${player.name}`);
  console.log(`Liga: ${player.league ?? "N/A"}  |  Posição: ${result.position}`);
  console.log(`Overall v1 (banco): ${player.overall ?? "N/A"}`);
  console.log(`Overall v2:         ${result.overall}  [${result.tier}]`);
  console.log(`Confiável: ${result.reliable}`);
  console.log(`\nPilares:`);
  console.log(`  MacroSkill   ${result.macroSkillScore}  × 0.50 = ${result.breakdown.macro}`);
  console.log(`  Performance  ${result.performanceScore}  × 0.25 = ${result.breakdown.performance}`);
  console.log(`  Consistency  ${result.consistencyScore}  × 0.15 = ${result.breakdown.consistency}`);
  console.log(`  Context      ${result.contextScore}  × 0.10 = ${result.breakdown.context}`);
  console.log(`\nMacroSkills: PAC=${result.macroSkills.pace} SHO=${result.macroSkills.shooting} PAS=${result.macroSkills.passing} DRI=${result.macroSkills.dribbling} DEF=${result.macroSkills.defending} PHY=${result.macroSkills.physical}`);
  console.log(`\nDNA:`);
  console.log(`  Impact=${result.dna.impact}  Intelligence=${result.dna.intelligence}  DefensiveIQ=${result.dna.defensiveIQ}  Consistency=${result.dna.consistency}  Potential=${result.dna.potential}`);
  console.log(`\nLeague: ${result.leagueContext} (scale=${result.leagueScale})`);

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
