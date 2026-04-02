import type { Player, PlayerStats, Team } from "@prisma/client";
import { normalizeFromPlain } from "../analysis-engine/normalizers/stats.normalizer";
import type { NormalizedPlayerStats } from "../analysis-engine/types";

// ---------------------------------------------------------------------------
// dbPlayerToNormalized
//
// Converts a DB Player (with statsSnapshots) into NormalizedPlayerStats
// so the analysis-engine can work from cached DB data instead of re-calling
// the Sportmonks API.
//
// Strategy: use the most recent PlayerStats snapshot.
// ---------------------------------------------------------------------------

type PlayerWithStats = Player & {
  statsSnapshots: PlayerStats[];
  dbTeam: Team | null;
};

export function dbPlayerToNormalized(dbPlayer: PlayerWithStats): NormalizedPlayerStats {
  // Pick most recent snapshot
  const snapshot =
    dbPlayer.statsSnapshots.length > 0
      ? dbPlayer.statsSnapshots.sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
        )[0]
      : null;

  const position = dbPlayer.positions[0] ?? null;
  const teamName = dbPlayer.dbTeam?.name ?? dbPlayer.team ?? null;

  return normalizeFromPlain(
    {
      goals: snapshot?.goals ?? 0,
      assists: snapshot?.assists ?? 0,
      shots: snapshot?.shots ?? 0,
      shotsOnTarget: snapshot?.shotsOnTarget ?? 0,
      keyPasses: snapshot?.keyPasses ?? 0,
      passes: snapshot?.passes ?? 0,
      passAccuracy: snapshot?.passAccuracy ?? 70,
      xG: snapshot?.xG ?? 0,
      xA: snapshot?.xA ?? 0,
      tackles: snapshot?.tackles ?? 0,
      interceptions: snapshot?.interceptions ?? 0,
      pressures: snapshot?.pressures ?? 0,
      minutesPlayed: snapshot?.minutes ?? 0,
      appearances: snapshot?.appearances ?? 0,
      rating: snapshot?.rating ?? 6.5,
    },
    {
      playerId: dbPlayer.id,
      playerName: dbPlayer.name,
      teamId: dbPlayer.teamDbId ?? null,
      teamName,
      position,
      age: dbPlayer.age,
      season: snapshot?.season ?? "current",
    },
  );
}
