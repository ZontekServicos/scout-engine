import fs from "fs";

type ScaleLabel = "BAIXO" | "MODERADO" | "ALTO" | "MUITO_ALTO";
type SeverityLabel = "LEVE" | "MODERADA" | "GRAVE" | "CRITICA";
type CareerHarmLabel = "NAO" | "PARCIAL" | "SIM";
type RecurrenceLabel = "BAIXO" | "MEDIO" | "ALTO" | "MUITO_ALTO";

export type InjuryEvent = {
  lesion?: string; // texto livre (ex: "ruptura lca")
  lesionId?: string; // id direto do dataset (ex: "acl_rupture")
  daysAgo?: number; // quantos dias atrás ocorreu
  recurrenceCount?: number; // nº de recorrências reportadas
  status?: "RECOVERED" | "ACTIVE";
};

type LesionDefinition = {
  id: string;
  name_pt: string;
  synonyms_pt?: string[];
  severity: SeverityLabel;
  recurrence_risk: RecurrenceLabel;
  career_harm: CareerHarmLabel;
  recovery_time_days?: { min: number; max: number };
  impact?: {
    performance_overall?: ScaleLabel;
    explosiveness?: ScaleLabel;
    acceleration?: ScaleLabel;
    endurance?: ScaleLabel;
    agility_cuts?: ScaleLabel;
  };
};

type LesionMap = {
  lesions: LesionDefinition[];
  lookup?: {
    synonym_index?: Record<string, string>;
  };
};

export type MedicalRiskResult = {
  medicalRisk: number; // 0..100
  confidenceScore: number; // 0..100
  matchedInjuries: number;
  unknownInjuries: number;
  breakdown: {
    severity: number;
    recurrence: number;
    availability: number;
    chronicity: number;
  };
};

const SEVERITY_SCORE: Record<SeverityLabel, number> = {
  LEVE: 5,
  MODERADA: 12,
  GRAVE: 22,
  CRITICA: 30,
};

const RECURRENCE_SCORE: Record<RecurrenceLabel, number> = {
  BAIXO: 3,
  MEDIO: 8,
  ALTO: 14,
  MUITO_ALTO: 20,
};

const IMPACT_SCORE: Record<ScaleLabel, number> = {
  BAIXO: 2,
  MODERADO: 6,
  ALTO: 12,
  MUITO_ALTO: 18,
};

