/**
 * fixture-first.ingestion.service.ts
 *
 * Three-layer ingestion pipeline (per Sportmonks best-practices docs):
 *
 *   Layer 1 — Bootstrap
 *     fetchAllFixturesBulk() — filters=populate, per_page=1000, no includes
 *     → Upserts Match records with minimal data (no teams/events yet)
 *     → Run once on first deploy or full re-sync
 *
 *   Layer 2 — Incremental
 *     fetchFixturesAfterById(lastId) — filters=populate;idAfter:X
 *     → Upserts only new Match records since last run
 *     → Run periodically (cron / seed re-runs)
 *
 *   Layer 3 — Enrich
 *     fetchFixturesByLeague() with participants;scores;state includes
 *     fetchMatchEvents() per finished fixture
 *     → Resolves League, Season, Teams, scores, and MatchEvent rows
 *     → Called only for fixtures that need enrichment (not yet fully processed)
 *
 * Backwards-compatible entry point:
 *   ingestLeagueViaFixtures() — used by seed-leagues.ts / seed-brazil-validated.ts
 *   Internally calls Layer 3 (enrich) on top of whatever is already in the DB.
 */

import { createHash } from "crypto";
import { prisma } from "../lib/prisma";
import { Prisma } from "@prisma/client";
import {
  fetchLeagueById,
  fetchMatchEvents,
  fetchAllFixturesBulk,
  fetchFixturesAfterById,
} from "../integrations/sportmonks/sportmonks.client";
import { fetchFixturesSmart } from "../integrations/sportmonks/sportmonks.strategy";
import {
  getLeagueCapabilities,
  type LeagueCapabilities,
  TIER_EMOJI,
} from "../integrations/sportmonks/league-capabilities";
import { isTransientError, errorLabel } from "../lib/errors";
import type {
  SportmonksFixture,
  SportmonksParticipant,
  SportmonksFixtureState,
  SportmonksEvent,
} from "../integrations/sportmonks/sportmonks.types";

// ---------------------------------------------------------------------------
// Shared helpers — fixture state resolution
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

function resolveParticipants(participants: SportmonksParticipant[] | null | undefined) {
  const home = participants?.find((p) => p.meta?.location === "home") ?? null;
  const away = participants?.find((p) => p.meta?.location === "away") ?? null;
  return { homeTeam: home, awayTeam: away };
}

function resolveScores(fixture: SportmonksFixture) {
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
// Shared helpers — DB upserts
// ---------------------------------------------------------------------------

async function upsertLeague(leagueExternalId: number) {
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
  } catch { /* non-fatal — continue with minimal data */ }

  const countryDbId = countryId
    ? (await prisma.country.findUnique({ where: { externalId: countryId }, select: { id: true } }))?.id ?? null
    : null;

  return prisma.league.upsert({
    where: { externalId: leagueExternalId },
    update: { name, countryId: countryDbId, type, logoPath },
    create: { externalId: leagueExternalId, name, countryId: countryDbId, type, logoPath },
  });
}

async function upsertSeason(fixture: SportmonksFixture, leagueDbId: string) {
  if (!fixture.season_id) return null;
  return prisma.season.upsert({
    where: { externalId: fixture.season_id },
    update: { leagueId: leagueDbId },
    create: { externalId: fixture.season_id, name: `Season ${fixture.season_id}`, leagueId: leagueDbId },
  });
}

