type AttributeResult = "A" | "B" | "draw";

type ComparisonResults = {
  pace: AttributeResult;
  shooting: AttributeResult;
  passing: AttributeResult;
  dribbling: AttributeResult;
  defending: AttributeResult;
  physical: AttributeResult;
};

type Score = {
  playerA: number;
  playerB: number;
};

export function buildComparisonReport(
  results: ComparisonResults,
  score: Score
) {
  const advantagesA: string[] = [];
  const advantagesB: string[] = [];

  const labels: Record<keyof ComparisonResults, string> = {
    pace: "ritmo",
    shooting: "finalização",
    passing: "passe",
    dribbling: "condução",
    defending: "defesa",
    physical: "força física"
  };

  (Object.keys(results) as (keyof ComparisonResults)[]).forEach(attr => {
    if (results[attr] === "A") advantagesA.push(labels[attr]);
    if (results[attr] === "B") advantagesB.push(labels[attr]);
  });

  let summary = "";

  if (advantagesA.length) {
    summary += `Jogador A se destaca em ${advantagesA.join(", ")}. `;
  }

  if (advantagesB.length) {
    summary += `Jogador B leva vantagem em ${advantagesB.join(", ")}. `;
  }

  if (!advantagesA.length && !advantagesB.length) {
    summary += "Confronto totalmente equilibrado. ";
  }

  if (score.playerA > score.playerB) {
    summary += "No geral, o Jogador A apresenta superioridade.";
  } else if (score.playerB > score.playerA) {
    summary += "No geral, o Jogador B apresenta superioridade.";
  } else {
    summary += "No geral, o duelo é equilibrado.";
  }

  return summary.trim();
}
