import { Router } from 'express';
import { getPlayerVideos } from '../controllers/player-video.controller';

// Leitura publica dos videos de um jogador. Adicionar/remover video permanece
// privado — ver player-video.routes.ts.
const router = Router();

router.get('/player/:id/videos', getPlayerVideos);

export default router;
