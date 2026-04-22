/**
 * player.filter.service.ts
 *
 * Hierarchical + faceted player search.
 *
 * Hierarchy filters:   countryId → leagueId → seasonId → teamId → playerId
 * Faceted filters:     position, age range, rating range, minutes range,
 *                      marketValue range, nationality, source
 *
 * All filters are optional and composable.
 * Returns paginated results with facet counts for the frontend.
 */

import { prisma } from "../lib/prisma";
import type { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface PlayerFilterInput {
  // Hierarchy
  countryId?: string;       // DB uuid of Country
  leagueId?: string;        // DB uuid of League
  seasonId?: string;        // DB uuid of Season
  teamId?: string;          // DB uuid of Team

  // Facets
  positions?: string[];     // e.g. ["Midfielder", "Attacking Midfielder"]
  nationality?: string;
  ageMin?: number;
  ageMax?: number;
  ratingMin?: number;       // filters on latest PlayerStats.rating
  ratingMax?: number;
  minutesMin?: number;      // filters on latest PlayerStats.minutes
  marketValueMin?: number;
  marketValueMax?: number;
  source?: string;          // "sportmonks" | "manual"

  // Pagination
  page?: number;
  pageSize?: number;

  // Sorting
  sortBy?: "overall" | "rating" | "age" | "marketValue" | "name";
  sortDir?: "asc" | "desc";
}

export interface PlayerFilterResult {
  players: PlayerSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PlayerSummary {
  id: string;
  slug: string;
  name: string;
  positions: string[];
  age: number;
  nationality: string;
  team: string | null;
  league: string | null;
  overall: number | null;
  marketValue: number | null;
  imagePath: string | null;
  latestRating: number | null;
  latestMinutes: number | null;
  latestSeason: string | null;
}

// ---------------------------------------------------------------------------
// Main filter function
// ---------------------------------------------------------------------------

export async function filterPlayers(input: PlayerFilterInput): Promise<PlayerFilterResult> {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  const skip = (page - 1) * pageSize;

  // Build the Prisma where clause
  const where = await buildWhere(input);

  // Build orderBy
  const orderBy = buildOrderBy(input);

  const [players, total] = await Promise.all([
    prisma.player.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
      include: {
        statsSnapshots: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        dbTeam: {
          select: { id: true, name: true },
        },
        playerSeasons: {
          orderBy: [{ seasonYear: "desc" }],
          take: 1,
          select: { overall: true },
        },
      },
    }),
    prisma.player.count({ where }),
  ]);

  const mapped = players.map((p) => {
    const latest = p.statsSnapshots[0] ?? null;
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      positions: p.positions,
      age: p.age,
      nationality: p.nationality,
      team: p.team,
      league: p.league,
      overall: p.playerSeasons[0]?.overall ?? p.overall,
      marketValue: p.marketValue,
      imagePath: p.imagePath,
      latestRating: latest?.rating ?? null,
      latestMinutes: latest?.minutes ?? null,
      latestSeason: latest?.season ?? null,
    };
  });

  // Re-sort by overall desc when sorting by overall/default — the DB orderBy uses the stale
  // Player.overall column because Prisma can't order by nested relation fields.
  if (!input.sortBy || input.sortBy === "overall" || input.sortBy === "rating") {
    const dir = input.sortDir ?? "desc";
    mapped.sort((a, b) =>
      dir === "asc"
        ? (a.overall ?? 0) - (b.overall ?? 0)
        : (b.overall ?? 0) - (a.overall ?? 0),
    );
  }

  return {
    players: mapped,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ---------------------------------------------------------------------------
// WHERE builder
// ---------------------------------------------------------------------------

async function buildWhere(input: PlayerFilterInput): Promise<Prisma.PlayerWhereInput> {
  const where: Prisma.PlayerWhereInput = {};

  // ---- Source ----
  if (input.source) {
    where.source = input.source;
  }

  // ---- Nationality ----
  if (input.nationality) {
    where.nationality = { contains: input.nationality, mode: "insensitive" };
  }

  // ---- Positions (any match) ----
  if (input.positions && input.positions.length > 0) {
    where.positions = { hasSome: input.positions };
  }

  // ---- Age ----
  if (input.ageMin !== undefined || input.ageMax !== undefined) {
    where.age = {};
    if (input.ageMin !== undefined) where.age.gte = input.ageMin;
    if (input.ageMax !== undefined) where.age.lte = input.ageMax;
  }

  // ---- Market value ----
  if (input.marketValueMin !== undefined || input.marketValueMax !== undefined) {
    where.marketValue = {};
    if (input.marketValueMin !== undefined) where.marketValue.gte = input.marketValueMin;
    if (input.marketValueMax !== undefined) where.marketValue.lte = input.marketValueMax;
  }

  // ---- Hierarchy: Country → League → Season → Team ----
  // Strategy: resolve the team IDs that satisfy the hierarchy, then filter by teamDbId

  const teamIds = await resolveTeamIds(input);
  if (teamIds !== null) {
    // null means "no hierarchy filter" — undefined means "no teams found" (return empty)
    if (teamIds.length === 0) {
      // No teams match this hierarchy — force empty result
      where.id = "__no_match__";
    } else {
      where.teamDbId = { in: teamIds };
    }
  }

  // ---- Stats-based filters (rating, minutes) — via statsSnapshots ----
  if (input.ratingMin !== undefined || input.ratingMax !== undefined ||
      input.minutesMin !== undefined) {
    const statsConditions: Prisma.PlayerStatsWhereInput = {};
    if (input.ratingMin !== undefined) statsConditions.rating = { gte: input.ratingMin };
    if (input.ratingMax !== undefined) {
      statsConditions.rating = { ...(statsConditions.rating as object ?? {}), lte: input.ratingMax };
    }
    if (input.minutesMin !== undefined) statsConditions.minutes = { gte: input.minutesMin };

    where.statsSnapshots = { some: statsConditions };
  }

  return where;
}

/**
 * Resolves which Team DB IDs satisfy the country/league/season/team hierarchy.
 * Returns null if no hierarchy filter is set.
 * Returns string[] (possibly empty) if a hierarchy filter is set.
 */
async function resolveTeamIds(input: PlayerFilterInput): Promise<string[] | null> {
  // Direct team filter — highest priority
  if (input.teamId) {
    return [input.teamId];
  }

  // Season filter → get all team IDs in that season
  if (input.seasonId) {
    const season = await prisma.season.findUnique({
      where: { id: input.seasonId },
      include: { teams: { select: { id: true } } },
    });
    return season?.teams.map((t) => t.id) ?? [];
  }

  // League filter → collect teams across all seasons in that league
  if (input.leagueId) {
    const seasons = await prisma.season.findMany({
      where: { leagueId: input.leagueId },
      include: { teams: { select: { id: true } } },
    });
    const ids = new Set(seasons.flatMap((s) => s.teams.map((t) => t.id)));
    return [...ids];
  }

  // Country filter → collect teams across all leagues/seasons in that country
  if (input.countryId) {
    const leagues = await prisma.league.findMany({
      where: { countryId: input.countryId },
      select: { id: true },
    });
    const leagueIds = leagues.map((l) => l.id);
    const seasons = await prisma.season.findMany({
      where: { leagueId: { in: leagueIds } },
      include: { teams: { select: { id: true } } },
    });
    const ids = new Set(seasons.flatMap((s) => s.teams.map((t) => t.id)));
    return [...ids];
  }

  return null; // no hierarchy filter
}

// ---------------------------------------------------------------------------
// ORDER BY builder
// ---------------------------------------------------------------------------

function buildOrderBy(input: PlayerFilterInput): Prisma.PlayerOrderByWithRelationInput[] {
  const dir = input.sortDir ?? "desc";

  switch (input.sortBy) {
    case "age":
      return [{ age: dir }];
    case "marketValue":
      return [{ marketValue: dir }];
    case "name":
      return [{ nameNormalized: dir === "asc" ? "asc" : "desc" }];
    case "rating":
    case "overall":
    default:
      return [{ overall: { sort: dir, nulls: "last" } }];
  }
}

// ---------------------------------------------------------------------------
// Facet counts — for filter UI (dropdowns + count badges)
// ---------------------------------------------------------------------------

export interface PlayerFacets {
  countries: FacetItem[];
  leagues: FacetItem[];
  seasons: FacetItem[];
  teams: FacetItem[];
  positions: FacetItem[];
  nationalities: FacetItem[];
}

export interface FacetItem {
  id: string;
  label: string;
  count: number;
}

/**
 * Returns facet counts for the filter UI.
 * Filters by the same input so counts reflect the current selection.
 */
export async function getPlayerFacets(input: Omit<PlayerFilterInput, "page" | "pageSize" | "sortBy" | "sortDir">): Promise<PlayerFacets> {
  const [countries, leagues, seasons, teams, nationalities] = await Promise.all([
    prisma.country.findMany({
      select: { id: true, name: true, _count: { select: { leagues: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.league.findMany({
      where: input.countryId ? { countryId: input.countryId } : undefined,
      select: { id: true, name: true, _count: { select: { seasons: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.season.findMany({
      where: input.leagueId ? { leagueId: input.leagueId } : undefined,
      select: { id: true, name: true, _count: { select: { teams: true } } },
      orderBy: [{ isCurrent: "desc" }, { year: "desc" }],
    }),
    prisma.team.findMany({
      where: input.seasonId
        ? { seasons: { some: { id: input.seasonId } } }
        : undefined,
      select: { id: true, name: true, _count: { select: { players: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.player.groupBy({
      by: ["nationality"],
      _count: { nationality: true },
      orderBy: { _count: { nationality: "desc" } },
      take: 50,
    }),
  ]);

  // Position facets — from player.positions array (GIN index)
  const positionRows = await prisma.$queryRaw<{ position: string; count: bigint }[]>`
    SELECT unnest(positions) AS position, COUNT(*) AS count
    FROM "Player"
    GROUP BY position
    ORDER BY count DESC
  `;

  return {
    countries: countries.map((c) => ({ id: c.id, label: c.name, count: c._count.leagues })),
    leagues: leagues.map((l) => ({ id: l.id, label: l.name, count: l._count.seasons })),
    seasons: seasons.map((s) => ({ id: s.id, label: s.name, count: s._count.teams })),
    teams: teams.map((t) => ({ id: t.id, label: t.name, count: t._count.players })),
    positions: positionRows.map((p) => ({ id: p.position, label: p.position, count: Number(p.count) })),
    nationalities: nationalities.map((n) => ({
      id: n.nationality,
      label: n.nationality,
      count: n._count.nationality,
    })),
  };
}
