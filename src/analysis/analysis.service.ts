import { prisma } from "../lib/prisma";

type AnalysisType = "COMPARISON" | "REPORT";
type AnalysisStatus = "COMPLETED" | "IN_PROGRESS" | "ARCHIVED";
type LegacyScoutType = "SINGLE" | "COMPARE" | "RANKING";

export type ListAnalysesFilters = {
  type?: AnalysisType;
  status?: AnalysisStatus;
  includeLegacy?: boolean;
};

type AnalysisPlayerViewModel = {
  id: string;
  name: string;
  club: string;
  positions: string[];
  order: number;
};

type AnalysisSourceMetadata = {
  origin: "ANALYSIS" | "SCOUT_REPORT";
  legacy: boolean;
  scoutReportType: LegacyScoutType | null;
  scoutReportId: string | null;
  decisionStatus: string | null;
};

export type AnalysisViewModel = {
  id: string;
  title: string;
  description: string | null;
  type: AnalysisType;
  typeLabel: string;
  createdAt: string;
  status: AnalysisStatus;
  statusLabel: string;
  analyst: string;
  players: AnalysisPlayerViewModel[];
  playerCount: number;
  canDelete: boolean;
  decisionContext: {
    analyst: string;
    status: AnalysisStatus;
  };
  sourceMetadata: AnalysisSourceMetadata;
  scoutReportId: string | null;
};

export type CreateComparisonAnalysisInput = {
  title?: string;
  description?: string;
  analyst?: string;
  status?: AnalysisStatus;
  playerIds: string[];
};

function createHttpError(message: string, statusCode: number) {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = statusCode;
  return error;
}

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
  player?: { id?: string; name: string | null; team?: string | null; positions?: string[] } | null;
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
    report.player
      ? {
          id: normalizeText(report.player.id),
          name: normalizeText(report.player.name, "Jogador"),
          club: normalizeText(report.player.team),
          positions: Array.isArray(report.player.positions) ? report.player.positions : [],
        }
      : null,
    ...["playerA", "playerB"].map((key) => {
      const source = [playerDetails[key], playersNode[key]].find(
        (value) => value && typeof value === "object",
      ) as Record<string, unknown> | undefined;

      if (!source) {
        return null;
      }

      const id = normalizeText(
        typeof source.id === "string" ? source.id : typeof source.playerKey === "string" ? source.playerKey : "",
      );
      const name = normalizeText(
        typeof source.nomeJogador === "string" ? source.nomeJogador : typeof source.name === "string" ? source.name : "",
      );

      if (!name) {
        return null;
      }

      return {
        id,
        name,
        club: normalizeText(typeof source.club === "string" ? source.club : typeof source.team === "string" ? source.team : ""),
        positions: Array.isArray(source.positions) ? source.positions.filter((item): item is string => typeof item === "string") : [],
      };
    }),
  ].filter(
    (
      player,
    ): player is {
      id: string;
      name: string;
      club: string;
      positions: string[];
    } => Boolean(player?.name),
  );

  return rawPlayers
    .filter((player, index, array) => array.findIndex((candidate) => candidate.name === player.name) === index)
    .map((player, index) => ({
      ...player,
      order: index,
    }));
}

function buildReportTitle(report: {
  id: string;
  type: LegacyScoutType;
  player?: { id?: string; name: string | null; team?: string | null; positions?: string[] } | null;
  output?: unknown;
}) {
  const players = extractReportPlayers(report);
  const prefix = report.type === "COMPARE" ? "Comparacao" : "Relatorio";

  if (players.length > 0) {
    return `${prefix} - ${players.map((player) => player.name).join(" / ")}`;
  }

  return `${prefix} ${report.id.slice(0, 8)}`;
}

function mapScoutReportToAnalysisViewModel(report: {
  id: string;
  type: LegacyScoutType;
  createdAt: Date;
  requestedBy: string | null;
  decisionStatus: string | null;
  player?: { id: string; name: string | null; team?: string | null; positions?: string[] } | null;
  output?: unknown;
}): AnalysisViewModel {
  const players = extractReportPlayers(report);
  const type: AnalysisType = report.type === "COMPARE" ? "COMPARISON" : "REPORT";
  const status = normalizeReportStatus(report.decisionStatus);
  const analyst = normalizeText(report.requestedBy, "Sistema SoccerMind");

  return {
    id: report.id,
    title: buildReportTitle(report),
    description: null,
    type,
    typeLabel: getAnalysisTypeLabel(type),
    createdAt: report.createdAt.toISOString(),
    status,
    statusLabel: getAnalysisStatusLabel(status),
    analyst,
    players,
    playerCount: players.length,
    canDelete: false,
    decisionContext: {
      analyst,
      status,
    },
    sourceMetadata: {
      origin: "SCOUT_REPORT",
      legacy: true,
      scoutReportType: report.type,
      scoutReportId: report.id,
      decisionStatus: report.decisionStatus,
    },
    scoutReportId: report.id,
  };
}