async function upsertTeam(p: SportmonksParticipant) {
  return prisma.team.upsert({
    where: { externalId: p.id },
    update: { name: p.name },
    create: { externalId: p.id, name: p.name },
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
  const startingAt = fixture.starting_at ? new Date(fixture.starting_at) : null;

  return prisma.match.upsert({
    where: { externalId: fixture.id },
    update: { status, homeScore, awayScore, startingAt, homeTeamId: homeTeamDbId, awayTeamId: awayTeamDbId, seasonId: seasonDbId },
    create: { externalId: fixture.id, status, homeScore, awayScore, startingAt, homeTeamId: homeTeamDbId, awayTeamId: awayTeamDbId, seasonId: seasonDbId },
  });
}

// ---------------------------------------------------------------------------
// Event ingestion — batch insert (createMany + skipDuplicates)
// ---------------------------------------------------------------------------

const EVENT_TYPE_MAP: Record<string, string> = {
  "goal": "GOAL", "goal-allowed": "GOAL",
  "yellowcard": "YELLOW_CARD", "redcard": "RED_CARD", "yellowredcard": "RED_CARD",
  "substitution": "SUBSTITUTION",
  "penalty": "PENALTY", "penalty-missed": "PENALTY_MISSED",
  "shot-offgoal": "SHOT", "shot-ongoal": "SHOT", "shot-blocked": "SHOT",
  "pass": "PASS", "cross": "PASS",
  "tackle": "TACKLE", "interception": "INTERCEPTION",
  "clearance": "CLEARANCE", "save": "SAVE",
  "foul": "FOUL", "dribble": "DRIBBLE",
};

function mapEventType(dev: string | null | undefined): string {
  return EVENT_TYPE_MAP[dev?.toLowerCase() ?? ""] ?? "OTHER";
}

function mapOutcome(dev: string | null | undefined, result: string | null | undefined): string | null {
  if (dev === "shot-ongoal") return "ON_TARGET";
  if (dev === "shot-offgoal") return "OFF_TARGET";
  if (dev === "shot-blocked") return "BLOCKED";
  if (dev === "goal" || dev === "goal-allowed") return "SUCCESS";
  if (dev === "penalty-missed") return "FAIL";
  return result?.toUpperCase() ?? null;
}

/**
 * Generates a deterministic SHA-256 hash for events that have no Sportmonks externalId.
 * Used as `sourceHash` so createMany + skipDuplicates still works.
 *
 * Input fields: matchDbId, player_id, participant_id, developer_name, minute, extra_minute.
 * Returns first 32 hex chars (128 bits) — collision probability negligible for match events.
 */
function generateEventHash(event: SportmonksEvent, matchDbId: string): string {
  const key = [
    matchDbId,
    event.player_id ?? "",
    event.participant_id ?? "",
    event.type?.developer_name ?? "",
    event.minute ?? "",
    event.extra_minute ?? "",
  ].join("|");
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}

export interface BatchInsertResult {
  inserted: number;
  withCoords: number;
  skippedNoId: number;
}

async function batchInsertEvents(
  events: SportmonksEvent[],
  matchDbId: string,
): Promise<BatchInsertResult> {
  if (events.length === 0) return { inserted: 0, withCoords: 0, skippedNoId: 0 };

  // Split into identifiable (have Sportmonks ID) and hash-only (no ID)
  const identifiable = events.filter((e) => e.id != null);
  const hashOnly     = events.filter((e) => e.id == null);

  const allEvents = [...identifiable, ...hashOnly];

  // Resolve player/team DB IDs in 2 queries total
  const playerExtIds = [...new Set(allEvents.map((e) => e.player_id).filter((id): id is number => id != null))];
  const teamExtIds   = [...new Set(allEvents.map((e) => e.participant_id).filter((id): id is number => id != null))];

  const [players, teams] = await Promise.all([
    playerExtIds.length > 0
      ? prisma.player.findMany({ where: { source: "sportmonks", externalId: { in: playerExtIds.map(String) } }, select: { id: true, externalId: true } })
      : [],
    teamExtIds.length > 0
      ? prisma.team.findMany({ where: { externalId: { in: teamExtIds } }, select: { id: true, externalId: true } })
      : [],
  ]);

  const playerMap = new Map(players.map((p) => [Number(p.externalId), p.id]));
  const teamMap   = new Map(teams.map((t) => [t.externalId, t.id]));

  let withCoords = 0;

  const buildRow = (event: SportmonksEvent, hasExternalId: boolean) => {
    const dev = event.type?.developer_name;
    const { id, fixture_id, period_id, participant_id, player_id, type: _t,
      minute, extra_minute, coordinates, result, info, addition, ...rest } = event;

    const metaRaw: Record<string, unknown> = {};
    if (info)     metaRaw["info"] = info;
    if (addition) metaRaw["addition"] = addition;
    if (Object.keys(rest).length > 0) metaRaw["raw"] = rest;

    const x    = event.coordinates?.x     ?? null;
    const y    = event.coordinates?.y     ?? null;
    const endX = event.coordinates?.end_x ?? null;
    const endY = event.coordinates?.end_y ?? null;
    if (x != null || y != null) withCoords++;

    return {
      externalId:  hasExternalId ? (event.id ?? null) : null,
      sourceHash:  hasExternalId ? null : generateEventHash(event, matchDbId),
      matchId:     matchDbId,
      playerId:    event.player_id    != null ? (playerMap.get(event.player_id)    ?? null) : null,
      teamId:      event.participant_id != null ? (teamMap.get(event.participant_id) ?? null) : null,
      type:        mapEventType(dev),
      minute:      event.minute ?? null,
      extraMinute: event.extra_minute ?? null,
      x, y, endX, endY,
      outcome: mapOutcome(dev, event.result),
      ...(Object.keys(metaRaw).length > 0 ? { meta: metaRaw as Prisma.InputJsonValue } : {}),
    };
  };

  const rows = [
    ...identifiable.map((e) => buildRow(e, true)),
    ...hashOnly.map((e) => buildRow(e, false)),
  ];

  const r = await prisma.matchEvent.createMany({ data: rows, skipDuplicates: true });
  return { inserted: r.count, withCoords, skippedNoId: hashOnly.length };
}

// ---------------------------------------------------------------------------
// Layer 1 — Bootstrap: bulk sync, minimal data
// ---------------------------------------------------------------------------

export interface BootstrapResult {
  fixturesFetched: number;
  matchesUpserted: number;
  errors: number;
}

/**
 * Fetches all fixtures with filters=populate (no includes, 1000/page).
 * Upserts Match rows with only externalId, starting_at, season_id.
 * No teams, no scores, no events — use Layer 3 (enrich) for that.
 *
 * Run once on initial deploy, or when you need a full re-baseline.
 */
export async function bootstrapFixtures(maxPages = 10): Promise<BootstrapResult> {
  console.log("[ingest] Layer 1 — Bootstrap start");
  const fixtures = await fetchAllFixturesBulk(maxPages);
  console.log(`[ingest] Fetched ${fixtures.length} fixtures (bulk/populate)`);

  let upserted = 0;
  let errors = 0;

  for (const fixture of fixtures) {
    try {
      await prisma.match.upsert({
        where: { externalId: fixture.id },
        update: {
          status: resolveStatus(fixture.state),
          startingAt: fixture.starting_at ? new Date(fixture.starting_at) : null,
        },
        create: {
          externalId: fixture.id,
          status: resolveStatus(fixture.state),
          startingAt: fixture.starting_at ? new Date(fixture.starting_at) : null,
        },
      });
      upserted++;
    } catch { errors++; }
  }

  console.log(`[ingest] Bootstrap done — upserted=${upserted} errors=${errors}`);
  return { fixturesFetched: fixtures.length, matchesUpserted: upserted, errors };
}

// ---------------------------------------------------------------------------
// Layer 2 — Incremental: only new fixtures since last run
// ---------------------------------------------------------------------------

export interface IncrementalResult {
  fixturesFetched: number;
  matchesUpserted: number;
  lastIdSeen: number | null;
}

/**
 * Fetches only fixtures with id > lastKnownId (filters=populate;idAfter:X).
 * Upserts Match rows for the new records only.
 * After each run, store the new max fixture ID in IngestionCheckpoint for next call.
 */
export async function incrementalFixtureSync(
  lastKnownId: number,
  maxPages = 10,
): Promise<IncrementalResult> {
  console.log(`[ingest] Layer 2 — Incremental since id=${lastKnownId}`);
  const fixtures = await fetchFixturesAfterById(lastKnownId, maxPages);

  if (fixtures.length === 0) {
    console.log("[ingest] Incremental — no new fixtures");
    return { fixturesFetched: 0, matchesUpserted: 0, lastIdSeen: null };
  }

  let upserted = 0;
  let lastIdSeen = lastKnownId;

  for (const fixture of fixtures) {
    try {
      await prisma.match.upsert({
        where: { externalId: fixture.id },
        update: {
          status: resolveStatus(fixture.state),
          startingAt: fixture.starting_at ? new Date(fixture.starting_at) : null,
        },
        create: {
          externalId: fixture.id,
          status: resolveStatus(fixture.state),
          startingAt: fixture.starting_at ? new Date(fixture.starting_at) : null,
        },
      });
      upserted++;
      if (fixture.id > lastIdSeen) lastIdSeen = fixture.id;
    } catch { /* non-fatal */ }
  }

  console.log(`[ingest] Incremental done — fetched=${fixtures.length} upserted=${upserted} lastId=${lastIdSeen}`);
  return { fixturesFetched: fixtures.length, matchesUpserted: upserted, lastIdSeen };
}

// ---------------------------------------------------------------------------
// Layer 3 — Enrich: full entity resolution + events
// ---------------------------------------------------------------------------

export interface FixtureFirstResult {
  leagueName: string;
  fixturesTotal: number;
  fixturesNew: number;
  fixturesFinished: number;
  fixturesIngested: number;
  eventsTotal: number;
  eventsWithCoords: number;
  eventsSkipped: number;
  durationMs: number;
  /** Data tier detected for this league (1=Premium, 2=Standard, 3=Basic) */
  tier: 1 | 2 | 3;
  /** Whether event fetching was skipped due to known hasEvents=false profile */
  eventsSkippedByProfile: boolean;
}

export interface IngestLeagueOptions {
  maxFinishedFixtures?: number;
  maxPages?: number;
  /** Skip fixtures whose starting_at ≤ this date (date-based incremental). */
  sinceDate?: Date;
}

/**
 * Main enrichment entry point — backwards-compatible with seed-leagues.ts.
 *
 * Fetches fixtures for a league (with includes: participants, scores, state),
 * upserts League → Country → Season → Teams → Match, then batch-inserts
 * MatchEvents for finished matches.
 *
 * Internally uses fetchFixturesSmart() which auto-detects and caches the
 * best available API strategy.
 */
export async function ingestLeagueViaFixtures(
  leagueExternalId: number,
  opts: IngestLeagueOptions = {},
): Promise<FixtureFirstResult> {
  const startedAt   = Date.now();
  const maxFinished = opts.maxFinishedFixtures ?? 5;
  const maxPages    = opts.maxPages ?? 4;
  const sinceDate   = opts.sinceDate ?? null;

  // --- Load capability profile (DB cache → detect if missing) ---------------
  // null = detection failed entirely → assume full capabilities (backwards compat)
  const profile: LeagueCapabilities | null = await getLeagueCapabilities(leagueExternalId);
  const tier = (profile?.tier ?? 2) as 1 | 2 | 3;

  if (profile) {
    console.log(
      `[ingest] League ${leagueExternalId} profile: ${TIER_EMOJI[tier]} Tier ${tier}` +
      ` | hasEvents=${profile.hasEvents} | hasCoords=${profile.hasCoordinates}` +
      ` | source=${profile.source}`,
    );
  } else {
    console.warn(`[ingest] League ${leagueExternalId}: no capability profile, assuming Tier 2`);
  }

  // --- Fetch with smart strategy (probe + cache) ---
  const fixtures = await fetchFixturesSmart({ leagueId: leagueExternalId, maxPages });

  // --- Upsert league (one API call per league) ---
  const league = await upsertLeague(leagueExternalId);

  const result: FixtureFirstResult = {
    leagueName:             league.name,
    fixturesTotal:          fixtures.length,
    fixturesNew:            0,
    fixturesFinished:       0,
    fixturesIngested:       0,
    eventsTotal:            0,
    eventsWithCoords:       0,
    eventsSkipped:          0,
    durationMs:             0,
    tier,
    eventsSkippedByProfile: false,
  };

  // --- Date-based incremental filter ---
  const workset = sinceDate
    ? fixtures.filter((f) => !f.starting_at || new Date(f.starting_at) > sinceDate)
    : fixtures;

  result.fixturesNew = workset.length;

  // --- Upsert Season + Teams + Match for all fixtures in workset ---
  for (const fixture of workset) {
    try {
      const season = await upsertSeason(fixture, league.id);
      const { homeTeam, awayTeam } = resolveParticipants(fixture.participants);
      const [homeDb, awayDb] = await Promise.all([
        homeTeam ? upsertTeam(homeTeam) : null,
        awayTeam ? upsertTeam(awayTeam) : null,
      ]);
      await upsertMatch(fixture, season?.id ?? null, homeDb?.id ?? null, awayDb?.id ?? null);
    } catch (err) {
      if (isTransientError(err)) throw err; // transient = abort, let caller retry
      console.warn(`[ingest] Skipping fixture ${(fixture as SportmonksFixture).id}: ${errorLabel(err)}`);
    }
  }

  // --- Capability guard: skip /events entirely for Tier 3 leagues -----------
  // profile.hasEvents === false means we KNOW this league has no event data.
  // null profile = unknown = assume events exist (safe fallback to old behaviour).
  const shouldFetchEvents = profile === null || profile.hasEvents;

  if (!shouldFetchEvents) {
    console.log(
      `[ingest] 🔴 Skipping event fetch for league ${leagueExternalId}` +
      ` — hasEvents=false (Tier 3). Saves ${workset.filter(isFinished).length} API calls.`,
    );
    result.eventsSkippedByProfile = true;
    result.fixturesFinished = workset.filter(isFinished).length;
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  // --- Enrich finished matches with events (capped, most recent first) ---
  const finished = workset
    .filter(isFinished)
    .sort((a, b) => {
      const ta = a.starting_at ? new Date(a.starting_at).getTime() : 0;
      const tb = b.starting_at ? new Date(b.starting_at).getTime() : 0;
      return tb - ta;
    })
    .slice(0, maxFinished);

  result.fixturesFinished = workset.filter(isFinished).length;
  result.fixturesIngested = finished.length;

  for (const fixture of finished) {
    try {
      const dbMatch = await prisma.match.findUnique({
        where: { externalId: fixture.id },
        select: { id: true },
      });
      if (!dbMatch) continue;

      const events = await fetchMatchEvents(fixture.id);
      const batchResult = await batchInsertEvents(events, dbMatch.id);
      result.eventsTotal      += batchResult.inserted;
      result.eventsWithCoords += batchResult.withCoords;
      result.eventsSkipped    += batchResult.skippedNoId;
    } catch (err) {
      if (isTransientError(err)) throw err;
      console.warn(`[ingest] Event fetch failed for fixture ${(fixture as SportmonksFixture).id}: ${errorLabel(err)}`);
    }
  }

  result.durationMs = Date.now() - startedAt;
  return result;
}
