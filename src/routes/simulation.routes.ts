import { Router } from "express";
import { successResponse } from "../lib/apiResponse";
import { validate } from "../lib/validate";
import { simulateTransfer } from "../scout/transfer-simulation.service";
import { transferSimulationSchema } from "../validators/simulation.validators";

const router = Router();

router.post(
  "/transfer",
  validate(transferSimulationSchema, "body"),
  async (req, res, next) => {
    try {
      const payload = (req as any).validated?.body ?? req.body;
      const result = await simulateTransfer(payload);
      return res.json(successResponse(result));
    } catch (error) {
      next(error);
    }
  },
);

export default router;

