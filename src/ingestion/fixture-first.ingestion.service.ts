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
 * Performance:
 *   - League/Season/Team upserts: individual (few per call, need update on re-run)
 *   - Match upserts: individual (need score/status updates on re-run)
 *   - MatchEvent inserts: createMany + skipDuplicates (10–20× faster than per-row upsert)
 *     Events without externalId are skipped to avoid duplicate rows on re-runs.
 *
 * Incremental:
 *   Pass `sinceDate` to skip fixtures whose `starting_at` is on or before that date.
 *   seed-leagues.ts reads/writes IngestionCheckpoint per league automatically.
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
// Helpers — participants → home / away
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
// Helpers — scores
// ---------------------------------------------------------------------------

function resolveScores(fixture: SportmonksFixture): { home: number | null; away: number | null } {
  let home: number | null = null;
  let away: number | null = null;

  for (const score of fixture.scores ?? []) {
    if (score.type_id === 1) {
      if (score.participant === "home") home = score.score?.goals ?? null;
      if (score.participant === "away") away = score.score?.goals ?? null;
    }
  }

  return { home, away };
}

// ---------------------------------------------------------------------------
// Upsert helpers — League / Season / Team / Match
// ---------------------------------------------------------------------------

async function upsertLeagueFromFixture(leagueExternalId: number) {
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
    // Non-fatal — fall back to minimal record
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
    update: { status, homeScore, awayScore,
      startingAt: fixture.starting_at ? new Date(fixture.starting_at) : null,
      homeTeamId: homeTeamDbId, awayTeamId: awayTeamDbId, seasonId: seasonDbId },
    create: {
      externalId: fixture.id, status, homeScore, awayScore,
      startingAt: fixture.starting_at ? new Date(fixture.starting_at) : null,
      homeTeamId: homeTeamDbId, awayTeamId: awayTeamDbId, seasonId: seasonDbId,
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

// ---------------------------------------------------------------------------
// Batch event insert — createMany + skipDuplicates (10–20× faster)
// ---------------------------------------------------------------------------

/**
 * Resolves player/team DB IDs for all events in one pass (N queries → 2 queries).
 */
async function resolveEventActors(events: SportmonksEvent[]): Promise<{
  playerMap: Map<number, string>;
  teamMap: Map<number, string>;
}> {
  const playerExternalIds = [...new Set(
    events.map((e) => e.player_id).filter((id): id is number => id != null),
  )];
  const teamExternalIds = [...new Set(
    events.map((e) => e.participant_id).filter((id): id is number => id != null),
  )];

  const [players, teams] = await Promise.all([
    playerExternalIds.length > 0
      ? prisma.player.findMany({
          where: { source: "sportmonks", externalId: { in: playerExternalIds.map(String) } },
          select: { id: true, externalId: true },
        })
      : [],
    teamExternalIds.length > 0
      ? prisma.team.findMany({
          where: { externalId: { in: teamExternalIds } },
          select: { id: true, externalId: true },
        })
      : [],
  ]);

  return {
    playerMap: new Map(players.map((p) => [Number(p.externalId), p.id])),
    teamMap: new Map(teams.map((t) => [t.externalId, t.id])),
  };
}

/**
 * Inserts all events for a match in a single createMany call.
 * Only events with a Sportmonks externalId are inserted (prevents duplicates on re-runs).
 * Returns count of rows inserted.
 */
async function batchInsertMatchEvents(
  events: SportmonksEvent[],
  matchDbId: string,
): Promise<number> {
  // Only process events that have an externalId (unique constraint → skipDuplicates works)
  const identifiable = events.filter((e) => e.id != null);
  if (identifiable.length === 0) return 0;

  const { playerMap, teamMap } = await resolveEventActors(identifiable);

  const rows = identifiable.map((event) => {
    const developerName = event.type?.developer_name;
    const type = mapEventType(developerName);
    const outcome = mapOutcome(developerName, event.result);

    // Build meta from leftover fields
    const { id, fixture_id, period_id, participant_id, player_id, type: _type,
      minute, extra_minute, coordinates, result, info, addition, ...rest } = event;

    const metaRaw: Record<string, unknown> = {};
    if (info) metaRaw["info"] = info;
    if (addition) metaRaw["addition"] = addition;
    if (Object.keys(rest).length > 0) metaRaw["raw"] = rest;

    return {
      externalId: event.id,
      matchId: matchDbId,
      playerId: event.player_id != null ? (playerMap.get(event.player_id) ?? null) : null,
      teamId: event.participant_id != null ? (teamMap.get(event.participant_id) ?? null) : null,
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
  });

  const result = await prisma.matchEvent.createMany({
    data: rows,
    skipDuplicates: true, // skips rows where externalId already exists
  });

  return result.count;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FixtureFirstResult {
  leagueName: string;
  fixturesTotal: number;
  fixturesNew: number;       // fixtures not seen before (sinceDate filter)
  fixturesFinished: number;
  fixturesIngested: number;  // finished fixtures with event ingestion attempted
  eventsTotal: number;
}

export interface IngestLeagueOptions {
  /** Cap on finished fixtures to ingest events for (each = 1 API call). */
  maxFinishedFixtures?: number;
  /** Pagination cap for /fixtures (pages × 25 = fixtures). */
  maxPages?: number;
  /**
   * Incremental mode: only process fixtures with starting_at > sinceDate.
   * Matches are still upserted to capture score updates, but event ingestion
   * is skipped for fixtures already processed before this date.
   */
  sinceDate?: Date;
}

/**
 * Main entry point.
 * Fetches fixtures for a league, upserts all derived entities,
 * then batch-inserts events for finished matches.
 */
export async function ingestLeagueViaFixtures(
  leagueExternalId: number,
  opts: IngestLeagueOptions = {},
): Promise<FixtureFirstResult> {
  const maxFinished = opts.maxFinishedFixtures ?? 5;
  const maxPages = opts.maxPages ?? 4;
  const sinceDate = opts.sinceDate ?? null;

  // 1. Fetch fixtures
  const fixtures = await fetchFixturesByLeague(leagueExternalId, maxPages);

  // 2. Upsert league
  const league = await upsertLeagueFromFixture(leagueExternalId);

  const result: FixtureFirstResult = {
    leagueName: league.name,
    fixturesTotal: fixtures.length,
    fixturesNew: 0,
    fixturesFinished: 0,
    fixturesIngested: 0,
    eventsTotal: 0,
  };

  // 3. Incremental filter — skip fixtures we've already fully processed
  const newFixtures = sinceDate
    ? fixtures.filter((f) => {
        if (!f.starting_at) return true; // unknown date → always process
        return new Date(f.starting_at) > sinceDate;
      })
    : fixtures;

  result.fixturesNew = newFixtures.length;

  // 4. Upsert season + teams + match for ALL new fixtures
  for (const fixture of newFixtures) {
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

  // 5. Batch-insert events for finished matches (most recent first, capped)
  const finished = newFixtures
    .filter(isFinished)
    .sort((a, b) => {
      const at = a.starting_at ? new Date(a.starting_at).getTime() : 0;
      const bt = b.starting_at ? new Date(b.starting_at).getTime() : 0;
      return bt - at;
    })
    .slice(0, maxFinished);

  result.fixturesFinished = newFixtures.filter(isFinished).length;
  result.fixturesIngested = finished.length;

  for (const fixture of finished) {
    try {
      const dbMatch = await prisma.match.findUnique({
        where: { externalId: fixture.id },
        select: { id: true },
      });
      if (!dbMatch) continue;

      const events = await fetchMatchEvents(fixture.id);
      const inserted = await batchInsertMatchEvents(events, dbMatch.id);
      result.eventsTotal += inserted;
    } catch {
      // non-fatal
    }
  }

  return result;
}
