import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { validate } from "../lib/validate";
import { simulateTransferController } from "../controllers/simulation.controller";
import { transferSimulationSchema } from "../validators/simulation.validators";

const router = Router();

router.post(
  "/transfer",
  validate(transferSimulationSchema, "body"),
  asyncHandler(simulateTransferController),
);

export default router;

