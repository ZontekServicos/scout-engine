import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { normalizeLegacyAnalysisTypes, type AnalysisType, validateAnalysisType } from "../analysis/analysis.service";

const PLAYER_REPORT_TYPE: AnalysisType = "PLAYER_REPORT";

function createHttpError(message: string, statusCode: number) {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = statusCode;
  return error;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function toDecisionPayload(
  existingPayload: Prisma.JsonValue,
  input: {
    decisionStatus: "APPROVED" | "REJECTED";
    requestedBy: string;
    technicalReason: string;
    decisionBy?: string;
    decisionReason?: string;
    modelVersion?: string;
    riskVersion?: string;
    antiFlopVersion?: string;
    engineVersion?: string;
  },
) {
  const payload = asRecord(existingPayload) ?? {};

  return {
    ...payload,
    decision: {
      decisionStatus: input.decisionStatus,
      requestedBy: input.requestedBy,
      technicalReason: input.technicalReason,
      decisionBy: input.decisionBy ?? null,
      decisionReason: input.decisionReason ?? null,
      modelVersion: input.modelVersion ?? null,
      riskVersion: input.riskVersion ?? null,
      antiFlopVersion: input.antiFlopVersion ?? null,
      engineVersion: input.engineVersion ?? null,
      decisionAt: new Date().toISOString(),
    },
  } as Prisma.InputJsonValue;
}

function mapReportEntry(analysis: {
  id: string;
  type: string;
  title: string;
  description: string | null;
  payload: Prisma.JsonValue;
  analyst: string | null;
  createdAt: Date;
  updatedAt: Date;
  status: string;
  comparisons: Array<{
    player: {
      id: string;
      name: string;
    };
  }>;
}) {
  const payload = asRecord(analysis.payload) ?? {};
  const decision = asRecord(payload.decision);
  const type = validateAnalysisType(analysis.type);

  return {
    id: analysis.id,
    type,
    reportType: type,
    title: analysis.title,
    description: analysis.description,
    content: payload,
    players: analysis.comparisons.map((entry) => ({
      id: entry.player.id,
      name: entry.player.name,
    })),
    analyst: analysis.analyst,
    status: analysis.status,
    output: payload,
    aiNarrative: typeof payload.aiNarrative === "string" ? payload.aiNarrative : analysis.description,
    requestedBy: typeof decision?.requestedBy === "string" ? decision.requestedBy : null,
    decisionBy: typeof decision?.decisionBy === "string" ? decision.decisionBy : null,
    decisionReason: typeof decision?.decisionReason === "string" ? decision.decisionReason : null,
    modelVersion: typeof decision?.modelVersion === "string" ? decision.modelVersion : null,
    riskVersion: typeof decision?.riskVersion === "string" ? decision.riskVersion : null,
    antiFlopVersion: typeof decision?.antiFlopVersion === "string" ? decision.antiFlopVersion : null,
    engineVersion: typeof decision?.engineVersion === "string" ? decision.engineVersion : null,
    technicalReason: typeof decision?.technicalReason === "string" ? decision.technicalReason : null,
    decisionStatus: typeof decision?.decisionStatus === "string" ? decision.decisionStatus : null,
    decisionAt: typeof decision?.decisionAt === "string" ? decision.decisionAt : null,
    createdAt: analysis.createdAt,
    updatedAt: analysis.updatedAt,
    insights: asStringArray(payload.insights),
  };
}

interface GetReportsParams {
  page?: number;
  limit?: number;
  type?: string;
  playerId?: string;
}

export async function getReports({ page = 1, limit = 10, playerId }: GetReportsParams) {
  await normalizeLegacyAnalysisTypes();
  const skip = (page - 1) * limit;
  const type = validateAnalysisType(PLAYER_REPORT_TYPE);

  const where = {
    type,
    ...(playerId
      ? {
          comparisons: {
            some: {
              playerId,
            },
          },
        }
      : {}),
  } satisfies Prisma.AnalysisWhereInput;

  const [reports, total] = await Promise.all([
    prisma.analysis.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        comparisons: {
          include: {
            player: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    }),
    prisma.analysis.count({ where }),
  ]);

  return {
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    data: reports.map(mapReportEntry),
  };
}

export async function getReportById(id: string) {
  await normalizeLegacyAnalysisTypes();
  const report = await prisma.analysis.findFirst({
    where: {
      id,
      type: validateAnalysisType(PLAYER_REPORT_TYPE),
    },
    include: {
      comparisons: {
        include: {
          player: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!report) {
    throw createHttpError("Report not found", 404);
  }

  return mapReportEntry(report);
}

export async function applyReportDecision(
  id: string,
  data: {
    decisionStatus: "APPROVED" | "REJECTED";
    requestedBy: string;
    technicalReason: string;
    decisionBy?: string;
    decisionReason?: string;
    modelVersion?: string;
    riskVersion?: string;
    antiFlopVersion?: string;
    engineVersion?: string;
  },
) {
  await normalizeLegacyAnalysisTypes();
  const report = await prisma.analysis.findFirst({
    where: {
      id,
      type: validateAnalysisType(PLAYER_REPORT_TYPE),
    },
    select: {
      id: true,
      payload: true,
    },
  });

  if (!report) {
    throw createHttpError("Report not found", 404);
  }

  if (report.payload === null || report.payload === undefined) {
    throw new Error("Invalid payload: cannot be null");
  }

  const updated = await prisma.analysis.update({
    where: { id },
    data: {
      payload: toDecisionPayload(report.payload, data),
    },
    include: {
      comparisons: {
        include: {
          player: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  return mapReportEntry(updated);
}

export async function deleteReport(id: string) {
  await normalizeLegacyAnalysisTypes();
  const report = await prisma.analysis.findFirst({
    where: {
      id,
      type: validateAnalysisType(PLAYER_REPORT_TYPE),
    },
    select: {
      id: true,
    },
  });

  if (!report) {
    throw createHttpError("Report not found", 404);
  }

  await prisma.analysis.delete({
    where: { id },
  });

  return {
    message: "Analysis report deleted successfully",
    id,
  };
}
