import { Router } from "express";
import { successResponse } from "../lib/apiResponse";
import { getPlayerProfile, getPlayerProjection, getSimilarPlayers, listPlayers } from "../scout/player.service";
import { addScoutNote, getScoutNotes } from "../scout/scout-notes.store";

const router = Router();

router.get("/players", async (req, res, next) => {
  try {
    const result = await listPlayers({
      position: typeof req.query.position === "string" ? req.query.position : undefined,
      team: typeof req.query.team === "string" ? req.query.team : undefined,
      league: typeof req.query.league === "string" ? req.query.league : undefined,
      minOverall: typeof req.query.minOverall === "string" ? Number(req.query.minOverall) : undefined,
      ageMin: typeof req.query.ageMin === "string" ? Number(req.query.ageMin) : undefined,
      ageMax: typeof req.query.ageMax === "string" ? Number(req.query.ageMax) : undefined,
      page: typeof req.query.page === "string" ? Number(req.query.page) : undefined,
      limit: typeof req.query.limit === "string" ? Number(req.query.limit) : undefined,
    });
    return res.json(successResponse(result.items, { ...result.pagination, filters: result.filters }));
  } catch (error) {
    next(error);
  }
});

router.get("/player/:id", async (req, res, next) => {
  try {
    const result = await getPlayerProfile(req.params.id);
    return res.json(successResponse(result));
  } catch (error) {
    next(error);
  }
});

router.get("/player/:id/projection", async (req, res, next) => {
  try {
    const result = await getPlayerProjection(req.params.id);
    return res.json(successResponse(result));
  } catch (error) {
    next(error);
  }
});

router.get("/player/:id/similar", async (req, res, next) => {
  try {
    const result = await getSimilarPlayers(req.params.id);
    return res.json(successResponse(result));
  } catch (error) {
    next(error);
  }
});

router.get("/player/:id/notes", (req, res) => {
  const notes = getScoutNotes(req.params.id);
  res.json(successResponse(notes));
});

router.post("/player/:id/notes", (req, res) => {
  const note = addScoutNote(req.params.id, String(req.body.note ?? ""), String(req.body.createdBy ?? "analyst"));
  res.json(successResponse(note));
});

export default router;

