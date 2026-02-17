import { prisma } from "../lib/prisma";
import { compareAttributes, CompareResult } from "./compare.engine";
import { POSITION_WEIGHTS } from "./ranking.weights";
import { calculateRankingScore, Attributes } from "./ranking.engine";

export async function compareByIds(idA: string, idB: string) {
  const [playerA, playerB] = await Promise.all([
    prisma.player.findUnique({ where: { id: idA } }),
    prisma.player.findUnique({ where: { id: idB } }),
  ]);

  if (!playerA || !playerB) {
    throw new Error("Player not found");
  }

  if (playerA.position !== playerB.position) {
    throw new Error("Players must have the same position");
  }

  const weights = POSITION_WEIGHTS[playerA.position];
  if (!weights) {
    throw new Error(`No weights for position ${playerA.position}`);
  }

  // 🔹 QUALITATIVE
  const qualitative: CompareResult = compareAttributes(
    playerA.attributes as Attributes,
    playerB.attributes as Attributes,
  );

  // 🔹 QUANTITATIVE
  const scoreA = calculateRankingScore(playerA.attributes as Attributes, weights);

  const scoreB = calculateRankingScore(playerB.attributes as Attributes, weights);

  const difference = Number(Math.abs(scoreA - scoreB).toFixed(2));

  const winner = scoreA > scoreB ? "A" : scoreB > scoreA ? "B" : "DRAW";

  // 🔹 CREATE REPORT
  const report = await prisma.scoutReport.create({
    data: {
      type: "COMPARE",
      playerId: playerA.id,
      input: {
        playerA: playerA.id,
        playerB: playerB.id,
      },
      output: {
        qualitative,
        quantitative: {
          scoreA,
          scoreB,
          difference,
          winner,
        },
      },
    },
  });

  // 🔹 SIMPLE AI NARRATIVE (mock inteligente)
  const aiNarrative = `
Comparison Report

${playerA.name} vs ${playerB.name}

${playerA.name} scored ${scoreA} points,
while ${playerB.name} scored ${scoreB} points.

Performance difference: ${difference}.

Overall Winner: ${winner === "A" ? playerA.name : winner === "B" ? playerB.name : "Draw"}.
`.trim();

  // 🔹 UPDATE REPORT WITH NARRATIVE
  await prisma.scoutReport.update({
    where: { id: report.id },
    data: {
      aiNarrative,
    },
  });

  return {
    reportId: report.id,
    position: playerA.position,
    playerA: {
      id: playerA.id,
      name: playerA.name,
      archetype: playerA.archetype,
    },
    playerB: {
      id: playerB.id,
      name: playerB.name,
      archetype: playerB.archetype,
    },
    qualitative,
    quantitative: {
      scoreA,
      scoreB,
      difference,
      winner,
    },
    aiNarrative,
  };
}
