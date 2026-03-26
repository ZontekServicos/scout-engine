export function buildPlayerReportPrompt(player: {
  name: string;
  position: string;
  age: number;
  club: string;
  league: string;
  overall: number;
  potential: number;
  tier: string;
  archetype?: string;
  riskLevel: string;
  riskScore: number;
  liquidityScore: number;
  capitalEfficiency: number;
  marketValue: number;
}): string {
  return `
Você é um analista sênior de scouting esportivo.
Gere um relatório individual objetivo e executivo em português
sobre o jogador abaixo. Sem elogios vagos. Tom profissional.

DADOS DO JOGADOR:
- Nome: ${player.name}
- Posição: ${player.position}
- Idade: ${player.age} anos
- Clube: ${player.club}
- Liga: ${player.league}
- Overall: ${player.overall}
- Potencial: ${player.potential}
- Tier: ${player.tier}
- Arquétipo: ${player.archetype || "Não classificado"}
- Risco composto: ${player.riskScore} (${player.riskLevel})
- Liquidez: ${player.liquidityScore}/10
- Capital Efficiency: ${player.capitalEfficiency}/10
- Valor de mercado: EUR ${player.marketValue}M

Estruture sua resposta em exatamente 4 parágrafos:
1. Perfil técnico e posicional
2. Perfil de risco e exposição financeira
3. Janela de oportunidade e timing de investimento
4. Recomendação executiva final

Responda apenas com os 4 parágrafos, sem títulos, sem bullets,
sem introdução. Direto ao ponto.
`.trim();
}
