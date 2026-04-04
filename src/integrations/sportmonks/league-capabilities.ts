/**
 * league-capabilities.ts
 *
 * Detects and caches what data a Sportmonks league actually provides.
 * Stored in LeagueDataProfile (PostgreSQL via Prisma). TTL: 7 days.
 *
 * Tier model:
 *   Tier 1 — Premium  : fixtures + events + coordinates   (heatmap, shot map)
 *   Tier 2 — Standard : fixtures + events, no coordinates (event counts, goals)
 *   Tier 3 — Basic    : fixtures only                     (calendar, scores)
 *
 * Pipeline usage:
 *   const profile = await getLeagueCapabilities(leagueId);
 *   if (profile?.hasEvents) { await fetchMatchEvents(fixtureId); }
 *
 * Detection:
 *   1. fetchFixturesByLeague(leagueId, 1) → confirm fixtures exist
 *   2. Find a finished fixture → probe /events?filters=fixture_id:X
 *   3. Inspect coordinates on returned events
 *   4. Persist result → LeagueDataProfile
 */

import { prisma } from "../../lib/prisma";
import {
  fetchFixturesByLeague,
  fetchMatchEvents,
} from "./sportmonks.client";
import { isTransientError, errorLabel } from "../../lib/errors";
import type { SportmonksFixture, SportmonksEvent } from "./sportmonks.types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CapabilityTier = 1 | 2 | 3;

export interface LeagueCapabilities {
  leagueId:       number;
  hasFixtures:    boolean;
  hasEvents:      boolean;
  hasCoordinates: boolean;
  /** 1 = Premium (coords), 2 = Standard (events), 3 = Basic (fixtures only) */
  tier:           CapabilityTier;
  fixturesSample: number;
  eventsSample:   number;
  coordsSample:   number;
  checkedAt:      string;
  /** Where this data came from — "db" means a cached result was returned */
  source:         "db" | "detected";
}

export const TIER_LABEL: Record<CapabilityTier, string> = {
  1: "Tier 1 — Premium  (fixtures + events + coordinates)",
  2: "Tier 2 — Standard (fixtures + events, sem coordenadas)",
  3: "Tier 3 — Basic    (só fixtures)",
};

export const TIER_EMOJI: Record<CapabilityTier, string> = {
  1: "🟢",
  2: "🟡",
  3: "🔴",
};

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

const TTL_DAYS           = 7;
const MAX_PROBE_FIXTURES = 3;   // probe at most 3 finished fixtures for events
const FINISHED_STATUSES  = new Set(["FT", "AET", "PEN", "FT_PEN", "FINISHED"]);

function resolveStatus(state: SportmonksFixture["state"]): string {
  if (!state) return "";
  if (typeof state === "string") return state.toUpperCase();
  return (state.short_name ?? state.developer_name ?? state.state ?? "").toUpperCase();
}

function isFinished(f: SportmonksFixture): boolean {
  return FINISHED_STATUSES.has(resolveStatus(f.state));
}

