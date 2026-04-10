/**
 * highlights.ingestion.ts
 *
 * Pipeline that fetches Sportmonks highlights and persists them as PlayerVideo
 * records, linked to a player via the fixture → match events chain.
 *
 * Association logic:
 *   Sportmonks highlight → fixture_id
 *   → prisma.match.findUnique({ externalId: fixture_id })   (Int → UUID lookup)
 *   → prisma.matchEvent.findFirst({ matchId: match.id, playerId: { not: null } })
 *   → player found → create PlayerVideo
 *
 * If no match or no player is found for a highlight, it is silently skipped.
 *
 * Checkpoint: uses ApiStrategyCache (key: "highlights_checkpoint") to persist
 * the last ingested Sportmonks highlight ID across deploys.
 */

import { prisma } from "../lib/prisma";
import {
  fetchHighlightsBulk,
  fetchHighlightsAfterById,
} from "../integrations/sportmonks/sportmonks.client";
import type { SportmonksHighlight } from "../integrations/sportmonks/sportmonks.types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHECKPOINT_KEY = "highlights_checkpoint";
const ADDED_BY = "Sistema SoccerMind";
const DELAY_BETWEEN_PAGES_MS = 500;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function detectSource(url: string): string {
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "YOUTUBE";
  if (url.includes("vimeo.com")) return "VIMEO";
  return "UPLOAD";
}

function extractYoutubeThumbnail(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  return match?.[1]
    ? `https://img.youtube.com/vi/${match[1]}/mqdefault.jpg`
    : null;
}

function buildVideoTitle(highlight: SportmonksHighlight): string {
  if (highlight.scoreboard) return `Highlight — ${highlight.scoreboard}`;
  if (highlight.fixture?.name) return `Highlight — ${highlight.fixture.name}`;
  return `Highlight #${highlight.id}`;
}

// ---------------------------------------------------------------------------
// Checkpoint helpers (ApiStrategyCache)
// ---------------------------------------------------------------------------

async function readCheckpoint(): Promise<number> {
  try {
    const row = await prisma.apiStrategyCache.findUnique({
      where: { key: CHECKPOINT_KEY },
    });
    if (!row) return 0;
    const data = row.data as { lastId?: number };
    return typeof data.lastId === "number" ? data.lastId : 0;
  } catch {
    return 0;
  }
}

async function writeCheckpoint(lastId: number): Promise<void> {
  const FAR_FUTURE = new Date("2099-12-31T00:00:00Z");
  await prisma.apiStrategyCache.upsert({
    where: { key: CHECKPOINT_KEY },
    create: { key: CHECKPOINT_KEY, data: { lastId }, expiresAt: FAR_FUTURE },
    update: { data: { lastId }, expiresAt: FAR_FUTURE },
  });
}

// ---------------------------------------------------------------------------
// Core: process one batch of highlights
// ---------------------------------------------------------------------------

interface IngestBatchResult {
  processed: number;
  ingested: number;
  skipped: number;
  maxId: number;
}

