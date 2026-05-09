import { Request, Response } from "express";
import { successResponse } from "../lib/apiResponse";
import { compareByIds, compareByNames } from "../scout/compare.service";
import { compareByNameParamsSchema, compareParamsSchema } from "../validators/compare.validators";
import { emit } from "../services/event.service";

export async function compareByNamesController(req: Request, res: Response) {
  const { nameA, nameB } = compareByNameParamsSchema.parse(req.params);
  const result = await compareByNames(nameA, nameB);

  if (req.user?.id) {
    emit({ userId: req.user.id, type: "PLAYER_COMPARED", payload: { playerNameA: nameA, playerNameB: nameB } });
  }

  return res.json(successResponse(result));
}

export async function compareByIdsController(req: Request, res: Response) {
  const { idA, idB } = compareParamsSchema.parse(req.params);
  const result = await compareByIds(idA, idB);

  if (req.user?.id) {
    emit({
      userId: req.user.id,
      type: "PLAYER_COMPARED",
      payload: {
        playerIdA:   idA,
        playerIdB:   idB,
        playerNameA: result.playerAProfile.identity.name,
        playerNameB: result.playerBProfile.identity.name,
      },
    });
  }

  return res.json(successResponse(result));
}
