import {
  comparePlayers as comparePlayersWithIntelligenceProfile,
  comparePlayersByName as comparePlayersByNameWithIntelligenceProfile,
} from "../services/playerComparison.service";

export async function compareByNames(nameA: string, nameB: string) {
  return comparePlayersByNameWithIntelligenceProfile(nameA, nameB);
}

export async function compareByIds(idA: string, idB: string) {
  return comparePlayersWithIntelligenceProfile(idA, idB);
}
