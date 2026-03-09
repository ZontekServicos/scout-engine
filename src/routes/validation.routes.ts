import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { validate } from "../lib/validate";
import { getModelValidationController, runModelValidationController } from "../controllers/validation.controller";
import { modelValidationSchema } from "../validators/simulation.validators";

const router = Router();

router.post(
  "/model",
  validate(modelValidationSchema, "body"),
  asyncHandler(runModelValidationController),
);

router.get("/model", asyncHandler(getModelValidationController));

export default router;
