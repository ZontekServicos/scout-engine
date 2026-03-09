import { Router } from "express";
import { getHealthController } from "../controllers/health.controller";
const router = Router();

router.get("/", getHealthController);

export default router;

