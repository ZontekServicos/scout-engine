import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import {
  getSearchHistoryController,
  deleteSearchHistoryEntryController,
  clearSearchHistoryController,
} from "../controllers/search-history.controller";

const router = Router();

// GET    /api/search-history?page=1&limit=20
router.get("/",       asyncHandler(getSearchHistoryController));

// DELETE /api/search-history          — clear all
router.delete("/",    asyncHandler(clearSearchHistoryController));

// DELETE /api/search-history/:id      — remove single entry
router.delete("/:id", asyncHandler(deleteSearchHistoryEntryController));

export default router;
