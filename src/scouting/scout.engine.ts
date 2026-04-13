/**
 * scout.engine.ts
 *
 * Scouting automático de jogadores subvalorizados ("Hidden Gems").
 *
 * Critérios de elegibilidade:
 *   • overall >= 70
 *   • age    <= 24
 *   • marketValue abaixo da média do grupo elegível
 *
 * Ordenação: (overall / marketValue) DESC — melhor custo-benefício primeiro.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScoutPlayerInput {
  id:          string;
  name:        string;
  age:         number | null;
  overall:     number | null;
  potential:   number | null;
  marketValue: number | null;
  team:        string | null;
  league:      string | null;
  nationality: string | null;
  positions:   string[];
}

export interface HiddenGem {
  id:              string;
  name:            string;
  age:             number;
  overall:         number;
  potential:       number | null;
  marketValue:     number;
  team:            string | null;
  league:          string | null;
  nationality:     string | null;
  positions:       string[];
  /**
   * Índice de custo-benefício: overall / (marketValue / 1_000_000).
   * Quanto maior, mais subvalorizado o jogador é em relação à sua qualidade.
   */
  efficiencyIndex: number;
  /**
   * Percentual de desconto em relação à média de mercado do grupo.
   * Valor positivo = abaixo da média (subvalorizado).
   */
  discountVsAvg:   number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OVERALL_MIN  = 70;
const AGE_MAX      = 24;
const MIN_MARKET_VALUE = 1; // evitar divisão por zero (€1 mínimo)

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Filtra o grupo elegível:
 * - overall >= 70
 * - age <= 24
 * - marketValue > 0 (necessário para calcular eficiência)
 */
function filterEligible(players: ScoutPlayerInput[]) {
  return players.filter(
    (p) =>
      p.overall !== null &&
      p.overall >= OVERALL_MIN &&
      p.age !== null &&
      p.age <= AGE_MAX &&
      p.marketValue !== null &&
      p.marketValue > 0,
  ) as (ScoutPlayerInput & { overall: number; age: number; marketValue: number })[];
}

/**
 * Calcula o valor médio de mercado do grupo elegível.
 */
function calcAverageMarketValue(
  eligible: { marketValue: number }[],
): number {
  if (eligible.length === 0) return 0;
  const total = eligible.reduce((sum, p) => sum + p.marketValue, 0);
  return total / eligible.length;
}

/**
 * Índice de eficiência: overall / (marketValue em milhões).
 * Normalizado para que o valor seja facilmente comparável entre jogadores.
 */
function calcEfficiencyIndex(overall: number, marketValue: number): number {
  const valueInMillions = Math.max(marketValue / 1_000_000, MIN_MARKET_VALUE / 1_000_000);
  return Number((overall / valueInMillions).toFixed(4));
}

/**
 * Desconto percentual em relação à média de mercado.
 * Positivo = subvalorizado, Negativo = sobrevalorizado.
 */
function calcDiscountVsAvg(marketValue: number, avgMarketValue: number): number {
  if (avgMarketValue === 0) return 0;
  return Number((((avgMarketValue - marketValue) / avgMarketValue) * 100).toFixed(2));
}

/**
 * Encontra os "Hidden Gems": jogadores jovens, qualificados e subvalorizados.
 *
 * @param players  Lista de jogadores a analisar.
 * @param topN     Máximo de resultados. Default: 20.
 * @returns        Ranking de Hidden Gems, do melhor custo-benefício para o menor.
 */
export function findHiddenGems(
  players: ScoutPlayerInput[],
  topN = 20,
): HiddenGem[] {
  // 1. Filtrar elegíveis
  const eligible = filterEligible(players);

  // 2. Calcular média de mercado do grupo elegível
  const avgMarketValue = calcAverageMarketValue(eligible);

  // 3. Aplicar critério de subvalorização: abaixo da média do grupo
  const undervalued = eligible.filter((p) => p.marketValue < avgMarketValue);

  // 4. Calcular métricas e montar resultado
  const gems: HiddenGem[] = undervalued.map((p) => ({
    id:              p.id,
    name:            p.name,
    age:             p.age,
    overall:         p.overall,
    potential:       p.potential,
    marketValue:     p.marketValue,
    team:            p.team,
    league:          p.league,
    nationality:     p.nationality,
    positions:       p.positions,
    efficiencyIndex: calcEfficiencyIndex(p.overall, p.marketValue),
    discountVsAvg:   calcDiscountVsAvg(p.marketValue, avgMarketValue),
  }));

  // 5. Ordenar por melhor custo-benefício (efficiencyIndex DESC)
  gems.sort((a, b) => b.efficiencyIndex - a.efficiencyIndex);

  // 6. Retornar top N
  return gems.slice(0, Math.max(1, topN));
}
