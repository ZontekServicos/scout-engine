/**
 * player-season.service.ts
 *
 * Manages the PlayerSeason table — one row per (player, season).
 *
 * DESIGN
 * ──────────────────────────────────────────────────────────────────────────────
 *   • All writes go through upsertPlayerSeason() — idempotent, safe to re-run.
 *   • History is never deleted. Re-ingestion updates the existing row.
 *   • After upsert, Player.currentLeagueId is updated if this is the most
 *     recent season (isCurrent = true or explicit flag).
 *   • Player.teamDbId (currentTeamId) is updated in the same call when the
 *     season is marked current — keeps the denormalized fields in sync.
 *
 * USAGE (from ingestion / enrichment scripts)
 * ──────────────────────────────────────────────────────────────────────────────
 *   import { upsertPlayerSeason, setCurrentContext } from "./player-season.service";
 *
 *   // After ingesting a player for a season:
 *   await upsertPlayerSeason({
 *     playerId, seasonId, teamId, leagueId,
 *     teamName, leagueName, seasonLabel, seasonYear,
 *     leagueContext,
 *     overall, potential, dnaScore,
 *     goals, assists, minutes, appearances, rating, marketValue,
 *     source: "sportmonks",
 *     isCurrent: true,   // updates Player.currentLeagueId + teamDbId
 *   });
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

/** Extracts the starting year from "2024/2025" → 2024, or "2024" → 2024. */
function deriveYearFromLabel(label: string | null | undefined): number | null {
  if (!label) return null;
  const match = label.match(/(\d{4})/);
  return match ? Number(match[1]) : null;
}

// ─── Input type ───────────────────────────────────────────────────────────────

export interface PlayerSeasonInput {
  playerId:      string;
  seasonId:      string;

  teamId?:       string | null;
  leagueId?:     string | null;

  teamName?:     string | null;
  leagueName?:   string | null;
  seasonLabel?:  string | null;  // e.g. "2024/2025"
  seasonYear?:   number | null;  // e.g. 2024

  leagueContext?:string | null;

  overall?:      number | null;
  potential?:    number | null;
  dnaScore?:     Record<string, unknown> | null;

  goals?:        number | null;
  assists?:      number | null;
  minutes?:      number | null;
  appearances?:  number | null;
  rating?:       number | null;
  marketValue?:  number | null;

  source?:       string;

  /**
   * When true, also updates Player.currentLeagueId (and teamDbId if teamId is set).
   * Should be true for the current/most-recent season.
   */
  isCurrent?:    boolean;
}

// ─── Upsert ───────────────────────────────────────────────────────────────────

/**
 * Upsert a PlayerSeason row for a given (playerId, seasonId) pair.
 * Preserves history — never deletes existing rows.
 */
export async function upsertPlayerSeason(input: PlayerSeasonInput): Promise<void> {
  const {
    playerId, seasonId,
    teamId, leagueId,
    teamName, leagueName, seasonLabel, seasonYear,
    leagueContext,
    overall, potential, dnaScore,
    goals, assists, minutes, appearances, rating, marketValue,
    source = "sportmonks",
    isCurrent = false,
  } = input;

  // Always resolve seasonYear — fall back to label extraction if caller didn't provide it
  const resolvedYear = seasonYear ?? deriveYearFromLabel(seasonLabel) ?? null;

  const data = {
    teamId:        teamId   ?? null,
    leagueId:      leagueId ?? null,
    teamName:      teamName   ?? null,
    leagueName:    leagueName ?? null,
    seasonLabel:   seasonLabel ?? null,
    seasonYear:    resolvedYear,
    leagueContext: leagueContext ?? null,
    overall:       overall   ?? null,
    potential:     potential ?? null,
    dnaScore:      dnaScore ? (dnaScore as Prisma.InputJsonValue) : Prisma.JsonNull,
    goals:         goals       ?? null,
    assists:       assists     ?? null,
    minutes:       minutes     ?? null,
    appearances:   appearances ?? null,
    rating:        rating      ?? null,
    marketValue:   marketValue ?? null,
    source,
    calculatedAt:  new Date(),
  };

  await prisma.playerSeason.upsert({
    where:  { playerId_seasonId: { playerId, seasonId } },
    update: data,
    create: { playerId, seasonId, ...data },
  });

  // Update Player.currentLeagueId (and teamDbId) when this is the current season
  if (isCurrent) {
    await setCurrentContext(playerId, { teamId, leagueId });
  }
}

// ─── Set current context ──────────────────────────────────────────────────────

/**
 * Updates Player denormalized current-context pointers.
 * Called automatically by upsertPlayerSeason when isCurrent=true.
 * Can also be called directly during backfill / recalculation.
 */
export async function setCurrentContext(
  playerId: string,
  ctx: { teamId?: string | null; leagueId?: string | null },
): Promise<void> {
  const patch: Prisma.PlayerUncheckedUpdateInput = {};
  if (ctx.teamId   !== undefined) patch.teamDbId        = ctx.teamId   ?? null;
  if (ctx.leagueId !== undefined) patch.currentLeagueId = ctx.leagueId ?? null;

  if (Object.keys(patch).length > 0) {
    await prisma.player.update({ where: { id: playerId }, data: patch });
  }
}

// ─── Latest season for a player ──────────────────────────────────────────────

/**
 * Returns the PlayerSeason row with the highest seasonYear (or most recently
 * created if seasonYear is null) for a given player.
 * Used to derive the current team/league when isCurrent flag is unavailable.
 */
export async function getLatestPlayerSeason(playerId: string) {
  return prisma.playerSeason.findFirst({
    where: { playerId },
    orderBy: [
      { seasonYear: "desc" },
      { createdAt:  "desc" },
    ],
    include: { dbTeam: true, dbLeague: true, dbSeason: true },
  });
}

// ─── Season history for a player ─────────────────────────────────────────────

/**
 * Returns all PlayerSeason rows for a player, ordered chronologically.
 * Suitable for timeline/progression views.
 */
export async function getPlayerHistory(playerId: string) {
  return prisma.playerSeason.findMany({
    where: { playerId },
    orderBy: [
      { seasonYear: "asc" },
      { createdAt:  "asc" },
    ],
    include: { dbTeam: true, dbLeague: true, dbSeason: true },
  });
}
