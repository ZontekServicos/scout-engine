import { Router } from 'express';
import {
  getPlayerVideos,
  addPlayerVideo,
  deletePlayerVideo
} from '../controllers/player-video.controller';

const router = Router();

router.get('/player/:id/videos', getPlayerVideos);
router.post('/player/:id/videos', addPlayerVideo);
router.delete('/player/:id/videos/:videoId', deletePlayerVideo);

export default router;
