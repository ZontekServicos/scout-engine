import type { PlayerIntelligenceProfile } from "../../../domain/player-intelligence/types";
import { fetchPlayerWithStats, searchPlayerByName } from "../sportmonks.client";
import type { SportmonksPlayer } from "../sportmonks.types";
import { normalizeStats } from "./normalize-stats";
import { computeMetrics } from "./compute-metrics";
import { buildProfile } from "./build-profile";

// ---------------------------------------------------------------------------
// Pipeline result
// ---------------------------------------------------------------------------
export interface PipelineResult {
  profile: PlayerIntelligenceProfile;
  meta: {
    sportmonksId: number;
    statsCount: number;
    processedAt: string;
    dataConfidence: number;
  };
}

// ---------------------------------------------------------------------------
// Internal — shared pipeline execution
// ---------------------------------------------------------------------------
function deriveAge(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  ) age--;
  return age;
}

function estimateConfidence(statsCount: number, minutesPlayed: number, appearances: number): number {
  const statsCoverage = Math.min(1, statsCount / 20);
  const minutesCoverage = appearances > 0 ? Math.min(1, minutesPlayed / (appearances * 90)) : 0;
  const appCoverage = Math.min(1, appearances / 20);
  return Math.round((statsCoverage * 0.4 + minutesCoverage * 0.35 + appCoverage * 0.25) * 100) / 100;
}

function execute(raw: SportmonksPlayer): PipelineResult {
  const { player, stats } = raw;

  const normalized = normalizeStats(stats);
  const age = deriveAge(player.date_of_birth);
  const position = player.detailedPosition?.name ?? player.position?.name ?? null;

  const metrics = computeMetrics(normalized, { position, age });
  const profile = buildProfile(player, metrics);

  const confidence = estimateConfidence(stats.length, normalized.minutesPlayed, normalized.appearances);

  return {
    profile,
    meta: {
      sportmonksId: player.id,
      statsCount: stats.length,
      processedAt: new Date().toISOString(),
      dataConfidence: confidence,
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch player by Sportmonks numeric ID and build PlayerIntelligenceProfile.
 */
export async function runPipelineById(sportmonksId: number): Promise<PipelineResult> {
  const raw = await fetchPlayerWithStats(sportmonksId);
  return execute(raw);
}

/**
 * Search player by name, use the first match, and build PlayerIntelligenceProfile.
 * Throws if no match is found.
 */
export async function runPipelineByName(name: string): Promise<PipelineResult> {
  const results = await searchPlayerByName(name);
  if (results.length === 0) {
    throw new Error(`Sportmonks: no player found matching "${name}"`);
  }
  const raw = results[0];
  if (!raw) {
    throw new Error(`Sportmonks: invalid response for player "${name}"`);
  }
  return execute(raw);
}

/**
 * Build PlayerIntelligenceProfile directly from a pre-fetched SportmonksPlayer.
 * Use this when caching raw API responses or running batch jobs.
 */
export function runPipelineFromRaw(raw: SportmonksPlayer): PipelineResult {
  return execute(raw);
}

/**
 * Extract only the profile from a pipeline run by ID.
 */
export async function getProfileById(sportmonksId: number): Promise<PlayerIntelligenceProfile> {
  const result = await runPipelineById(sportmonksId);
  return result.profile;
}

/**
 * Extract only the profile from a pipeline run by name.
 */
export async function getProfileByName(name: string): Promise<PlayerIntelligenceProfile> {
  const result = await runPipelineByName(name);
  return result.profile;
}