const CAREER_HARM_SCORE: Record<CareerHarmLabel, number> = {
  NAO: 0,
  PARCIAL: 7,
  SIM: 14,
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

function buildLesionIndexes(lesionMap: LesionMap) {
  const byId = new Map<string, LesionDefinition>();
  const byText = new Map<string, string>();

  for (const lesion of lesionMap.lesions) {
    byId.set(lesion.id, lesion);
    byText.set(normalize(lesion.name_pt), lesion.id);

    for (const synonym of lesion.synonyms_pt ?? []) {
      byText.set(normalize(synonym), lesion.id);
    }
  }

  for (const [text, id] of Object.entries(lesionMap.lookup?.synonym_index ?? {})) {
    byText.set(normalize(text), id);
  }

  return { byId, byText };
}

function scoreImpact(lesion: LesionDefinition): number {
  const impact = lesion.impact;
  if (!impact) return 0;

  const channels = [
    impact.performance_overall,
    impact.explosiveness,
    impact.acceleration,
    impact.endurance,
    impact.agility_cuts,
  ].filter(Boolean) as ScaleLabel[];

  if (!channels.length) return 0;

  const avg = channels.reduce((acc, label) => acc + IMPACT_SCORE[label], 0) / channels.length;

  return avg;
}

function scoreAvailability(lesion: LesionDefinition, injury: InjuryEvent): number {
  const recoveryMax = lesion.recovery_time_days?.max ?? 0;

  let base = 0;
  if (recoveryMax >= 180) base = 14;
  else if (recoveryMax >= 90) base = 10;
  else if (recoveryMax >= 30) base = 6;
  else base = 2;

  if (injury.status === "ACTIVE") base += 10;

  const daysAgo = injury.daysAgo;
  if (typeof daysAgo === "number") {
    if (daysAgo <= 90) base *= 1.2;
    else if (daysAgo <= 180) base *= 1.0;
    else if (daysAgo <= 365) base *= 0.75;
    else base *= 0.5;
  }

  return base;
}

function scoreChronicity(lesion: LesionDefinition, injury: InjuryEvent): number {
  const recurrence = lesion.recurrence_risk;
  const recurrenceCount = injury.recurrenceCount ?? 0;

  const recurrenceBase = RECURRENCE_SCORE[recurrence];
  const extraRecurrence = Math.min(10, recurrenceCount * 2);

  return recurrenceBase + extraRecurrence + CAREER_HARM_SCORE[lesion.career_harm];
}

export function loadLesionMapFromPath(path?: string): LesionMap | null {
  if (!path) return null;

  try {
    const raw = fs.readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as LesionMap;

    if (!Array.isArray(parsed.lesions)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function extractInjuryEventsFromAttributes(attributes: any): InjuryEvent[] {
  const candidates = [
    attributes?.injuries,
    attributes?.medical?.injuries,
    attributes?.health?.injuries,
    attributes?.historicoLesoes,
  ];

  const firstArray = candidates.find((c) => Array.isArray(c));
  if (!Array.isArray(firstArray)) return [];

  return firstArray
    .map((entry: any): InjuryEvent => {
      const status: InjuryEvent["status"] = entry?.status === "ACTIVE" ? "ACTIVE" : "RECOVERED";

      return {
        lesion: typeof entry?.lesion === "string" ? entry.lesion : entry?.name,
        lesionId: typeof entry?.lesionId === "string" ? entry.lesionId : entry?.id,
        daysAgo:
          typeof entry?.daysAgo === "number"
            ? entry.daysAgo
            : typeof entry?.days_since === "number"
              ? entry.days_since
              : undefined,
        recurrenceCount:
          typeof entry?.recurrenceCount === "number"
            ? entry.recurrenceCount
            : typeof entry?.recurrences === "number"
              ? entry.recurrences
              : 0,
        status,
      };
    })
    .filter((i): i is InjuryEvent => Boolean(i.lesion || i.lesionId));
}

export function calculateMedicalRisk(params: {
  injuries: InjuryEvent[];
  lesionMap: LesionMap | null;
}): MedicalRiskResult {
  const { injuries, lesionMap } = params;

  if (!injuries.length || !lesionMap) {
    return {
      medicalRisk: 0,
      confidenceScore: 60,
      matchedInjuries: 0,
      unknownInjuries: injuries.length,
      breakdown: {
        severity: 0,
        recurrence: 0,
        availability: 0,
        chronicity: 0,
      },
    };
  }

  const { byId, byText } = buildLesionIndexes(lesionMap);

  let severityTotal = 0;
  let recurrenceTotal = 0;
  let availabilityTotal = 0;
  let chronicityTotal = 0;
  let matched = 0;
  let unknown = 0;

  for (const injury of injuries) {
    const directId = injury.lesionId;
    const resolvedId =
      directId && byId.has(directId)
        ? directId
        : injury.lesion
          ? byText.get(normalize(injury.lesion))
          : undefined;

    if (!resolvedId) {
      unknown += 1;
      continue;
    }

    const lesion = byId.get(resolvedId)!;
    matched += 1;

    const severity = SEVERITY_SCORE[lesion.severity] + scoreImpact(lesion);
    const recurrence = RECURRENCE_SCORE[lesion.recurrence_risk];
    const availability = scoreAvailability(lesion, injury);
    const chronicity = scoreChronicity(lesion, injury);

    severityTotal += severity;
    recurrenceTotal += recurrence;
    availabilityTotal += availability;
    chronicityTotal += chronicity;
  }

  if (!matched) {
    return {
      medicalRisk: 8,
      confidenceScore: 35,
      matchedInjuries: 0,
      unknownInjuries: unknown,
      breakdown: {
        severity: 0,
        recurrence: 0,
        availability: 0,
        chronicity: 0,
      },
    };
  }

  const avgSeverity = severityTotal / matched;
  const avgRecurrence = recurrenceTotal / matched;
  const avgAvailability = availabilityTotal / matched;
  const avgChronicity = chronicityTotal / matched;

  const loadPenalty = Math.min(18, Math.max(0, injuries.length - 1) * 3);
  const raw =
    avgSeverity * 1.1 +
    avgRecurrence * 0.8 +
    avgAvailability * 1.0 +
    avgChronicity * 0.9 +
    loadPenalty;

  const medicalRisk = clamp(Math.round(raw));
  const confidenceScore = clamp(Math.round((matched / injuries.length) * 100));

  return {
    medicalRisk,
    confidenceScore,
    matchedInjuries: matched,
    unknownInjuries: unknown,
    breakdown: {
      severity: Number(avgSeverity.toFixed(2)),
      recurrence: Number(avgRecurrence.toFixed(2)),
      availability: Number(avgAvailability.toFixed(2)),
      chronicity: Number(avgChronicity.toFixed(2)),
    },
  };
}
