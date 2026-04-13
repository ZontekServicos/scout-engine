/**
 * player.search.service.ts
 *
 * Serviço de busca avançada de jogadores com filtros dinâmicos.
 *
 * Endpoint:  GET /players/search
 * Ordenação: overall DESC → name ASC
 * Limite:    50 resultados por padrão (máx aceito: 100)
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlayerSearchParams {
  /**
   * Busca livre cross-field (nome, clube, liga) — OR.
   * Usado pelo SearchInput da UI.
   */
  search?: string;
  /** Filtro por nome exato do jogador (partial, case-insensitive). */
  name?: string;
  /** Filtro por clube (partial, case-insensitive). */
  team?: string;
  /** Posição (match exato no array, ex: "Centre Forward", "Left Wing"). */
  position?: string;
  ageMin?: number;
  ageMax?: number;
  overallMin?: number;
  overallMax?: number;
  potentialMin?: number;
  /** Valor de mercado máximo em EUR. */
  marketValueMax?: number;
  /** Liga (partial match, case-insensitive). */
  league?: string;
  /** Nacionalidade (partial match, case-insensitive). */
  nationality?: string;
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
  /** Objeto JSON com dimensões do DNA (tal como salvo no banco). */
  dnaScore:    Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 50;
const MAX_LIMIT     = 100;

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
    marketValueMax,
    league,
    nationality,
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

  // ── Precise field filters ─────────────────────────────────────────────────

  if (name?.trim()) {
    AND.push({ name: { contains: name.trim(), mode: "insensitive" } });
  }

  if (team?.trim()) {
    AND.push({ team: { contains: team.trim(), mode: "insensitive" } });
  }

  if (position?.trim()) {
    AND.push({ positions: { has: position.trim() } });
  }

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

  if (potentialMin !== undefined) {
    AND.push({ potential: { gte: potentialMin } });
  }

  if (marketValueMax !== undefined) {
    AND.push({ marketValue: { lte: marketValueMax } });
  }

  if (league?.trim()) {
    AND.push({ league: { contains: league.trim(), mode: "insensitive" } });
  }

  if (nationality?.trim()) {
    AND.push({ nationality: { contains: nationality.trim(), mode: "insensitive" } });
  }

  // ── Query ────────────────────────────────────────────────────────────────
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
    take: Math.min(Math.max(1, limit), MAX_LIMIT),
  });

  return rows.map((p) => ({
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
  }));
}
