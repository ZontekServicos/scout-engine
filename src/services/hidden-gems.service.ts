/**
 * hidden-gems.service.ts
 *
 * Identifica jogadores com alto overall, jovens e com valor de mercado
 * abaixo da média — "joias escondidas" do mercado.
 *
 * Critérios:
 *   • overall  >= 70
 *   • idade    <= 24
 *   • marketValue < média do grupo (eficiência de mercado)
 *
 * Endpoint: GET /players/hidden-gems
 */

import { prisma } from "../lib/prisma";
import type { PlayerSearchResult } from "../modules/player/player.search.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeValueScore(overall: number | null, marketValue: number | null): number | null {
  if (overall == null || marketValue == null || marketValue <= 0) return null;
  return Math.round((overall / (marketValue / 1_000_000)) * 10) / 10;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function findHiddenGems(limit = 20): Promise<PlayerSearchResult[]> {
  // Buscar candidatos: overall ≥ 70 + idade ≤ 24 + tem marketValue
  const candidates = await prisma.player.findMany({
    where: {
      overall:     { gte: 70 },
      age:         { lte: 24 },
      marketValue: { not: null, gt: 0 },
    },
    select: {
      id:          true,
      name:        true,
      team:        true,
      league:      true,
      nationality: true,
      age:         true,
      positions:   true,
      overall:     true,
      potential:   true,
      marketValue: true,
      imagePath:   true,
      dnaScore:    true,
    },
    orderBy: [
      { overall: "desc" },
      { name:    "asc" },
    ],
    // Buscar até 500 para ter uma amostra representativa para o avg
    take: 500,
  });

  if (candidates.length === 0) return [];

  // Calcular valor de mercado médio do grupo
  const totalValue = candidates.reduce((sum, p) => sum + (p.marketValue ?? 0), 0);
  const avgValue   = totalValue / candidates.length;

  // Filtrar abaixo da média + enricher com valueScore
  const gems: PlayerSearchResult[] = candidates
    .filter((p) => (p.marketValue ?? Infinity) < avgValue)
    .map((p) => ({
      id:          p.id,
      name:        p.name,
      team:        p.team,
      league:      p.league,
      nationality: p.nationality,
      age:         p.age,
      positions:   p.positions,
      overall:     p.overall,
      potential:   p.potential,
      marketValue: p.marketValue,
      imagePath:   p.imagePath,
      dnaScore:    (p.dnaScore as Record<string, unknown> | null) ?? null,
      valueScore:  computeValueScore(p.overall, p.marketValue),
    }));

  // Ordenar por valueScore desc (melhor custo-benefício primeiro)
  gems.sort((a, b) => (b.valueScore ?? -1) - (a.valueScore ?? -1));

  return gems.slice(0, limit);
}
