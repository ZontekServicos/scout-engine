/**
 * match.ingestion.service.ts
 *
 * Ingest Sportmonks fixtures (matches) and their events.
 *
 * Event spatial data (x, y, endX, endY) supports:
 *   - Heatmap      → all event types, grouped by player/team
 *   - Shot map     → type = SHOT, with outcome (ON_TARGET / OFF_TARGET / BLOCKED / SAVED)
 *   - Pass map     → type = PASS, with start/end coordinates and outcome
 *   - Defensive map → type = TACKLE | INTERCEPTION | CLEARANCE | SAVE | FOUL
 */

import { prisma } from "../lib/prisma";
import { Prisma } from "@prisma/client";
import {
  fetchMatchesBySeason,
  fetchMatchById,
  fetchMatchEvents,
} from "../integrations/sportmonks/sportmonks.client";
import type { SportmonksFixture, SportmonksEvent } from "../integrations/sportmonks/sportmonks.types";

// ---------------------------------------------------------------------------
// Event type mapping — Sportmonks developer_name → internal type string
// ---------------------------------------------------------------------------

function mapEventType(developerName: string | null | undefined): string {
  const map: Record<string, string> = {
    "goal": "GOAL",
    "goal-allowed": "GOAL",
    "yellowcard": "YELLOW_CARD",
    "redcard": "RED_CARD",
    "yellowredcard": "RED_CARD",
    "substitution": "SUBSTITUTION",
    "penalty": "PENALTY",
    "penalty-missed": "PENALTY_MISSED",
    "shot-offgoal": "SHOT",
    "shot-ongoal": "SHOT",
    "shot-blocked": "SHOT",
    "pass": "PASS",
    "cross": "PASS",
    "tackle": "TACKLE",
    "interception": "INTERCEPTION",
    "clearance": "CLEARANCE",
    "save": "SAVE",
    "foul": "FOUL",
    "dribble": "DRIBBLE",
  };

  return map[developerName?.toLowerCase() ?? ""] ?? "OTHER";
}

function mapOutcome(developerName: string | null | undefined, result: string | null | undefined): string | null {
  if (developerName === "shot-ongoal") return "ON_TARGET";
  if (developerName === "shot-offgoal") return "OFF_TARGET";
  if (developerName === "shot-blocked") return "BLOCKED";
  if (developerName === "goal" || developerName === "goal-allowed") return "SUCCESS";
  if (developerName === "penalty-missed") return "FAIL";
  if (result) return result.toUpperCase();
  return null;
}

// ---------------------------------------------------------------------------
// Resolve home/away teams from fixture participants
// ---------------------------------------------------------------------------

function resolveTeams(fixture: SportmonksFixture): {
  homeExternalId: number | null;
  awayExternalId: number | null;
  homeScore: number | null;
  awayScore: number | null;
} {
  let homeExternalId: number | null = null;
  let awayExternalId: number | null = null;
  let homeScore: number | null = null;
  let awayScore: number | null = null;

  if (fixture.participants) {
    for (const p of fixture.participants) {
      if (p.meta?.location === "home") homeExternalId = p.id;
      if (p.meta?.location === "away") awayExternalId = p.id;
    }
  }

  // Try to resolve final score from scores array
  if (fixture.scores) {
    for (const score of fixture.scores) {
      // type_id 1 = current score in most Sportmonks plans
      if (score.type_id === 1) {
        if (score.participant === "home") homeScore = score.score?.goals ?? null;
        if (score.participant === "away") awayScore = score.score?.goals ?? null;
      }
    }
  }

  return { homeExternalId, awayExternalId, homeScore, awayScore };
}

// ---------------------------------------------------------------------------
// Ingest a single match (fixture) — no events
// ---------------------------------------------------------------------------

export async function ingestMatch(sportmonksFixtureId: number) {
  const fixture = await fetchMatchById(sportmonksFixtureId);
  return upsertMatch(fixture);
}

