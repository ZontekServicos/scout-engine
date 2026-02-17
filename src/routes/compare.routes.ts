import { Router } from "express";
import { compareByIds } from "../scout/compare.service";
import { successResponse } from "../lib/apiResponse";
import { compareParamsSchema } from "../validators/compare.validators";

const router = Router();

/**
 * GET /api/compare/:idA/:idB
 * Compara dois jogadores da mesma posição
 */
router.get("/:idA/:idB", async (req, res, next) => {
  try {
    // 🔒 Validação profissional
    const { idA, idB } = compareParamsSchema.parse(req.params);

    const result = await compareByIds(idA, idB);

    return res.json(successResponse(result));
  } catch (error) {
    next(error); // delega para middleware global
  }
});

export default router;
