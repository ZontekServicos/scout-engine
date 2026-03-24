import { Request, Response } from "express";
import { successResponse } from "../lib/apiResponse";
import { withCache } from "../lib/cache";
import { generatePlayerReportAnalysis } from "../scout/player-report.service";
import { getPlayerProfile, getPlayerProjection, getSimilarPlayers, listPlayers } from "../scout/player.service";
import { addScoutNote, getScoutNotes } from "../scout/scout-notes.store";

function getParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function asNumber(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getStringQuery(req: Request, ...keys: string[]) {
  for (const key of keys) {
    const value = req.query[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function getNumericQuery(req: Request, ...keys: string[]) {
  for (const key of keys) {
    const parsed = asNumber(req.query[key]);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function getArrayQuery(req: Request, ...keys: string[]) {
  const value = getStringQuery(req, ...keys);
  if (!value) {
    return undefined;
  }

  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? items : undefined;
}

function buildListPlayersParams(req: Request) {
  const positions = getArrayQuery(req, "positions");
  const position = getStringQuery(req, "position");

  return {
    search: getStringQuery(req, "search", "query"),
    positions,
    position,
    nationality: getStringQuery(req, "nationality"),
    team: getStringQuery(req, "team"),
    league: getStringQuery(req, "league"),
    source: getStringQuery(req, "source"),
    overallMin: getNumericQuery(req, "overallMin", "minOverall"),
    overallMax: getNumericQuery(req, "overallMax", "maxOverall"),
    potentialMin: getNumericQuery(req, "potentialMin", "minPotential"),
    potentialMax: getNumericQuery(req, "potentialMax", "maxPotential"),
    marketValueMin: getNumericQuery(req, "marketValueMin", "minValue"),
    marketValueMax: getNumericQuery(req, "marketValueMax", "maxValue"),
    ageMin: getNumericQuery(req, "ageMin", "minAge"),
    ageMax: getNumericQuery(req, "ageMax", "maxAge"),
    page: getNumericQuery(req, "page"),
    limit: getNumericQuery(req, "limit"),
  };
}

export async function listPlayersController(req: Request, res: Response) {
  const result = await listPlayers(buildListPlayersParams(req));
  return res.json(successResponse(result.items, { ...result.pagination, filters: result.filters, filterOptions: result.filterOptions }));
}

export async function searchPlayersController(req: Request, res: Response) {
  const result = await listPlayers(buildListPlayersParams(req));
  return res.json(
    successResponse(result.items, { ...result.pagination, filters: result.filters, filterOptions: result.filterOptions }),
  );
}

export async function getPlayerProfileController(req: Request, res: Response) {
  const playerId = getParam(req.params.id);
  const cacheKey = `player:profile:${playerId}`;
  const data = await withCache(cacheKey, 120, () => getPlayerProfile(playerId));
  return res.json(successResponse(data));
}

export async function getPlayerProjectionController(req: Request, res: Response) {
  const playerId = getParam(req.params.id);
  const cacheKey = `player:projection:${playerId}`;
  const data = await withCache(cacheKey, 120, () => getPlayerProjection(playerId));
  return res.json(successResponse(data));
}

export async function getPlayerSimilarController(req: Request, res: Response) {
  const playerId = getParam(req.params.id);
  const cacheKey = `player:similar:${playerId}`;
  const data = await withCache(cacheKey, 120, () => getSimilarPlayers(playerId));
  return res.json(successResponse(data));
}

export async function listPlayerNotesController(req: Request, res: Response) {
  const playerId = getParam(req.params.id);
  const notes = getScoutNotes(playerId);
  return res.json(successResponse(notes));
}

export async function createPlayerNoteController(req: Request, res: Response) {
  const playerId = getParam(req.params.id);
  const note = addScoutNote(playerId, String(req.body.note ?? ""), String(req.body.createdBy ?? "analyst"));
  return res.json(successResponse(note));
}

export async function createPlayerReportController(req: Request, res: Response) {
  const playerId = getParam(req.params.id);
  const data = await generatePlayerReportAnalysis(playerId, {
    analyst: typeof req.body?.analyst === "string" ? req.body.analyst : undefined,
  });

  return res.status(201).json(successResponse(data));
}
