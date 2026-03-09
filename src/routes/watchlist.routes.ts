import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import {
  addWatchlistItemController,
  listWatchlistController,
  removeWatchlistItemController,
} from "../controllers/watchlist.controller";

const router = Router();

router.post("/", asyncHandler(addWatchlistItemController));

router.get("/", asyncHandler(listWatchlistController));

router.delete("/:id", asyncHandler(removeWatchlistItemController));

export default router;

