import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
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
  const result = await listPlayers({
    position: typeof req.query.position === "string" ? req.query.position : undefined,
    team: typeof req.query.team === "string" ? req.query.team : undefined,
    league: typeof req.query.league === "string" ? req.query.league : undefined,
    minOverall: asNumber(req.query.minOverall),
    ageMin: asNumber(req.query.ageMin),
    ageMax: asNumber(req.query.ageMax),
    page: asNumber(req.query.page),
    limit: asNumber(req.query.limit),
  });

  return res.json(successResponse(result.items, { ...result.pagination, filters: result.filters }));
}

export async function searchPlayersController(req: Request, res: Response) {
  const page = Math.max(1, asNumber(req.query.page) ?? 1);
  const limit = Math.min(100, Math.max(1, asNumber(req.query.limit) ?? 20));
  const skip = (page - 1) * limit;

  const position = typeof req.query.position === "string" ? req.query.position.trim().toUpperCase() : undefined;
  const team = typeof req.query.team === "string" ? req.query.team.trim() : undefined;
  const league = typeof req.query.league === "string" ? req.query.league.trim() : undefined;
  const ageMin = asNumber(req.query.ageMin);
  const ageMax = asNumber(req.query.ageMax);
  const overallMin = asNumber(req.query.overallMin);
  const overallMax = asNumber(req.query.overallMax);

  const where: any = {};
  if (position) where.positions = { has: position };
  if (team) where.team = { contains: team, mode: "insensitive" };
  if (league) where.league = { contains: league, mode: "insensitive" };
  if (Number.isFinite(ageMin) || Number.isFinite(ageMax)) {
    where.age = {
      ...(Number.isFinite(ageMin) ? { gte: ageMin } : {}),
      ...(Number.isFinite(ageMax) ? { lte: ageMax } : {}),
    };
  }
  if (Number.isFinite(overallMin) || Number.isFinite(overallMax)) {
    where.overall = {
      ...(Number.isFinite(overallMin) ? { gte: overallMin } : {}),
      ...(Number.isFinite(overallMax) ? { lte: overallMax } : {}),
    };
  }

  const [total, players] = await Promise.all([
    prisma.player.count({ where }),
    prisma.player.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ overall: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        positions: true,
        team: true,
        nationality: true,
        age: true,
        overall: true,
        potential: true,
        imagePath: true,
      },
    }),
  ]);

  const items = players.map((player) => ({
    id: player.id,
    name: player.name,
    position: player.positions?.[0] ?? "CM",
    team: player.team ?? null,
    nationality: player.nationality ?? null,
    age: player.age ?? null,
    overall: player.overall ?? null,
    potential: player.potential ?? null,
    image: player.imagePath ?? null,
  }));

  return res.json(
    successResponse(items, {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      filters: { position: position ?? null, team: team ?? null, league: league ?? null, ageMin: ageMin ?? null, ageMax: ageMax ?? null, overallMin: overallMin ?? null, overallMax: overallMax ?? null },
    }),
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
