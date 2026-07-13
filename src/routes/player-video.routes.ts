import { Router } from 'express';
import {
  addPlayerVideo,
  deletePlayerVideo
} from '../controllers/player-video.controller';

// Escrita de videos: requer autenticacao — ver mount em server.ts.
// Leitura publica esta em player-video-public.routes.ts.
const router = Router();

router.post('/player/:id/videos', addPlayerVideo);
router.delete('/player/:id/videos/:videoId', deletePlayerVideo);

export default router;