async function upsertMatch(fixture: SportmonksFixture) {
  const { homeExternalId, awayExternalId, homeScore, awayScore } = resolveTeams(fixture);

  // Resolve DB IDs for teams (they must already be ingested)
  const [homeTeam, awayTeam, season] = await Promise.all([
    homeExternalId
      ? prisma.team.findUnique({ where: { externalId: homeExternalId } })
      : null,
    awayExternalId
      ? prisma.team.findUnique({ where: { externalId: awayExternalId } })
      : null,
    fixture.season_id
      ? prisma.season.findUnique({ where: { externalId: fixture.season_id } })
      : null,
  ]);

  const status = fixture.state?.short_name ?? null;

  return prisma.match.upsert({
    where: { externalId: fixture.id },
    update: {
      homeTeamId: homeTeam?.id ?? null,
      awayTeamId: awayTeam?.id ?? null,
      homeScore,
      awayScore,
      startingAt: fixture.starting_at ? new Date(fixture.starting_at) : null,
      status,
      seasonId: season?.id ?? null,
    },
    create: {
      externalId: fixture.id,
      homeTeamId: homeTeam?.id ?? null,
      awayTeamId: awayTeam?.id ?? null,
      homeScore,
      awayScore,
      startingAt: fixture.starting_at ? new Date(fixture.starting_at) : null,
      status,
      seasonId: season?.id ?? null,
    },
  });
}

// ---------------------------------------------------------------------------
// Ingest all matches for a season
// ---------------------------------------------------------------------------

export async function ingestMatchesBySeason(sportmonksSeasonId: number) {
  const rawFixtures = await fetchMatchesBySeason(sportmonksSeasonId);
  const results = [];

  for (const fixture of rawFixtures) {
    const match = await upsertMatch(fixture);
    results.push(match);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Ingest events for a single match
// ---------------------------------------------------------------------------

export async function ingestMatchEvents(sportmonksFixtureId: number) {
  // Ensure match exists
  const dbMatch = await prisma.match.findUnique({
    where: { externalId: sportmonksFixtureId },
  });
  if (!dbMatch) {
    throw new Error(
      `Match ${sportmonksFixtureId} not found in DB. Run ingestMatch first.`,
    );
  }

  const rawEvents = await fetchMatchEvents(sportmonksFixtureId);
  const results = [];

  for (const event of rawEvents) {
    const dbEvent = await upsertMatchEvent(event, dbMatch.id);
    if (dbEvent) results.push(dbEvent);
  }

  return results;
}

async function upsertMatchEvent(event: SportmonksEvent, matchDbId: string) {
  const developerName = event.type?.developer_name;
  const type = mapEventType(developerName);
  const outcome = mapOutcome(developerName, event.result);

  // Resolve player and team from DB (by Sportmonks external IDs)
  const [dbPlayer, dbTeam] = await Promise.all([
    event.player_id
      ? prisma.player.findFirst({
          where: { source: "sportmonks", externalId: String(event.player_id) },
          select: { id: true },
        })
      : null,
    event.participant_id
      ? prisma.team.findUnique({
          where: { externalId: event.participant_id },
          select: { id: true },
        })
      : null,
  ]);

  // Build meta from leftover fields
  const { id, fixture_id, period_id, participant_id, player_id, type: _type,
    minute, extra_minute, coordinates, result, info, addition, ...rest } = event;

  const meta: Record<string, unknown> = {};
  if (info) meta["info"] = info;
  if (addition) meta["addition"] = addition;
  if (Object.keys(rest).length > 0) meta["raw"] = rest;

  const data = {
    matchId: matchDbId,
    playerId: dbPlayer?.id ?? null,
    teamId: dbTeam?.id ?? null,
    type,
    minute: event.minute ?? null,
    extraMinute: event.extra_minute ?? null,
    x: event.coordinates?.x ?? null,
    y: event.coordinates?.y ?? null,
    endX: event.coordinates?.end_x ?? null,
    endY: event.coordinates?.end_y ?? null,
    outcome,
    // Prisma InputJsonValue requires explicit cast from Record<string, unknown>
    ...(Object.keys(meta).length > 0 ? { meta: meta as Prisma.InputJsonValue } : {}),
  };

  // If event has a Sportmonks ID, upsert; otherwise just create
  if (event.id) {
    return prisma.matchEvent.upsert({
      where: { externalId: event.id },
      update: data,
      create: { ...data, externalId: event.id },
    });
  }

  return prisma.matchEvent.create({ data });
}

// ---------------------------------------------------------------------------
// Ingest match + events in one call
// ---------------------------------------------------------------------------

export async function ingestMatchFull(sportmonksFixtureId: number) {
  const match = await ingestMatch(sportmonksFixtureId);
  const events = await ingestMatchEvents(sportmonksFixtureId);

  return {
    matchId: match.id,
    externalId: match.externalId,
    status: match.status,
    eventsIngested: events.length,
  };
}
