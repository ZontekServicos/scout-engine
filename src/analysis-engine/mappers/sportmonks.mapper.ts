import type { SportmonksPlayer } from "../../integrations/sportmonks/sportmonks.types";
import { normalizeStats } from "../../integrations/sportmonks/pipeline/normalize-stats";
import { normalizeFromRaw } from "../normalizers/stats.normalizer";
import type { NormalizedPlayerStats } from "../types";

// ---------------------------------------------------------------------------
// Maps a full SportmonksPlayer (with stats) → NormalizedPlayerStats
// This is the canonical entry point for all Sportmonks data into the engine.
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

export function mapSportmonksToNormalized(
  raw: SportmonksPlayer,
  season?: string,
): NormalizedPlayerStats {
  const { player, stats } = raw;
  const rawStats = normalizeStats(stats);

  const position =
    player.detailedPosition?.name ?? player.position?.name ?? null;

  const teamName =
    player.team?.name ?? null;

  return normalizeFromRaw(rawStats, {
    playerId: String(player.id),
    playerName: player.display_name,
    teamId: player.team?.id != null ? String(player.team.id) : null,
    teamName,
    position,
    age: deriveAge(player.date_of_birth),
    season,
  });
}
