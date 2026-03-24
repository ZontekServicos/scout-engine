import { getPlayerById } from "../integrations/esportsmonks.api";
import { buildFifaAttributes } from "./skill-tree.builder";

/* =========================
   TIPOS
========================= */
type Attributes = {
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
};

type ArchetypeResult = {
  archetype: string;
  confidence: number;
};

/* =========================
   ARQUÉTIPOS
========================= */
function pickArchetype(a: Attributes): ArchetypeResult {
  if (a.passing >= 75 && a.dribbling >= 72 && a.defending < 65) {
    return { archetype: "Playmaker", confidence: 0.85 };
  }

  if (a.pace >= 75 && a.physical >= 70 && a.defending >= 65) {
    return { archetype: "Box-to-box Midfielder", confidence: 0.82 };
  }

  if (a.shooting >= 75 && a.dribbling >= 70) {
    return { archetype: "Attacking Midfielder", confidence: 0.80 };
  }

  if (a.defending >= 75 && a.physical >= 72) {
    return { archetype: "Ball-winning Midfielder", confidence: 0.88 };
  }

  if (a.pace >= 78 && a.shooting >= 72) {
    return { archetype: "Mobile Forward", confidence: 0.78 };
  }

  return { archetype: "Balanced Player", confidence: 0.65 };
}

function classifyArchetype(attributes: Attributes): ArchetypeResult {
  return pickArchetype(attributes);
}

export function classifyPlayerArchetype(attributes: Attributes): ArchetypeResult {
  return classifyArchetype(attributes);
}

/* =========================
   ENGINE PRINCIPAL
========================= */
export async function runScout(playerId: string) {
  const player = await getPlayerById(playerId);

  // Stats mockadas (depois vêm da API real)
  const rawStats = {
    speed: 78,
    acceleration: 80,
    finishing: 65,
    shotPower: 68,
    shortPass: 74,
    longPass: 70,
    dribble: 76,
    ballControl: 72,
    tackle: 58,
    strength: 70,
    stamina: 68
  };

  const attributes = buildFifaAttributes(rawStats);

  const archetype = classifyArchetype(attributes);

  return {
    player,
    attributes,
    archetype
  };
}
export async function getScoutData(playerId: string) {
  const result = await runScout(playerId);
  return result;
}
