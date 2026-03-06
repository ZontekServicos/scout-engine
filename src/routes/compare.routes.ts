import { Router } from "express";
import { compareByIds, compareByNames } from "../scout/compare.service";
import { successResponse } from "../lib/apiResponse";
import { compareByNameParamsSchema, compareParamsSchema } from "../validators/compare.validators";

const router = Router();
router.get("/by-name/:nameA/:nameB", async (req, res, next) => {
  try {
    const { nameA, nameB } = compareByNameParamsSchema.parse(req.params);

    const result = await compareByNames(nameA, nameB);

    return res.json(successResponse(result));
  } catch (error) {
    next(error);
  }
});

router.get("/:idA/:idB", async (req, res, next) => {
  try {
    const { idA, idB } = compareParamsSchema.parse(req.params);

    const result = await compareByIds(idA, idB);

    return res.json(successResponse(result));
  } catch (error) {
    next(error);
  }
});

export default router;
