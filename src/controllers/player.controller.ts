import { Request, Response } from "express";
import { successResponse } from "../lib/apiResponse";
import { withCache } from "../lib/cache";
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

export async function listPlayersController(req: Request, res: Response) {
  const overallMin = asNumber(req.query.overallMin);
  const minOverall = asNumber(req.query.minOverall);

  const result = await listPlayers({
    search: typeof req.query.search === "string" ? req.query.search : undefined,
    position: typeof req.query.position === "string" ? req.query.position : undefined,
    team: typeof req.query.team === "string" ? req.query.team : undefined,
    league: typeof req.query.league === "string" ? req.query.league : undefined,
    overallMin: Number.isFinite(overallMin) ? overallMin : minOverall,
    overallMax: asNumber(req.query.overallMax),
    minOverall,
    ageMin: asNumber(req.query.ageMin),
    ageMax: asNumber(req.query.ageMax),
    page: asNumber(req.query.page),
    limit: asNumber(req.query.limit),
  });

  return res.json(successResponse(result.items, { ...result.pagination, filters: result.filters }));
}

export async function searchPlayersController(req: Request, res: Response) {
  const overallMin = asNumber(req.query.overallMin);
  const minOverall = asNumber(req.query.minOverall);

  const result = await listPlayers({
    search: typeof req.query.search === "string" ? req.query.search : undefined,
    position: typeof req.query.position === "string" ? req.query.position : undefined,
    team: typeof req.query.team === "string" ? req.query.team : undefined,
    league: typeof req.query.league === "string" ? req.query.league : undefined,
    overallMin: Number.isFinite(overallMin) ? overallMin : minOverall,
    overallMax: asNumber(req.query.overallMax),
    minOverall,
    ageMin: asNumber(req.query.ageMin),
    ageMax: asNumber(req.query.ageMax),
    page: asNumber(req.query.page),
    limit: asNumber(req.query.limit),
  });

  return res.json(
    successResponse(result.items, { ...result.pagination, filters: result.filters }),
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