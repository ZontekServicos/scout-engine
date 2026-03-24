interface PlayerReportPromptInput {
  name: string;
  position: string;
  age: number;
  club: string;
  league: string;
  overall: number;
  potential: number;
  tier: string;
  archetype: string;
  riskScore: number;
  riskLevel: string;
  liquidityScore: number;
  marketValue: number | null;
  growthProjection: {
    growthIndex: number;
    expectedOverallNextSeason: number;
    expectedPeak: number;
  };
  capitalEfficiency: number;
  financialRisk: number;
  riskSummary: string;
}

function formatCurrency(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "Nao informado";
  }

  if (value >= 1_000_000) {
    return `EUR ${(value / 1_000_000).toFixed(1)}M`;
  }

  if (value >= 1_000) {
    return `EUR ${(value / 1_000).toFixed(0)}K`;
  }

  return `EUR ${value.toFixed(0)}`;
}

export function buildPlayerReportPrompt(data: PlayerReportPromptInput): string {
  return [
    "Voce e um scout executivo de futebol produzindo um relatorio individual para uma diretoria profissional.",
    "Escreva em portugues do Brasil, com tom objetivo, executivo e sem elogios vagos.",
    "Retorne JSON valido com as chaves narrative e recommendation.",
    "A chave narrative deve conter 3 a 4 paragrafos corridos, separados por \\n\\n.",
    "A chave recommendation deve conter 1 paragrafo curto com a recomendacao executiva final.",
    "A narrativa precisa cobrir: perfil tecnico, perfil de risco, janela de oportunidade e recomendacao executiva.",
    "Nao invente dados e use apenas os numeros fornecidos abaixo.",
    "",
    `Nome: ${data.name}`,
    `Posicao: ${data.position}`,
    `Idade: ${data.age}`,
    `Clube: ${data.club}`,
    `Liga: ${data.league}`,
    `Overall: ${data.overall}`,
    `Potencial: ${data.potential}`,
    `Tier: ${data.tier}`,
    `Arquetipo: ${data.archetype}`,
    `Risco composto: ${data.riskScore.toFixed(1)} (${data.riskLevel})`,
    `Resumo de risco estrutural: ${data.riskSummary}`,
    `Risco financeiro: ${data.financialRisk.toFixed(1)}`,
    `Liquidez: ${data.liquidityScore.toFixed(1)}`,
    `Capital Efficiency: ${data.capitalEfficiency.toFixed(1)}`,
    `Valor de mercado: ${formatCurrency(data.marketValue)}`,
    `Growth Index: ${data.growthProjection.growthIndex}`,
    `Overall projetado na proxima temporada: ${data.growthProjection.expectedOverallNextSeason}`,
    `Pico projetado: ${data.growthProjection.expectedPeak}`,
  ].join("\n");
}
