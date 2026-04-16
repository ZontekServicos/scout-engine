/**
 * player.search.service.ts
 *
 * Serviço de busca avançada de jogadores com filtros dinâmicos.
 *
 * Endpoint:  GET /players/search
 * Ordenação: overall DESC → name ASC  (padrão)
 * Limite:    50 resultados por padrão (máx aceito: 100)
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlayerSearchParams {
  /** Busca livre cross-field (nome, clube, liga) — OR. */
  search?: string;
  name?: string;
  team?: string;
  /** Posição (match exato no array, ex: "Centre Forward"). */
  position?: string;
  ageMin?: number;
  ageMax?: number;
  overallMin?: number;
  overallMax?: number;
  potentialMin?: number;
  marketValueMin?: number;
  marketValueMax?: number;
  /** Liga (partial match, case-insensitive). */
  league?: string;
  /** Nacionalidade (partial match, case-insensitive). */
  nationality?: string;
  /** Score DNA médio mínimo (0–100). Filtrado em memória após query. */
  dnaMin?: number;
  /** Ordenação do resultado. Padrão: "overall". */
  sortBy?: "overall" | "valueScore" | "potential" | "age";
  /** Máximo de resultados. Default 50, hard-cap 100. */
  limit?: number;
}

export interface PlayerSearchResult {
  id:          string;
  name:        string;
  team:        string | null;
  league:      string | null;
  nationality: string | null;
  age:         number | null;
  positions:   string[];
  overall:     number | null;
  potential:   number | null;
  marketValue: number | null;
  imagePath:   string | null;
  dnaScore:    Record<string, unknown> | null;
  /**
   * Eficiência de mercado: overall / (marketValue / 1_000_000).
   * Quanto maior, mais barato é o jogador em relação à sua qualidade.
   * Null quando marketValue é zero ou ausente.
   */
  valueScore:  number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 50;
const MAX_LIMIT     = 100;

function computeValueScore(overall: number | null, marketValue: number | null): number | null {
  if (overall == null || marketValue == null || marketValue <= 0) return null;
  return Math.round((overall / (marketValue / 1_000_000)) * 10) / 10;
}

function avgDna(dnaScore: Record<string, unknown> | null): number | null {
  if (!dnaScore) return null;
  const nums = Object.values(dnaScore).filter((v): v is number => typeof v === "number");
  if (!nums.length) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function searchPlayers(
  params: PlayerSearchParams,
): Promise<PlayerSearchResult[]> {
  const {
    search,
    name,
    team,
    position,
    ageMin,
    ageMax,
    overallMin,
    overallMax,
    potentialMin,
    marketValueMin,
    marketValueMax,
    league,
    nationality,
    dnaMin,
    sortBy = "overall",
    limit = DEFAULT_LIMIT,
  } = params;

  const AND: Prisma.PlayerWhereInput[] = [];

  // ── Free-text search: nome OR clube OR liga ──────────────────────────────
  if (search?.trim()) {
    const q = search.trim();
    AND.push({
      OR: [
        { name:   { contains: q, mode: "insensitive" } },
        { team:   { contains: q, mode: "insensitive" } },
        { league: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  // ── Field filters ─────────────────────────────────────────────────────────

  if (name?.trim())
    AND.push({ name: { contains: name.trim(), mode: "insensitive" } });

  if (team?.trim())
    AND.push({ team: { contains: team.trim(), mode: "insensitive" } });

  if (position?.trim())
    AND.push({ positions: { has: position.trim() } });

  if (ageMin !== undefined || ageMax !== undefined) {
    AND.push({
      age: {
        ...(ageMin !== undefined ? { gte: ageMin } : {}),
        ...(ageMax !== undefined ? { lte: ageMax } : {}),
      },
    });
  }

  if (overallMin !== undefined || overallMax !== undefined) {
    AND.push({
      overall: {
        ...(overallMin !== undefined ? { gte: overallMin } : {}),
        ...(overallMax !== undefined ? { lte: overallMax } : {}),
      },
    });
  }

  if (potentialMin !== undefined)
    AND.push({ potential: { gte: potentialMin } });

  if (marketValueMin !== undefined || marketValueMax !== undefined) {
    AND.push({
      marketValue: {
        ...(marketValueMin !== undefined ? { gte: marketValueMin } : {}),
        ...(marketValueMax !== undefined ? { lte: marketValueMax } : {}),
      },
    });
  }

  if (league?.trim())
    AND.push({ league: { contains: league.trim(), mode: "insensitive" } });

  if (nationality?.trim())
    AND.push({ nationality: { contains: nationality.trim(), mode: "insensitive" } });

  // ── Query ────────────────────────────────────────────────────────────────
  // Fetch a larger pool when sorting by valueScore so we can sort in-memory.
  // dnaMin also filters in-memory, so we grab an expanded set when needed.
  const fetchLimit = dnaMin !== undefined || sortBy === "valueScore"
    ? MAX_LIMIT
    : Math.min(Math.max(1, limit), MAX_LIMIT);

  const rows = await prisma.player.findMany({
    where: AND.length > 0 ? { AND } : {},
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
      { name:    "asc"  },
    ],
    take: fetchLimit,
  });

  // ── In-memory enrichment + post-filters ──────────────────────────────────
  let results: PlayerSearchResult[] = rows.map((p) => ({
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

  // DNA filter (in-memory — não existe coluna calculada no banco)
  if (dnaMin !== undefined) {
    results = results.filter((p) => {
      const avg = avgDna(p.dnaScore);
      return avg !== null && avg >= dnaMin;
    });
  }

  // ── Sort ─────────────────────────────────────────────────────────────────
  if (sortBy === "valueScore") {
    results.sort((a, b) => (b.valueScore ?? -1) - (a.valueScore ?? -1));
  } else if (sortBy === "potential") {
    results.sort((a, b) => (b.potential ?? -1) - (a.potential ?? -1));
  } else if (sortBy === "age") {
    results.sort((a, b) => (a.age ?? 99) - (b.age ?? 99));
  }
  // default "overall" already sorted by DB

  return results.slice(0, Math.min(Math.max(1, limit), MAX_LIMIT));
}
