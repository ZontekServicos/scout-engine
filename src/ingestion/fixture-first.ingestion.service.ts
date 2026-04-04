/**
 * fixture-first.ingestion.service.ts
 *
 * Fixture-first ingestion pipeline — the only approach that works reliably
 * with Sportmonks v3 because filter support varies per endpoint:
 *
 *   /leagues              → no filters needed (fetch all)  ✓
 *   /fixtures?league_id   → works                          ✓
 *   /events?fixture_id    → works                          ✓
 *   /seasons?league_id    → 400 (filter unsupported)       ✗
 *   /teams?season_id      → 400 (filter unsupported)       ✗
 *   /players?team_id      → 400 (filter unsupported)       ✗
 *
 * Flow per league:
 *   fetchFixturesByLeague(leagueId)
 *     → upsert League (from fixture.league_id)
 *     → upsert Season  (from fixture.season_id — denormalized, no API call)
 *     → upsert Teams   (from fixture.participants)
 *     → upsert Match   (fixture metadata)
 *   fetchMatchEvents(fixtureId)
 *     → upsert MatchEvent (with x/y coordinates)
 */

import { prisma } from "../lib/prisma";
import {
  fetchFixturesByLeague,
  fetchMatchEvents,
  fetchLeagueById,
} from "../integrations/sportmonks/sportmonks.client";
import type {
  SportmonksFixture,
  SportmonksParticipant,
  SportmonksFixtureState,
  SportmonksEvent,
} from "../integrations/sportmonks/sportmonks.types";
import { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Helpers — fixture state → status string
// ---------------------------------------------------------------------------

/**
 * Normalise the `state` field which can be:
 *  - a string: "FT"
 *  - an object: { short_name: "FT" } | { developer_name: "finished" }
 *  - null / undefined
 */
function resolveStatus(state: SportmonksFixture["state"]): string | null {
  if (!state) return null;
  if (typeof state === "string") return state.toUpperCase();
  const s = state as SportmonksFixtureState;
  return (s.short_name ?? s.state ?? s.developer_name ?? null)?.toUpperCase() ?? null;
}

const FINISHED_STATUSES = new Set(["FT", "AET", "PEN", "FT_PEN", "FINISHED"]);

export function isFinished(fixture: SportmonksFixture): boolean {
  return FINISHED_STATUSES.has(resolveStatus(fixture.state) ?? "");
}

// ---------------------------------------------------------------------------
// Helpers — participants → home / away team IDs
// ---------------------------------------------------------------------------

function resolveParticipants(participants: SportmonksParticipant[] | null | undefined): {
  homeId: number | null;
  awayId: number | null;
  homeTeam: SportmonksParticipant | null;
  awayTeam: SportmonksParticipant | null;
} {
  const home = participants?.find((p) => p.meta?.location === "home") ?? null;
  const away = participants?.find((p) => p.meta?.location === "away") ?? null;
  return {
    homeId: home?.id ?? null,
    awayId: away?.id ?? null,
    homeTeam: home,
    awayTeam: away,
  };
}

// ---------------------------------------------------------------------------
// Helpers — scores → goals
// ---------------------------------------------------------------------------

function resolveScores(fixture: SportmonksFixture): { home: number | null; away: number | null } {
  let home: number | null = null;
  let away: number | null = null;

  for (const score of fixture.scores ?? []) {
    // type_id 1 = current / final score on most Sportmonks plans
    if (score.type_id === 1) {
      if (score.participant === "home") home = score.score?.goals ?? null;
      if (score.participant === "away") away = score.score?.goals ?? null;
    }
  }

  return { home, away };
}

// ---------------------------------------------------------------------------
// Upsert helpers
// ---------------------------------------------------------------------------

async function upsertLeagueFromFixture(fixture: SportmonksFixture, leagueExternalId: number) {
  // Try to get full league info; fall back to minimal record
  let name = `League #${leagueExternalId}`;
  let countryId: number | null = null;
  let type: string | null = null;
  let logoPath: string | null = null;

  try {
    const raw = await fetchLeagueById(leagueExternalId);
    name = raw.name;
    countryId = raw.country_id ?? null;
    type = raw.type ?? null;
    logoPath = raw.logo_path ?? raw.image_path ?? null;

    // Upsert country if present
    if (countryId) {
      await prisma.country.upsert({
        where: { externalId: countryId },
        update: { name: raw.country?.name ?? `Country #${countryId}` },
        create: {
          externalId: countryId,
          name: raw.country?.name ?? `Country #${countryId}`,
          iso2: raw.country?.iso2 ?? null,
          flagPath: raw.country?.image_path ?? null,
        },
      });
    }
  } catch {
    // Non-fatal — league details unavailable
  }

  const countryDbId = countryId
    ? (await prisma.country.findUnique({ where: { externalId: countryId }, select: { id: true } }))?.id ?? null
    : null;

  return prisma.league.upsert({
    where: { externalId: leagueExternalId },
    update: { name, countryId: countryDbId, type, logoPath },
    create: { externalId: leagueExternalId, name, countryId: countryDbId, type, logoPath },
  });
}

async function upsertSeasonFromFixture(fixture: SportmonksFixture, leagueDbId: string) {
  const seasonExternalId = fixture.season_id;
  if (!seasonExternalId) return null;

  return prisma.season.upsert({
    where: { externalId: seasonExternalId },
    update: { leagueId: leagueDbId },
    create: {
      externalId: seasonExternalId,
      name: `Season ${seasonExternalId}`,
      leagueId: leagueDbId,
    },
  });
}

async function upsertTeam(participant: SportmonksParticipant) {
  return prisma.team.upsert({
    where: { externalId: participant.id },
    update: { name: participant.name },
    create: { externalId: participant.id, name: participant.name },
  });
}

async function upsertMatch(
  fixture: SportmonksFixture,
  seasonDbId: string | null,
  homeTeamDbId: string | null,
  awayTeamDbId: string | null,
) {
  const status = resolveStatus(fixture.state);
  const { home: homeScore, away: awayScore } = resolveScores(fixture);

  return prisma.match.upsert({
    where: { externalId: fixture.id },
    update: {
      status,
      homeScore,
      awayScore,
      startingAt: fixture.starting_at ? new Date(fixture.starting_at) : null,
      homeTeamId: homeTeamDbId,
      awayTeamId: awayTeamDbId,
      seasonId: seasonDbId,
    },
    create: {
      externalId: fixture.id,
      status,
      homeScore,
      awayScore,
      startingAt: fixture.starting_at ? new Date(fixture.starting_at) : null,
      homeTeamId: homeTeamDbId,
      awayTeamId: awayTeamDbId,
      seasonId: seasonDbId,
    },
  });
}

// ---------------------------------------------------------------------------
// Event type mapping
// ---------------------------------------------------------------------------

const EVENT_TYPE_MAP: Record<string, string> = {
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

function mapEventType(developerName: string | null | undefined): string {
  return EVENT_TYPE_MAP[developerName?.toLowerCase() ?? ""] ?? "OTHER";
}

function mapOutcome(developerName: string | null | undefined, result: string | null | undefined): string | null {
  if (developerName === "shot-ongoal") return "ON_TARGET";
  if (developerName === "shot-offgoal") return "OFF_TARGET";
  if (developerName === "shot-blocked") return "BLOCKED";
  if (developerName === "goal" || developerName === "goal-allowed") return "SUCCESS";
  if (developerName === "penalty-missed") return "FAIL";
  return result?.toUpperCase() ?? null;
}

async function upsertMatchEvent(event: SportmonksEvent, matchDbId: string): Promise<void> {
  const developerName = event.type?.developer_name;
  const type = mapEventType(developerName);
  const outcome = mapOutcome(developerName, event.result);

  const [dbPlayer, dbTeam] = await Promise.all([
    event.player_id
      ? prisma.player.findFirst({
          where: { source: "sportmonks", externalId: String(event.player_id) },
          select: { id: true },
        })
      : null,
    event.participant_id
      ? prisma.team.findUnique({ where: { externalId: event.participant_id }, select: { id: true } })
      : null,
  ]);

  const { id, fixture_id, period_id, participant_id, player_id,
    type: _type, minute, extra_minute, coordinates, result,
    info, addition, ...rest } = event;

  const metaRaw: Record<string, unknown> = {};
  if (info) metaRaw["info"] = info;
  if (addition) metaRaw["addition"] = addition;
  if (Object.keys(rest).length > 0) metaRaw["raw"] = rest;

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
    ...(Object.keys(metaRaw).length > 0 ? { meta: metaRaw as Prisma.InputJsonValue } : {}),
  };

  if (event.id) {
    await prisma.matchEvent.upsert({
      where: { externalId: event.id },
      update: data,
      create: { ...data, externalId: event.id },
    });
  } else {
    await prisma.matchEvent.create({ data });
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FixtureFirstResult {
  leagueName: string;
  fixturesTotal: number;
  fixturesFinished: number;
  fixturesIngested: number;
  eventsTotal: number;
}

/**
 * Main entry point.
 * Fetches fixtures for a league, upserts all derived entities,
 * then ingests events for finished matches.
 */
export async function ingestLeagueViaFixtures(
  leagueExternalId: number,
  opts: {
    maxFinishedFixtures?: number; // cap for event ingestion (expensive)
    maxPages?: number;            // pagination cap for /fixtures
  } = {},
): Promise<FixtureFirstResult> {
  const maxFinished = opts.maxFinishedFixtures ?? 5;
  const maxPages = opts.maxPages ?? 4;

  // 1. Fetch fixtures
  const fixtures = await fetchFixturesByLeague(leagueExternalId, maxPages);

  // 2. Upsert league (one API call)
  const league = await upsertLeagueFromFixture(fixtures[0] ?? {} as SportmonksFixture, leagueExternalId);

  const result: FixtureFirstResult = {
    leagueName: league.name,
    fixturesTotal: fixtures.length,
    fixturesFinished: 0,
    fixturesIngested: 0,
    eventsTotal: 0,
  };

  // 3. Process all fixtures (upsert season + teams + match)
  for (const fixture of fixtures) {
    try {
      const season = await upsertSeasonFromFixture(fixture, league.id);
      const { homeTeam, awayTeam } = resolveParticipants(fixture.participants);

      const [homeDb, awayDb] = await Promise.all([
        homeTeam ? upsertTeam(homeTeam) : null,
        awayTeam ? upsertTeam(awayTeam) : null,
      ]);

      await upsertMatch(fixture, season?.id ?? null, homeDb?.id ?? null, awayDb?.id ?? null);
    } catch {
      // non-fatal — skip broken fixture
    }
  }

  // 4. Ingest events only for finished matches (most recent first, capped)
  const finished = fixtures
    .filter(isFinished)
    .sort((a, b) => {
      const at = a.starting_at ? new Date(a.starting_at).getTime() : 0;
      const bt = b.starting_at ? new Date(b.starting_at).getTime() : 0;
      return bt - at;
    })
    .slice(0, maxFinished);

  result.fixturesFinished = fixtures.filter(isFinished).length;
  result.fixturesIngested = finished.length;

  for (const fixture of finished) {
    try {
      const dbMatch = await prisma.match.findUnique({
        where: { externalId: fixture.id },
        select: { id: true },
      });
      if (!dbMatch) continue;

      const events = await fetchMatchEvents(fixture.id);

      for (const event of events) {
        try {
          await upsertMatchEvent(event, dbMatch.id);
          result.eventsTotal++;
        } catch {
          // non-fatal
        }
      }
    } catch {
      // non-fatal
    }
  }

  return result;
}
