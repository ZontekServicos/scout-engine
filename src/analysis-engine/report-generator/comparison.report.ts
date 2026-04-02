import type { PlayerComparisonOutput, Winner, DimensionResult } from "../types";

// ---------------------------------------------------------------------------
// Generates a Portuguese-language narrative from a PlayerComparisonOutput.
// ---------------------------------------------------------------------------

function nameOf(output: PlayerComparisonOutput, side: "A" | "B"): string {
  return side === "A" ? output.playerA.playerName : output.playerB.playerName;
}

function winnerName(output: PlayerComparisonOutput, winner: Winner): string {
  if (winner === "tie") return "os dois jogadores";
  return nameOf(output, winner);
}

function dimensionSentence(
  output: PlayerComparisonOutput,
  dim: DimensionResult,
  label: string,
): string {
  if (dim.winner === "tie") {
    return `Em ${label.toLowerCase()}, os jogadores apresentam desempenho similar.`;
  }
  const name = nameOf(output, dim.winner);
  const other = dim.winner === "A" ? output.playerB.playerName : output.playerA.playerName;
  const gap = Math.abs(dim.delta).toFixed(1);
  return `Em ${label.toLowerCase()}, ${name} se destaca sobre ${other} (diferença de ${gap} pontos).`;
}

function buildIntro(output: PlayerComparisonOutput): string {
  const nameA = output.playerA.playerName;
  const nameB = output.playerB.playerName;
  const posA = output.playerA.position ?? "campo";
  const posB = output.playerB.position ?? "campo";
  const samePos = posA.toLowerCase() === posB.toLowerCase();

  const posLine = samePos
    ? `Ambos atuam como ${posA}.`
    : `${nameA} atua como ${posA} e ${nameB} como ${posB}.`;

  return `Comparação técnica entre ${nameA} e ${nameB}. ${posLine}`;
}

function buildDimensionParagraph(output: PlayerComparisonOutput): string {
  const { dimensions } = output;
  const lines = [
    dimensionSentence(output, dimensions.scoring, "Poder de gol"),
    dimensionSentence(output, dimensions.creation, "Criação de jogadas"),
    dimensionSentence(output, dimensions.passing, "Qualidade de passe"),
    dimensionSentence(output, dimensions.defending, "Atividade defensiva"),
    dimensionSentence(output, dimensions.efficiency, "Eficiência"),
    dimensionSentence(output, dimensions.involvement, "Envolvimento no jogo"),
  ];
  return lines.join(" ");
}

function buildVerdict(output: PlayerComparisonOutput): string {
  const { betterScorer, betterCreator, betterOverall, scoreA, scoreB } = output;
  const nameA = output.playerA.playerName;
  const nameB = output.playerB.playerName;

  const scorerLine =
    betterScorer === "tie"
      ? "Os dois jogadores têm produção ofensiva equivalente."
      : `${winnerName(output, betterScorer)} é o melhor finalizador.`;

  const creatorLine =
    betterCreator === "tie"
      ? "A capacidade de criação é equilibrada entre eles."
      : `${winnerName(output, betterCreator)} lidera na criação de oportunidades.`;

  let overallLine: string;
  if (betterOverall === "tie") {
    overallLine = `No balanço geral, ${nameA} e ${nameB} estão muito próximos em desempenho.`;
  } else {
    const winner = winnerName(output, betterOverall);
    const loser = betterOverall === "A" ? nameB : nameA;
    const wScore = betterOverall === "A" ? scoreA : scoreB;
    const lScore = betterOverall === "A" ? scoreB : scoreA;
    overallLine = `No balanço geral, ${winner} apresenta vantagem sobre ${loser} (${wScore.toFixed(1)} vs ${lScore.toFixed(1)}).`;
  }

  return `${scorerLine} ${creatorLine} ${overallLine}`;
}

/**
 * Generate a Portuguese analysis string from the comparison output.
 * Mutates the `analysis` field in-place and returns the updated object.
 */
export function generateComparisonReport(
  output: PlayerComparisonOutput,
): PlayerComparisonOutput {
  const intro = buildIntro(output);
  const dimensions = buildDimensionParagraph(output);
  const verdict = buildVerdict(output);

  return {
    ...output,
    analysis: `${intro} ${dimensions} ${verdict}`,
  };
}

/**
 * Returns only the text report.
 */
export function generateComparisonText(output: PlayerComparisonOutput): string {
  return generateComparisonReport(output).analysis;
}
