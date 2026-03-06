import { prisma } from "../lib/prisma";

export async function getMarketAlerts() {
  const players = await prisma.player.findMany({ take: 100 });

  const alerts: Array<{
    type: "GROWTH_SPIKE" | "VALUE_DROP" | "CONTRACT_EXPIRING";
    playerId: string;
    playerName: string;
    nomeJogador: string;
    description: string;
  }> = [];

  for (const player of players) {
    const attrs = player.attributes as any;
    const growth = Number(attrs?.growthIndex ?? 50);
    const valueTrend = Number(attrs?.valueTrend ?? 0);
    const contractMonths = Number(attrs?.contractMonthsRemaining ?? 18);

    if (growth >= 70) {
      alerts.push({
        type: "GROWTH_SPIKE",
        playerId: player.id,
        playerName: player.name,
        nomeJogador: player.name,
        description: "Jogador com crescimento acelerado nas últimas janelas.",
      });
    }

    if (valueTrend <= -12) {
      alerts.push({
        type: "VALUE_DROP",
        playerId: player.id,
        playerName: player.name,
        nomeJogador: player.name,
        description: "Queda relevante de valor de mercado detectada.",
      });
    }

    if (contractMonths <= 12) {
      alerts.push({
        type: "CONTRACT_EXPIRING",
        playerId: player.id,
        playerName: player.name,
        nomeJogador: player.name,
        description: "Contrato próximo do fim, potencial oportunidade de mercado.",
      });
    }
  }

  return alerts.slice(0, 50);
}

