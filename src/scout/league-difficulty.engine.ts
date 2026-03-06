const LEAGUE_DIFFICULTY_MAP: Record<string, number> = {
  "premier league": 100,
  "la liga": 90,
  "serie a": 85,
  bundesliga: 88,
  "ligue 1": 80,
  brasileirao: 78,
  "argentina primera": 72,
  mls: 70,
};

function normalizeLeagueName(league?: string): string {
  if (!league) return "";

  return league
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

export function getLeagueDifficultyCoefficient(league?: string): number {
  const normalized = normalizeLeagueName(league);
  return LEAGUE_DIFFICULTY_MAP[normalized] ?? 75;
}

