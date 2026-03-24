import { prisma } from "../lib/prisma";
import { compareByIds } from "../scout/compare.service";

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

type AnalysisDeletePolicy = {
  canDelete: boolean;
  managedBy: "ANALYSIS" | "SCOUT_REPORT";
  reason: string;
};

export type AnalysisRuntimeStatus = {
  ready: boolean;
  missingTables: string[];
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
  deleteManagedBy: "analysis" | "scout_report";
  deleteHint: string;
  decisionContext: {
    analyst: string;
    status: AnalysisStatus;
  };
  sourceMetadata: AnalysisSourceMetadata;
  deletePolicy: AnalysisDeletePolicy;
  scoutReportId: string | null;
};

export type AnalysisReportContentViewModel = {
  mode: "comparison" | "single_player";
  canExportPdf: boolean;
  contentStatus: "ready" | "partial";
  contentMessage: string | null;
  comparisonData: unknown | null;
};

export type AnalysisDetailViewModel = AnalysisViewModel & {
  reportContent: AnalysisReportContentViewModel | null;
};

export type CreateComparisonAnalysisInput = {
  title?: string;
  description?: string;
  analyst?: string;
  status?: AnalysisStatus;
  playerIds: string[];
};

export type CreateReportAnalysisInput = {
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

function normalizeWinnerLabel(value: unknown) {
  const normalized = typeof value === "string" ? value.toUpperCase() : "DRAW";

  if (normalized === "A" || normalized === "PLAYERA") {
    return "A" as const;
  }

  if (normalized === "B" || normalized === "PLAYERB") {
    return "B" as const;
  }

  return "DRAW" as const;
}

async function buildReportAnalysisDescription(players: Array<{ id: string; name: string }>) {
  if (players.length === 0) {
    return "Relatorio executivo salvo na central de analises.";
  }

  if (players.length === 1) {
    return `${players[0].name} foi salvo como relatorio executivo na central de analises para acompanhamento decisorio.`;
  }

  const [playerA, playerB] = players;
  const comparison = (await compareByIds(playerA.id, playerB.id)) as {
    summary?: {
      playerA?: { name?: string; overall?: number; capitalEfficiency?: number; risk?: { explanation?: string } };
      playerB?: { name?: string; overall?: number; capitalEfficiency?: number; risk?: { explanation?: string } };
    };
    riskProfile?: {
      playerA?: { explanation?: string };
      playerB?: { explanation?: string };
    };
    liquidity?: {
      playerA?: { resaleWindow?: string };
      playerB?: { resaleWindow?: string };
    };
    quantitative?: { winner?: string };
  };

  const summaryA = comparison.summary?.playerA;
  const summaryB = comparison.summary?.playerB;
  const winner = normalizeWinnerLabel(comparison.quantitative?.winner);
  const preferredName =
    winner === "A"
      ? summaryA?.name ?? playerA.name
      : winner === "B"
        ? summaryB?.name ?? playerB.name
        : "Nenhum nome isolado";

  return [
    `Relatorio executivo entre ${summaryA?.name ?? playerA.name} e ${summaryB?.name ?? playerB.name}.`,
    winner === "DRAW"
      ? "A leitura comparativa permaneceu equilibrada no recorte atual."
      : `${preferredName} aparece como recomendacao principal no recorte atual.`,
    summaryA?.risk?.explanation ?? comparison.riskProfile?.playerA?.explanation ?? "",
    summaryB?.risk?.explanation ?? comparison.riskProfile?.playerB?.explanation ?? "",
    comparison.liquidity?.playerA?.resaleWindow || comparison.liquidity?.playerB?.resaleWindow
      ? `Janela de liquidez observada: ${comparison.liquidity?.playerA?.resaleWindow ?? "n/d"} vs ${comparison.liquidity?.playerB?.resaleWindow ?? "n/d"}.`
      : "",
    summaryA?.capitalEfficiency != null && summaryB?.capitalEfficiency != null
      ? `Capital efficiency: ${summaryA.capitalEfficiency.toFixed(2)} vs ${summaryB.capitalEfficiency.toFixed(2)}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
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
    canDelete: true,
    deleteManagedBy: "scout_report",
    deleteHint: "Entrada legada removivel via ScoutReport; exclusao deve usar o endpoint dedicado de ScoutReport.",
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
    deletePolicy: {
      canDelete: true,
      managedBy: "SCOUT_REPORT",
      reason: "Entrada legada removivel via ScoutReport; exclusao deve usar o endpoint dedicado de ScoutReport.",
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
    deleteManagedBy: "analysis",
    deleteHint: "Entrada persistida na central Analysis; exclusao permitida por este endpoint.",
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
    deletePolicy: {
      canDelete: true,
      managedBy: "ANALYSIS",
      reason: "Entrada persistida na central Analysis; exclusao permitida por este endpoint.",
    },
    scoutReportId: analysis.scoutReportId ?? null,
  };
}

async function buildReportContent(
  players: AnalysisPlayerViewModel[],
): Promise<AnalysisReportContentViewModel> {
  const orderedPlayers = players
    .slice()
    .sort((a, b) => a.order - b.order)
    .filter((player) => Boolean(player.id));

  if (orderedPlayers.length < 2) {
    return {
      mode: "single_player",
      canExportPdf: false,
      contentStatus: "partial",
      contentMessage: "Este relatorio nao possui dois jogadores suficientes para reconstruir a leitura executiva completa.",
      comparisonData: null,
    };
  }

  try {
    const comparisonData = await compareByIds(orderedPlayers[0].id, orderedPlayers[1].id);
    return {
      mode: "comparison",
      canExportPdf: true,
      contentStatus: "ready",
      contentMessage: null,
      comparisonData,
    };
  } catch (error) {
    return {
      mode: "comparison",
      canExportPdf: false,
      contentStatus: "partial",
      contentMessage: error instanceof Error ? error.message : "Nao foi possivel reconstruir o conteudo do relatorio.",
      comparisonData: null,
    };
  }
}

async function getAnalysisRuntimeStatus(): Promise<AnalysisRuntimeStatus> {
  const result = await prisma.$queryRaw<Array<{ analysis_table: string | null; comparison_table: string | null }>>`
    SELECT
      to_regclass('public."Analysis"')::text AS analysis_table,
      to_regclass('public."AnalysisComparison"')::text AS comparison_table
  `;

  const missingTables = [
    !result[0]?.analysis_table ? "Analysis" : null,
    !result[0]?.comparison_table ? "AnalysisComparison" : null,
  ].filter((value): value is string => Boolean(value));

  return {
    ready: missingTables.length === 0,
    missingTables,
  };
}

function buildAnalysisRuntimeErrorMessage(runtime: AnalysisRuntimeStatus) {
  const missingDetails =
    runtime.missingTables.length > 0
      ? ` Missing database objects: ${runtime.missingTables.join(", ")}.`
      : "";

  return `Analysis module is not initialized in the configured database yet.${missingDetails}`;
}

async function assertAnalysisRuntimeReady() {
  const runtime = await getAnalysisRuntimeStatus();

  if (!runtime.ready) {
    throw createHttpError(buildAnalysisRuntimeErrorMessage(runtime), 503);
  }

  return runtime;
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
  const runtime = await getAnalysisRuntimeStatus();
  if (!runtime.ready) {
    return [] as AnalysisViewModel[];
  }

  const analyses = await (prisma.analysis as any).findMany({
    where: {
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      status: true,
      analyst: true,
      createdAt: true,
      scoutReportId: true,
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

export async function getAnalysisById(id: string): Promise<AnalysisDetailViewModel> {
  const report = await prisma.scoutReport.findUnique({
    where: { id },
    include: {
      player: true,
    },
  });

  if (report) {
    return {
      ...mapScoutReportToAnalysisViewModel(report),
      reportContent: null,
    };
  }

  const runtime = await getAnalysisRuntimeStatus();
  if (!runtime.ready) {
    throw createHttpError("Analysis not found", 404);
  }

  const analysis = await (prisma.analysis as any).findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      status: true,
      analyst: true,
      createdAt: true,
      scoutReportId: true,
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

  const viewModel = mapAnalysisToViewModel(analysis);

  return {
    ...viewModel,
    reportContent: viewModel.type === "REPORT" ? await buildReportContent(viewModel.players) : null,
  };
}

export async function createComparisonAnalysis(input: CreateComparisonAnalysisInput) {
  await assertAnalysisRuntimeReady();

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

  const analysis = await (prisma.analysis as any).create({
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
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      status: true,
      analyst: true,
      createdAt: true,
      scoutReportId: true,
      comparisons: {
        include: {
          player: true,
        },
      },
    },
  });

  return mapAnalysisToViewModel(analysis);
}

export async function createReportAnalysis(input: CreateReportAnalysisInput) {
  await assertAnalysisRuntimeReady();

  const playerIds = input.playerIds.filter((playerId, index, array) => array.indexOf(playerId) === index);

  if (playerIds.length < 1) {
    throw createHttpError("At least one player is required", 400);
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
  const orderedPlayers = playerIds
    .map((playerId) => playersById.get(playerId))
    .filter((player): player is { id: string; name: string } => Boolean(player));

  const title =
    normalizeText(input.title) ||
    `Relatorio Executivo - ${orderedPlayers.map((player) => player.name).join(" vs ")}`;

  const analysis = await (prisma.analysis as any).create({
    data: {
      type: "REPORT",
      title,
      description: normalizeText(input.description) || (await buildReportAnalysisDescription(orderedPlayers)),
      analyst: normalizeText(input.analyst, "Sistema SoccerMind"),
      status: input.status ?? "COMPLETED",
      comparisons: {
        create: playerIds.map((playerId, index) => ({
          playerId,
          order: index,
        })),
      },
    },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      status: true,
      analyst: true,
      createdAt: true,
      scoutReportId: true,
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

  await assertAnalysisRuntimeReady();

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
