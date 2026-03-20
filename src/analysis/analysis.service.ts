import { prisma } from "../lib/prisma";

type AnalysisType = "COMPARISON" | "REPORT";
type AnalysisStatus = "COMPLETED" | "IN_PROGRESS" | "ARCHIVED";

type CreateComparisonAnalysisInput = {
  title?: string;
  description?: string;
  analyst?: string;
  status?: AnalysisStatus;
  playerIds: string[];
};

function normalizeText(value: string | null | undefined, fallback = "") {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function normalizeReportStatus(value: string | null | undefined): AnalysisStatus {
  switch (value) {
    case "APPROVED":
      return "COMPLETED";
    case "REJECTED":
      return "ARCHIVED";
    default:
      return "IN_PROGRESS";
  }
}

function getAnalysisTypeLabel(type: AnalysisType) {
  return type === "COMPARISON" ? "Comparacao" : "Relatorio";
}

function getAnalysisStatusLabel(status: AnalysisStatus) {
  switch (status) {
    case "COMPLETED":
      return "Concluido";
    case "IN_PROGRESS":
      return "Em andamento";
    case "ARCHIVED":
      return "Arquivado";
  }
}

function extractReportPlayers(report: {
  player?: { id: string; name: string | null } | null;
  output?: unknown;
}) {
  const output = report.output && typeof report.output === "object" ? (report.output as Record<string, unknown>) : {};
  const playerDetails =
    output.playerDetails && typeof output.playerDetails === "object"
      ? (output.playerDetails as Record<string, unknown>)
      : {};
  const playersNode =
    output.players && typeof output.players === "object" ? (output.players as Record<string, unknown>) : {};

  const rawPlayers = [
    report.player ? { id: report.player.id, name: normalizeText(report.player.name, "Jogador") } : null,
    ...["playerA", "playerB"].map((key) => {
      const source = [playerDetails[key], playersNode[key]].find(
        (value) => value && typeof value === "object",
      ) as Record<string, unknown> | undefined;

      if (!source) {
        return null;
      }

      const id = normalizeText(typeof source.id === "string" ? source.id : typeof source.playerKey === "string" ? source.playerKey : "");
      const name = normalizeText(
        typeof source.nomeJogador === "string" ? source.nomeJogador : typeof source.name === "string" ? source.name : "",
      );

      if (!name) {
        return null;
      }

      return { id, name };
    }),
  ].filter((player): player is { id: string; name: string } => Boolean(player?.name));

  return rawPlayers.filter((player, index, array) => array.findIndex((candidate) => candidate.name === player.name) === index);
}

async function syncLegacyReportAnalyses() {
  const legacyReports = await prisma.scoutReport.findMany({
    where: {
      type: {
        not: "COMPARE",
      },
      analysis: {
        is: null,
      },
    },
    include: {
      player: true,
    },
  });

  if (legacyReports.length === 0) {
    return;
  }

  await prisma.$transaction(
    legacyReports.map((report) => {
      const reportPlayers = extractReportPlayers(report);
      const title =
        reportPlayers.length > 0
          ? `Relatorio - ${reportPlayers.map((player) => player.name).join(" / ")}`
          : `Relatorio ${report.id.slice(0, 8)}`;

      const data = {
        type: "REPORT" as const,
        title,
        analyst: normalizeText(report.requestedBy, "Sistema SoccerMind"),
        status: normalizeReportStatus(report.decisionStatus),
        scoutReportId: report.id,
      };

      return prisma.analysis.upsert({
        where: {
          scoutReportId: report.id,
        },
        update: data,
        create: {
          type: "REPORT",
          title,
          analyst: normalizeText(report.requestedBy, "Sistema SoccerMind"),
          status: normalizeReportStatus(report.decisionStatus),
          scoutReportId: report.id,
        },
      });
    }),
  );
}

function mapAnalysisEntity(analysis: {
  id: string;
  title: string;
  description: string | null;
  type: AnalysisType;
  status: AnalysisStatus;
  analyst: string | null;
  createdAt: Date;
  comparisons: Array<{
    order: number;
    player: {
      id: string;
      name: string;
      team: string | null;
      positions: string[];
    };
  }>;
  scoutReport: {
    id: string;
    player: { id: string; name: string | null } | null;
    output: unknown;
  } | null;
}) {
  const comparisonPlayers = analysis.comparisons
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((entry) => ({
      id: entry.player.id,
      name: entry.player.name,
      club: normalizeText(entry.player.team),
      positions: entry.player.positions,
      order: entry.order,
    }));

  const reportPlayers =
    analysis.scoutReport?.output !== undefined
      ? extractReportPlayers(analysis.scoutReport).map((player, index) => ({
          id: player.id,
          name: player.name,
          club: "",
          positions: [] as string[],
          order: index,
        }))
      : [];

  const players = analysis.type === "COMPARISON" ? comparisonPlayers : reportPlayers;

  return {
    id: analysis.id,
    title: analysis.title,
    description: analysis.description,
    type: analysis.type,
    typeLabel: getAnalysisTypeLabel(analysis.type),
    createdAt: analysis.createdAt.toISOString(),
    status: analysis.status,
    statusLabel: getAnalysisStatusLabel(analysis.status),
    analyst: normalizeText(analysis.analyst, "Sistema SoccerMind"),
    players,
    scoutReportId: analysis.scoutReport?.id ?? null,
  };
}

async function getAnalysisQuery() {
  await syncLegacyReportAnalyses();

  return prisma.analysis.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      comparisons: {
        include: {
          player: true,
        },
      },
      scoutReport: {
        include: {
          player: true,
        },
      },
    },
  });
}

