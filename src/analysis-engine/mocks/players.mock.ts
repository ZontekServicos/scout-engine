import { normalizeFromPlain } from "../normalizers/stats.normalizer";
import type { NormalizedPlayerStats } from "../types";

// ---------------------------------------------------------------------------
// Realistic mock players for development, testing, and offline demos.
// Stats are modelled after typical elite-level performance benchmarks.
// ---------------------------------------------------------------------------

export const MOCK_PLAYERS: NormalizedPlayerStats[] = [
  normalizeFromPlain(
    {
      goals: 27,
      assists: 9,
      shots: 112,
      shotsOnTarget: 58,
      keyPasses: 62,
      passes: 1240,
      passAccuracy: 84.2,
      xG: 22.4,
      xA: 7.8,
      tackles: 18,
      interceptions: 14,
      pressures: 210,
      minutesPlayed: 3060,
      appearances: 34,
      rating: 7.81,
    },
    {
      playerId: "mock-001",
      playerName: "Lucas Ferreira",
      teamId: "team-bra-01",
      teamName: "Flamengo",
      position: "Centre Forward",
      age: 24,
      season: "2024/25",
    },
  ),

  normalizeFromPlain(
    {
      goals: 19,
      assists: 16,
      shots: 80,
      shotsOnTarget: 36,
      keyPasses: 98,
      passes: 1820,
      passAccuracy: 88.5,
      xG: 17.1,
      xA: 12.3,
      tackles: 31,
      interceptions: 28,
      pressures: 340,
      minutesPlayed: 2970,
      appearances: 33,
      rating: 7.65,
    },
    {
      playerId: "mock-002",
      playerName: "Carlos Mendes",
      teamId: "team-bra-02",
      teamName: "Palmeiras",
      position: "Attacking Midfielder",
      age: 27,
      season: "2024/25",
    },
  ),

  normalizeFromPlain(
    {
      goals: 8,
      assists: 7,
      shots: 45,
      shotsOnTarget: 18,
      keyPasses: 72,
      passes: 2640,
      passAccuracy: 91.0,
      xG: 6.8,
      xA: 9.2,
      tackles: 68,
      interceptions: 54,
      pressures: 490,
      minutesPlayed: 3150,
      appearances: 35,
      rating: 7.42,
    },
    {
      playerId: "mock-003",
      playerName: "Rafael Oliveira",
      teamId: "team-bra-03",
      teamName: "São Paulo",
      position: "Central Midfielder",
      age: 29,
      season: "2024/25",
    },
  ),

  normalizeFromPlain(
    {
      goals: 2,
      assists: 4,
      shots: 18,
      shotsOnTarget: 6,
      keyPasses: 30,
      passes: 2100,
      passAccuracy: 87.5,
      xG: 1.9,
      xA: 3.4,
      tackles: 95,
      interceptions: 76,
      pressures: 380,
      minutesPlayed: 2880,
      appearances: 32,
      rating: 7.18,
    },
    {
      playerId: "mock-004",
      playerName: "Henrique Santos",
      teamId: "team-bra-04",
      teamName: "Grêmio",
      position: "Centre Back",
      age: 26,
      season: "2024/25",
    },
  ),

  normalizeFromPlain(
    {
      goals: 14,
      assists: 11,
      shots: 74,
      shotsOnTarget: 32,
      keyPasses: 85,
      passes: 1560,
      passAccuracy: 80.8,
      xG: 11.2,
      xA: 9.7,
      tackles: 44,
      interceptions: 36,
      pressures: 420,
      minutesPlayed: 2700,
      appearances: 30,
      rating: 7.55,
    },
    {
      playerId: "mock-005",
      playerName: "Mateus Costa",
      teamId: "team-bra-05",
      teamName: "Atlético Mineiro",
      position: "Winger",
      age: 22,
      season: "2024/25",
    },
  ),
];

/**
 * Find a mock player by ID.
 */
export function getMockPlayer(playerId: string): NormalizedPlayerStats | undefined {
  return MOCK_PLAYERS.find(p => p.playerId === playerId);
}

/**
 * Get all mock players for a given position (partial match, case-insensitive).
 */
export function getMockPlayersByPosition(position: string): NormalizedPlayerStats[] {
  return MOCK_PLAYERS.filter(p =>
    p.position?.toLowerCase().includes(position.toLowerCase()),
  );
}
