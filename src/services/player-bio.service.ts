/**
 * player-bio.service.ts
 *
 * Gera descrição automática do jogador baseada no DNA SoccerMind.
 *
 * Retorna:
 *   profile   — parágrafo descritivo (posição + tier + característica dominante)
 *   strengths — dimensões DNA acima de 68 (pontos fortes)
 *   weaknesses — dimensões DNA abaixo de 50 (pontos fracos)
 *
 * Endpoint: GET /player/:id/bio
 */

import { prisma } from "../lib/prisma";
import { resolvePositionGroup } from "../analytics/soccermind-overall.engine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlayerBio {
  profile:    string;
  strengths:  string[];
  weaknesses: string[];
  archetype:  string;
}

// ---------------------------------------------------------------------------
// DNA dimension metadata
// ---------------------------------------------------------------------------

interface DimMeta {
  label:    string;
  highDesc: string;
  lowDesc:  string;
}

const DNA_DIMS: Record<string, DimMeta> = {
  impact: {
    label:    "Impacto Ofensivo",
    highDesc: "referência ofensiva — consistente em gols e participações diretas",
    lowDesc:  "contribuição direta ao marcador abaixo do esperado para o perfil",
  },
  intelligence: {
    label:    "Inteligência Tática",
    highDesc: "leitura de jogo superior, visão de passe e criação de oportunidades acima da média",
    lowDesc:  "dificuldades na leitura do jogo e na organização das jogadas",
  },
  defensiveIQ: {
    label:    "QI Defensivo",
    highDesc: "pressão defensiva eficaz — disciplinado em duelos e recuperações de bola",
    lowDesc:  "fragilidade defensiva nos duelos e no posicionamento sem bola",
  },
  consistency: {
    label:    "Consistência",
    highDesc: "altíssima regularidade — presente e confiável na maioria das partidas",
    lowDesc:  "irregularidade na presença e desempenho ao longo da temporada",
  },
  potential: {
    label:    "Potencial",
    highDesc: "enorme margem de crescimento — projeção de carreira acima do patamar atual",
    lowDesc:  "próximo do teto de rendimento esperado para o perfil",
  },
};

// ---------------------------------------------------------------------------
// Position labels
// ---------------------------------------------------------------------------

const POS_LABEL: Record<string, string> = {
  GK:  "goleiro",
  DEF: "defensor",
  MID: "meio-campista",
  ATT: "atacante",
};

// ---------------------------------------------------------------------------
// Overall tier labels
// ---------------------------------------------------------------------------

function tierLabel(overall: number | null): string {
  const v = overall ?? 0;
  if (v >= 82) return "de elite";
  if (v >= 76) return "muito bom";
  if (v >= 68) return "sólido";
  if (v >= 58) return "mediano";
  return "em desenvolvimento";
}

// ---------------------------------------------------------------------------
// Archetype derivation
// ---------------------------------------------------------------------------

function deriveArchetype(
  dims: Record<string, number>,
  posGroup: string,
): string {
  const top = Object.entries(dims).sort((a, b) => b[1] - a[1])[0];
  if (!top) return "Perfil Equilibrado";

  const map: Record<string, Record<string, string>> = {
    ATT: {
      impact:       "Finalizador Clínico",
      intelligence: "Atacante de Movimentação",
      defensiveIQ:  "Centroavante de Pressão",
      consistency:  "Atacante Confiável",
      potential:    "Joia Ofensiva",
    },
    MID: {
      impact:       "Meia Box-to-Box",
      intelligence: "Maestro Criativo",
      defensiveIQ:  "Volante Destruidor",
      consistency:  "Meia Equilibrado",
      potential:    "Promessa do Meio",
    },
    DEF: {
      impact:       "Zagueiro Ofensivo",
      intelligence: "Defensor Saído de Bola",
      defensiveIQ:  "Defensor Disciplinado",
      consistency:  "Pilar Defensivo",
      potential:    "Promessa Defensiva",
    },
    GK: {
      impact:       "Goleiro Líder",
      intelligence: "Goleiro de Distribuição",
      defensiveIQ:  "Goleiro Reflexivo",
      consistency:  "Goleiro Seguro",
      potential:    "Jovem Goleiro",
    },
  };

  return map[posGroup]?.[top[0]] ?? "Perfil Equilibrado";
}

// ---------------------------------------------------------------------------
// Profile paragraph builder
// ---------------------------------------------------------------------------

function buildProfileParagraph(
  name:      string,
  positions: string[],
  age:       number | null,
  overall:   number | null,
  dims:      Record<string, number>,
  posGroup:  string,
): string {
  const pos      = POS_LABEL[posGroup] ?? "jogador";
  const tier     = tierLabel(overall);
  const topDims  = Object.entries(dims).sort((a, b) => b[1] - a[1]);
  const [topKey] = topDims[0] ?? [];
  const topMeta  = topKey ? DNA_DIMS[topKey] : null;

  const primaryPos  = positions[0] ?? pos;
  const ageStr      = age ? `, ${age} anos,` : "";

  let text = `${name}${ageStr} é um ${pos} ${tier}`;

  if (topMeta) {
    text += ` com ${topMeta.highDesc}`;
  }

  text += ".";

  // Add potential note if relevant
  const potVal = dims["potential"] ?? 0;
  if (potVal >= 75 && (overall ?? 0) < 80) {
    text += ` Com ${potVal} pontos em Potencial, ainda tem espaço significativo para evoluir.`;
  } else if (potVal < 45) {
    text += " O teto de desempenho parece estar próximo do nível atual.";
  }

  // Add second strongest trait if distinct from top
  if (topDims.length >= 2) {
    const [secondKey, secondVal] = topDims[1];
    if (secondKey !== topKey && secondVal >= 65) {
      const secondMeta = DNA_DIMS[secondKey];
      if (secondMeta) {
        text += ` Também se destaca pela ${secondMeta.label.toLowerCase()}.`;
      }
    }
  }

  return text;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function generatePlayerBio(playerId: string): Promise<PlayerBio> {
  const player = await prisma.player.findUnique({
    where:  { id: playerId },
    select: { name: true, age: true, positions: true, overall: true, dnaScore: true },
  });

  if (!player) throw new Error("Player not found");

  const posGroup = resolvePositionGroup(player.positions);
  const raw      = player.dnaScore as Record<string, unknown> | null;

  // Normalise dnaScore into numeric dims; fallback to 50 for any missing dim
  const KEYS = ["impact", "intelligence", "defensiveIQ", "consistency", "potential"] as const;
  const dims: Record<string, number> = {};
  for (const k of KEYS) {
    const v = raw?.[k];
    dims[k] = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 50;
  }

  const strengths: string[] = KEYS
    .filter((k) => dims[k] >= 68)
    .map((k) => `${DNA_DIMS[k].label} (${dims[k]}) — ${DNA_DIMS[k].highDesc}`);

  const weaknesses: string[] = KEYS
    .filter((k) => dims[k] < 50)
    .map((k) => `${DNA_DIMS[k].label} (${dims[k]}) — ${DNA_DIMS[k].lowDesc}`);

  const archetype = deriveArchetype(dims, posGroup);

  const profile = buildProfileParagraph(
    player.name,
    player.positions,
    player.age,
    player.overall,
    dims,
    posGroup,
  );

  return { profile, strengths, weaknesses, archetype };
}