function tierFromBooleans(
  hasFixtures: boolean,
  hasEvents: boolean,
  hasCoordinates: boolean,
): CapabilityTier {
  if (!hasFixtures) return 3;
  if (hasCoordinates) return 1;
  if (hasEvents) return 2;
  return 3;
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

function isStale(checkedAt: Date): boolean {
  const ttlMs = TTL_DAYS * 24 * 3_600_000;
  return Date.now() - checkedAt.getTime() > ttlMs;
}

async function dbRead(leagueId: number): Promise<LeagueCapabilities | null> {
  try {
    const row = await prisma.leagueDataProfile.findUnique({ where: { leagueId } });
    if (!row) return null;
    if (isStale(row.checkedAt)) return null;   // TTL expired → re-detect

    return {
      leagueId:       row.leagueId,
      hasFixtures:    row.hasFixtures,
      hasEvents:      row.hasEvents,
      hasCoordinates: row.hasCoordinates,
      tier:           row.tier as CapabilityTier,
      fixturesSample: row.fixturesSample,
      eventsSample:   row.eventsSample,
      coordsSample:   row.coordsSample,
      checkedAt:      row.checkedAt.toISOString(),
      source:         "db",
    };
  } catch {
    return null; // DB unavailable — treat as cache miss, force fresh detection
  }
}

async function dbWrite(caps: Omit<LeagueCapabilities, "source" | "checkedAt">): Promise<void> {
  try {
    await prisma.leagueDataProfile.upsert({
      where:  { leagueId: caps.leagueId },
      update: {
        hasFixtures:    caps.hasFixtures,
        hasEvents:      caps.hasEvents,
        hasCoordinates: caps.hasCoordinates,
        tier:           caps.tier,
        fixturesSample: caps.fixturesSample,
        eventsSample:   caps.eventsSample,
        coordsSample:   caps.coordsSample,
      },
      create: {
        leagueId:       caps.leagueId,
        hasFixtures:    caps.hasFixtures,
        hasEvents:      caps.hasEvents,
        hasCoordinates: caps.hasCoordinates,
        tier:           caps.tier,
        fixturesSample: caps.fixturesSample,
        eventsSample:   caps.eventsSample,
        coordsSample:   caps.coordsSample,
      },
    });
  } catch (err) {
    console.warn(`[capabilities] Failed to save profile for league ${caps.leagueId}: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Core detection
// ---------------------------------------------------------------------------

/**
 * Probes the Sportmonks API to determine what data a league provides.
 *
 * Makes at most 1 + MAX_PROBE_FIXTURES API calls:
 *   - 1 call: GET /fixtures?filters=league_id:X  (1 page)
 *   - 0-3 calls: GET /events?filters=fixture_id:Y  (first finished fixture found)
 *
 * Errors:
 *   - Transient (429/5xx) → re-thrown so caller can back off
 *   - Permanent (400/404) → treated as "no fixtures" (Tier 3)
 *   - DB write failure    → non-fatal, logged only
 */
export async function detectLeagueCapabilities(leagueId: number): Promise<LeagueCapabilities> {
  console.log(`[capabilities] Detecting league ${leagueId}…`);

  // ── Step 1: fixtures ──────────────────────────────────────────────────────
  let fixtures: SportmonksFixture[] = [];
  try {
    fixtures = await fetchFixturesByLeague(leagueId, 1);  // 1 page is enough to confirm
  } catch (err) {
    if (isTransientError(err)) throw err;
    // Permanent error (filter unsupported, league not found): Tier 3 with 0 fixtures
    console.warn(`[capabilities] Fixtures unavailable for league ${leagueId}: ${errorLabel(err)}`);
  }

  const hasFixtures = fixtures.length > 0;
  const fixturesSample = fixtures.length;

  if (!hasFixtures) {
    const caps = {
      leagueId, hasFixtures: false, hasEvents: false, hasCoordinates: false,
      tier: 3 as CapabilityTier, fixturesSample: 0, eventsSample: 0, coordsSample: 0,
    };
    await dbWrite(caps);
    console.log(`[capabilities] League ${leagueId} → Tier 3 (no fixtures)`);
    return { ...caps, checkedAt: new Date().toISOString(), source: "detected" };
  }

  // ── Step 2: events ────────────────────────────────────────────────────────
  const finished = fixtures.filter(isFinished);
  let hasEvents      = false;
  let hasCoordinates = false;
  let eventsSample   = 0;
  let coordsSample   = 0;
  let probeEvents: SportmonksEvent[] = [];

  // Try up to MAX_PROBE_FIXTURES finished fixtures — stop as soon as events found
  for (const fixture of finished.slice(0, MAX_PROBE_FIXTURES)) {
    try {
      const events = await fetchMatchEvents(fixture.id);
      if (events.length > 0) {
        hasEvents    = true;
        probeEvents  = events;
        eventsSample = events.length;
        break;
      }
    } catch (err) {
      if (isTransientError(err)) throw err;
      console.warn(`[capabilities] Events probe failed for fixture ${fixture.id}: ${errorLabel(err)}`);
    }
  }

  // ── Step 3: coordinates ───────────────────────────────────────────────────
  if (hasEvents) {
    coordsSample   = probeEvents.filter(
      (e) => e.coordinates?.x != null || e.coordinates?.y != null,
    ).length;
    hasCoordinates = coordsSample > 0;
  }

  // ── Compose and persist ───────────────────────────────────────────────────
  const tier = tierFromBooleans(hasFixtures, hasEvents, hasCoordinates);
  const caps = {
    leagueId, hasFixtures, hasEvents, hasCoordinates, tier,
    fixturesSample, eventsSample, coordsSample,
  };

  await dbWrite(caps);

  const emoji = TIER_EMOJI[tier];
  console.log(
    `[capabilities] League ${leagueId} → ${emoji} ${TIER_LABEL[tier]}` +
    ` (fixtures=${fixturesSample}, events=${eventsSample}, coords=${coordsSample}/${eventsSample})`,
  );

  return { ...caps, checkedAt: new Date().toISOString(), source: "detected" };
}

// ---------------------------------------------------------------------------
// Public API — read-through cache
// ---------------------------------------------------------------------------

/**
 * Returns the capability profile for a league.
 *
 * Hit:  returns cached DB row (avoids API call, TTL=7 days)
 * Miss: runs fresh detection and caches result
 *
 * Returns null only if both the DB and detection fail (DB down + network error).
 * In that case, callers should assume full capabilities (backwards-compatible).
 */
export async function getLeagueCapabilities(leagueId: number): Promise<LeagueCapabilities | null> {
  const cached = await dbRead(leagueId);
  if (cached) {
    console.log(`[capabilities] Cache hit for league ${leagueId} → ${TIER_EMOJI[cached.tier]} Tier ${cached.tier}`);
    return cached;
  }

  try {
    return await detectLeagueCapabilities(leagueId);
  } catch (err) {
    console.warn(`[capabilities] Detection failed for league ${leagueId}: ${errorLabel(err)}`);
    return null;
  }
}

/**
 * Returns a cached profile without triggering detection.
 * Useful for bulk reads (e.g., listing all leagues with their tiers).
 * Returns null if the league has never been profiled.
 */
export async function getCachedCapabilities(leagueId: number): Promise<LeagueCapabilities | null> {
  return dbRead(leagueId);
}

/**
 * Bulk read — returns all stored profiles sorted by tier asc, then leagueId.
 * Does NOT trigger detection for missing leagues.
 */
export async function getAllCachedProfiles(): Promise<LeagueCapabilities[]> {
  try {
    const rows = await prisma.leagueDataProfile.findMany({
      orderBy: [{ tier: "asc" }, { leagueId: "asc" }],
    });
    return rows.map((row) => ({
      leagueId:       row.leagueId,
      hasFixtures:    row.hasFixtures,
      hasEvents:      row.hasEvents,
      hasCoordinates: row.hasCoordinates,
      tier:           row.tier as CapabilityTier,
      fixturesSample: row.fixturesSample,
      eventsSample:   row.eventsSample,
      coordsSample:   row.coordsSample,
      checkedAt:      row.checkedAt.toISOString(),
      source:         "db" as const,
    }));
  } catch {
    return [];
  }
}

/**
 * Force re-detection regardless of TTL.
 * Use when plan is upgraded or league data policy changes.
 */
export async function refreshLeagueCapabilities(leagueId: number): Promise<LeagueCapabilities | null> {
  try {
    // Delete existing row so detectLeagueCapabilities writes a fresh one
    await prisma.leagueDataProfile.deleteMany({ where: { leagueId } });
  } catch { /* non-fatal */ }
  try {
    return await detectLeagueCapabilities(leagueId);
  } catch (err) {
    console.warn(`[capabilities] Refresh failed for league ${leagueId}: ${errorLabel(err)}`);
    return null;
  }
}