export async function listAnalyses() {
  const analyses = await getAnalysisQuery();
  return analyses.map(mapAnalysisEntity);
}

export async function getAnalysisById(id: string) {
  await syncLegacyReportAnalyses();

  const analysis = await prisma.analysis.findUnique({
    where: { id },
    include: {
      comparisons: {
        include: {
          player: true,
        },
      },
      scoutReport: {
        include: {
          player: true,
        },
      },
    },
  });

  if (!analysis) {
    const error = new Error("Analysis not found") as Error & { statusCode?: number };
    error.statusCode = 404;
    throw error;
  }

  return mapAnalysisEntity(analysis);
}

export async function createComparisonAnalysis(input: CreateComparisonAnalysisInput) {
  const playerIds = input.playerIds.filter((playerId, index, array) => array.indexOf(playerId) === index);

  if (playerIds.length < 2) {
    const error = new Error("At least two unique players are required") as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }

  const players = await prisma.player.findMany({
    where: {
      id: {
        in: playerIds,
      },
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (players.length !== playerIds.length) {
    const error = new Error("One or more players were not found") as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }

  const playersById = new Map(players.map((player) => [player.id, player]));
  const title =
    normalizeText(input.title) ||
    `Comparacao - ${playerIds.map((playerId) => playersById.get(playerId)?.name ?? playerId).join(" vs ")}`;

  const analysis = await prisma.analysis.create({
    data: {
      type: "COMPARISON",
      title,
      description: normalizeText(input.description) || null,
      analyst: normalizeText(input.analyst, "Sistema SoccerMind"),
      status: input.status ?? "COMPLETED",
      comparisons: {
        create: playerIds.map((playerId, index) => ({
          playerId,
          order: index,
        })),
      },
    },
    include: {
      comparisons: {
        include: {
          player: true,
        },
      },
      scoutReport: {
        include: {
          player: true,
        },
      },
    },
  });

  return mapAnalysisEntity(analysis);
}

export async function deleteAnalysis(id: string) {
  await syncLegacyReportAnalyses();

  const existingAnalysis = await prisma.analysis.findUnique({
    where: { id },
    select: {
      id: true,
      scoutReportId: true,
    },
  });

  if (!existingAnalysis) {
    const error = new Error("Analysis not found") as Error & { statusCode?: number };
    error.statusCode = 404;
    throw error;
  }

  if (existingAnalysis.scoutReportId) {
    const error = new Error("Report analyses must be removed from the reports flow") as Error & { statusCode?: number };
    error.statusCode = 409;
    throw error;
  }

  await prisma.analysis.delete({
    where: { id },
  });

  return {
    id,
    message: "Analysis deleted successfully",
  };
}
