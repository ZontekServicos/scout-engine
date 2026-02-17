interface ScoutPromptInput {
  playerA: {
    id: string;
    name: string;
  };
  playerB: {
    id: string;
    name: string;
  };
  qualitative: any;
  quantitative: {
    scoreA: number;
    scoreB: number;
    difference: number;
    winner: string;
  };
}

export function buildScoutPrompt(data: ScoutPromptInput): string {
  return `
Você é um scout profissional de futebol.

Compare os jogadores abaixo de forma objetiva, técnica e imparcial.
Não invente dados. Utilize apenas as informações fornecidas.

Jogador A: ${data.playerA.name}
Jogador B: ${data.playerB.name}

Comparação qualitativa (atributo por atributo):
${JSON.stringify(data.qualitative, null, 2)}

Comparação quantitativa (score ponderado):
${JSON.stringify(data.quantitative, null, 2)}

Com base nos dados acima, escreva um relatório técnico curto 
(máximo 4 linhas), destacando:

- Pontos fortes do vencedor
- Diferença de impacto
- Contexto da superioridade

Se houver empate, explique o equilíbrio técnico.
`;
}
