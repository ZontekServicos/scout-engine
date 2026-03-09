import { Request, Response } from "express";
import { successResponse } from "../lib/apiResponse";
import { compareByIds, compareByNames } from "../scout/compare.service";
import { compareByNameParamsSchema, compareParamsSchema } from "../validators/compare.validators";

export async function compareByNamesController(req: Request, res: Response) {
  const { nameA, nameB } = compareByNameParamsSchema.parse(req.params);
  const result = await compareByNames(nameA, nameB);
  return res.json(successResponse(result));
}

export async function compareByIdsController(req: Request, res: Response) {
  const { idA, idB } = compareParamsSchema.parse(req.params);
  const result = await compareByIds(idA, idB);
  return res.json(successResponse(result));
}
