import { Router } from "express";
import { successResponse } from "../lib/apiResponse";
import { validate } from "../lib/validate";
import { validateModel } from "../scout/model-validation.service";
import { modelValidationSchema } from "../validators/simulation.validators";

const router = Router();
let latestValidation = {
  modelAccuracy: 0,
  falsePositiveRate: 0,
  falseNegativeRate: 0,
  sampleSize: 0,
};

router.post(
  "/model",
  validate(modelValidationSchema, "body"),
  async (req, res, next) => {
    try {
      const payload = (req as any).validated?.body ?? req.body;
      const result = validateModel(payload.records);
      latestValidation = result;
      return res.json(successResponse(result));
    } catch (error) {
      next(error);
    }
  },
);

router.get("/model", (_req, res) => {
  res.json(successResponse(latestValidation));
});

export default router;