async function processBatch(
  highlights: SportmonksHighlight[],
): Promise<IngestBatchResult> {
  let ingested = 0;
  let skipped = 0;
  let maxId = 0;

  for (const highlight of highlights) {
    if (highlight.id > maxId) maxId = highlight.id;

    // Must have a video URL
    if (!highlight.location?.trim()) {
      skipped++;
      continue;
    }

    // Deduplication: skip if URL already stored
    const existing = await prisma.playerVideo.findFirst({
      where: { url: highlight.location },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }

    // Resolve player via fixture → match → event chain
    if (!highlight.fixture_id) {
      skipped++;
      continue;
    }

    const match = await prisma.match.findUnique({
      where: { externalId: highlight.fixture_id },
      select: { id: true },
    });
    if (!match) {
      skipped++;
      continue;
    }

    const event = await prisma.matchEvent.findFirst({
      where: { matchId: match.id, playerId: { not: null } },
      select: { playerId: true },
    });
    if (!event?.playerId) {
      skipped++;
      continue;
    }

    // Build record
    const source = detectSource(highlight.location);
    const thumbnail =
      source === "YOUTUBE" ? extractYoutubeThumbnail(highlight.location) : null;

    await prisma.playerVideo.create({
      data: {
        playerId: event.playerId,
        title: buildVideoTitle(highlight),
        description: highlight.fixture?.name ?? null,
        type: "HIGHLIGHT",
        source,
        url: highlight.location,
        thumbnail,
        duration: null,
        season: highlight.fixture?.season_id
          ? String(highlight.fixture.season_id)
          : null,
        tags: ["highlight", "sportmonks"],
        addedBy: ADDED_BY,
      },
    });

    ingested++;
  }

  return { processed: highlights.length, ingested, skipped, maxId };
}

// ---------------------------------------------------------------------------
// Public: bulk ingestion (first-time bootstrap)
// ---------------------------------------------------------------------------

export interface HighlightsIngestionSummary {
  mode: "bulk" | "incremental";
  totalFetched: number;
  totalIngested: number;
  totalSkipped: number;
}

export async function runHighlightsBulkIngestion(): Promise<HighlightsIngestionSummary> {
  console.log("[highlights] Starting bulk ingestion...");

  // fetchHighlightsBulk already paginates via smGetAll — returns all pages merged
  const allHighlights = await fetchHighlightsBulk(50);
  console.log(`[highlights] Fetched ${allHighlights.length} highlights from API`);

  // Process in slices to log progress without hammering the DB
  const SLICE = 200;
  let totalIngested = 0;
  let totalSkipped = 0;
  let maxId = 0;

  for (let offset = 0; offset < allHighlights.length; offset += SLICE) {
    const slice = allHighlights.slice(offset, offset + SLICE);
    const result = await processBatch(slice);

    totalIngested += result.ingested;
    totalSkipped += result.skipped;
    if (result.maxId > maxId) maxId = result.maxId;

    console.log(
      `[highlights] Progress: ${offset + slice.length}/${allHighlights.length} ` +
      `— ingested ${result.ingested}, skipped ${result.skipped}`,
    );

    // Throttle between slices to avoid DB overload
    if (offset + SLICE < allHighlights.length) await sleep(DELAY_BETWEEN_PAGES_MS);
  }

  if (maxId > 0) await writeCheckpoint(maxId);

  console.log(
    `[highlights] Bulk done. Ingested: ${totalIngested}, Skipped: ${totalSkipped}`,
  );

  return {
    mode: "bulk",
    totalFetched: allHighlights.length,
    totalIngested,
    totalSkipped,
  };
}

// ---------------------------------------------------------------------------
// Public: incremental sync (periodic runs)
// ---------------------------------------------------------------------------

export async function runHighlightsIncrementalSync(): Promise<HighlightsIngestionSummary> {
  const lastId = await readCheckpoint();

  if (lastId === 0) {
    console.log("[highlights] No checkpoint found — falling back to bulk ingestion");
    return runHighlightsBulkIngestion();
  }

  console.log(`[highlights] Incremental sync since ID ${lastId}`);

  const newHighlights = await fetchHighlightsAfterById(lastId, 10);
  console.log(`[highlights] Fetched ${newHighlights.length} new highlights`);

  if (newHighlights.length === 0) {
    return { mode: "incremental", totalFetched: 0, totalIngested: 0, totalSkipped: 0 };
  }

  const result = await processBatch(newHighlights);

  if (result.maxId > lastId) await writeCheckpoint(result.maxId);

  console.log(
    `[highlights] Incremental done. Ingested: ${result.ingested}, Skipped: ${result.skipped}`,
  );

  return {
    mode: "incremental",
    totalFetched: newHighlights.length,
    totalIngested: result.ingested,
    totalSkipped: result.skipped,
  };
}
