import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import {
  createPlayerNoteController,
  createPlayerReportController,
  listPlayerNotesController,
} from "../controllers/player.controller";

// Rotas privadas de jogador: geram custo (relatorio com IA) ou gravam dados
// ligados ao usuario autenticado (notas de scouting). Requerem autenticacao —
// ver mount em server.ts. Leitura publica esta em player-public.routes.ts.
const router = Router();

router.post("/player/:id/report", asyncHandler(createPlayerReportController));

router.get("/player/:id/notes", asyncHandler(listPlayerNotesController));
router.post("/player/:id/notes", asyncHandler(createPlayerNoteController));

export default router;