function mapAnalysisToViewModel(analysis: {
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
  scoutReportId?: string | null;
}): AnalysisViewModel {
  const players = analysis.comparisons
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((entry) => ({
      id: entry.player.id,
      name: entry.player.name,
      club: normalizeText(entry.player.team),
      positions: entry.player.positions,
      order: entry.order,
    }));
  const analyst = normalizeText(analysis.analyst, "Sistema SoccerMind");

  return {
    id: analysis.id,
    title: analysis.title,
    description: analysis.description,
    type: analysis.type,
    typeLabel: getAnalysisTypeLabel(analysis.type),
    createdAt: analysis.createdAt.toISOString(),
    status: analysis.status,
    statusLabel: getAnalysisStatusLabel(analysis.status),
    analyst,
    players,
    playerCount: players.length,
    canDelete: true,
    decisionContext: {
      analyst,
      status: analysis.status,
    },
    sourceMetadata: {
      origin: "ANALYSIS",
      legacy: false,
      scoutReportType: null,
      scoutReportId: analysis.scoutReportId ?? null,
      decisionStatus: null,
    },
    scoutReportId: analysis.scoutReportId ?? null,
  };
}

async function hasAnalysisTable() {
  const result = await prisma.$queryRaw<Array<{ relation_name: string | null }>>`
    SELECT to_regclass('public."Analysis"')::text AS relation_name
  `;

  return Boolean(result[0]?.relation_name);
}

async function listLegacyScoutReportEntries(filters: ListAnalysesFilters) {
  if (filters.includeLegacy === false) {
    return [] as AnalysisViewModel[];
  }

  const desiredTypes: LegacyScoutType[] | undefined = filters.type
    ? filters.type === "COMPARISON"
      ? ["COMPARE"]
      : ["SINGLE", "RANKING"]
    : undefined;

  const reports = await prisma.scoutReport.findMany({
    where: desiredTypes ? { type: { in: desiredTypes } } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      player: true,
    },
  });

  return reports
    .map(mapScoutReportToAnalysisViewModel)
    .filter((entry) => (filters.status ? entry.status === filters.status : true));
}

async function listAnalysisEntries(filters: ListAnalysesFilters) {
  if (!(await hasAnalysisTable())) {
    return [] as AnalysisViewModel[];
  }

  const analyses = await prisma.analysis.findMany({
    where: {
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      comparisons: {
        include: {
          player: true,
        },
      },
    },
  });

  return analyses.map(mapAnalysisToViewModel);
}

export async function listAnalyses(filters: ListAnalysesFilters = {}) {
  const [reports, analyses] = await Promise.all([
    listLegacyScoutReportEntries(filters),
    listAnalysisEntries(filters),
  ]);

  return [...reports, ...analyses].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function getAnalysisById(id: string) {
  const report = await prisma.scoutReport.findUnique({
    where: { id },
    include: {
      player: true,
    },
  });

  if (report) {
    return mapScoutReportToAnalysisViewModel(report);
  }

  if (!(await hasAnalysisTable())) {
    throw createHttpError("Analysis not found", 404);
  }

  const analysis = await prisma.analysis.findUnique({
    where: { id },
    include: {
      comparisons: {
        include: {
          player: true,
        },
      },
    },
  });

  if (!analysis) {
    throw createHttpError("Analysis not found", 404);
  }

  return mapAnalysisToViewModel(analysis);
}

export async function createComparisonAnalysis(input: CreateComparisonAnalysisInput) {
  if (!(await hasAnalysisTable())) {
    throw createHttpError("Analysis module is not initialized in the database yet", 503);
  }

  const playerIds = input.playerIds.filter((playerId, index, array) => array.indexOf(playerId) === index);

  if (playerIds.length < 2) {
    throw createHttpError("At least two unique players are required", 400);
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
    throw createHttpError("One or more players were not found", 400);
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
    },
  });

  return mapAnalysisToViewModel(analysis);
}

export async function deleteAnalysis(id: string) {
  const report = await prisma.scoutReport.findUnique({
    where: { id },
    select: {
      id: true,
    },
  });

  if (report) {
    throw createHttpError("Report entries must remain managed by ScoutReport", 409);
  }

  if (!(await hasAnalysisTable())) {
    throw createHttpError("Analysis module is not initialized in the database yet", 503);
  }

  const existingAnalysis = await prisma.analysis.findUnique({
    where: { id },
    select: {
      id: true,
    },
  });

  if (!existingAnalysis) {
    throw createHttpError("Analysis not found", 404);
  }

  await prisma.analysis.delete({
    where: { id },
  });

  return {
    id,
    message: "Analysis deleted successfully",
  };
}
