// ==========================================
// 🧠 ATTRIBUTE ADAPTER
// ==========================================

export type NormalizedAttributes = {
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
};

function safeNumber(value: any): number {
  return typeof value === "number" ? value : 0;
}

export function normalizeAttributes(raw: any): NormalizedAttributes {
  return {
    // Se for estrutura simples
    pace: safeNumber(raw.pace ?? raw.physical?.acceleration),

    shooting: safeNumber(raw.shooting ?? raw.technical?.finishing),

    passing: safeNumber(raw.passing ?? raw.technical?.shortPassing),

    dribbling: safeNumber(raw.dribbling ?? raw.technical?.dribbling),

    defending: safeNumber(raw.defending ?? raw.defensive?.tackling),

    physical: safeNumber(raw.physical ?? raw.physical?.strength),
  };
}
