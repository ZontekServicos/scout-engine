import { Router } from "express";
import { successResponse } from "../lib/apiResponse";
import { getPlayerProfile, getPlayerProjection, getSimilarPlayers } from "../scout/player.service";
import { addScoutNote, getScoutNotes } from "../scout/scout-notes.store";

const router = Router();

router.get("/:id", async (req, res, next) => {
  try {
    const result = await getPlayerProfile(req.params.id);
    return res.json(successResponse(result));
  } catch (error) {
    next(error);
  }
});

router.get("/:id/projection", async (req, res, next) => {
  try {
    const result = await getPlayerProjection(req.params.id);
    return res.json(successResponse(result));
  } catch (error) {
    next(error);
  }
});

router.get("/:id/similar", async (req, res, next) => {
  try {
    const result = await getSimilarPlayers(req.params.id);
    return res.json(successResponse(result));
  } catch (error) {
    next(error);
  }
});

router.get("/:id/notes", (req, res) => {
  const notes = getScoutNotes(req.params.id);
  res.json(successResponse(notes));
});

router.post("/:id/notes", (req, res) => {
  const note = addScoutNote(req.params.id, String(req.body.note ?? ""), String(req.body.createdBy ?? "analyst"));
  res.json(successResponse(note));
});

export default router;

