/**
 * highlights.ingestion.ts
 *
 * Pipeline that fetches Sportmonks highlights and persists them as PlayerVideo
 * records, linked to a player via the match → match events chain.
 *
 * Strategy (fixture-based):
 *   1. Fetch all Match records from the DB that have an externalId.
 *   2. For each fixture, call GET /fixtures/{id}?include=highlights.
 *   3. For each highlight URL, resolve the player via MatchEvent and create
 *      a PlayerVideo if the URL was not already ingested.
 *
 * ⚠ PLAN RESTRICTION: The Sportmonks "highlights" include requires a plan
 *   that grants access to it (HTTP 403, code 5002 if unavailable).
 *   fetchFixtureHighlights degrades gracefully — returns [] on 403 — so the
 *   pipeline will complete without crashing but ingest 0 highlights until the
 *   plan is upgraded.
 *
 * Deduplication: checked via PlayerVideo.url before each create.
 * Rate limiting: 300 ms delay between fixture batches of 10.
 */

import { prisma } from "../lib/prisma";
import {
  fetchFixtureHighlights,
} from "../integrations/sportmonks/sportmonks.client";
import type { SportmonksHighlight } from "../integrations/sportmonks/sportmonks.types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ADDED_BY = "Sistema SoccerMind";
const BATCH_SIZE = 10;
const DELAY_BETWEEN_BATCHES_MS = 300;

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

function buildTitle(highlight: SportmonksHighlight, fixtureId: number): string {
  if (highlight.scoreboard) return `Highlight — ${highlight.scoreboard}`;
  if (highlight.fixture?.name) return `Highlight — ${highlight.fixture.name}`;
  return `Highlight — Fixture ${fixtureId}`;
}

// ---------------------------------------------------------------------------
// Process one fixture's highlights
// ---------------------------------------------------------------------------

interface FixtureResult {
  ingested: number;
  skipped: number;
}

async function processFixtureHighlights(
  matchId: string,
  externalId: number,
  processedUrls: Set<string>,
): Promise<FixtureResult> {
  const highlights = await fetchFixtureHighlights(externalId);

  let ingested = 0;
  let skipped = 0;

  for (const highlight of highlights) {
    const url = highlight.location?.trim() ?? "";
    if (!url || processedUrls.has(url)) {
      skipped++;
      continue;
    }

    // Resolve player via MatchEvent
    const event = await prisma.matchEvent.findFirst({
      where: { matchId, playerId: { not: null } },
      select: { playerId: true },
    });

    if (!event?.playerId) {
      skipped++;
      continue;
    }

    const source = detectSource(url);
    const thumbnail = source === "YOUTUBE" ? extractYoutubeThumbnail(url) : null;

    await prisma.playerVideo.create({
      data: {
        playerId: event.playerId,
        title: buildTitle(highlight, externalId),
        description: highlight.fixture?.name ?? null,
        type: "HIGHLIGHT",
        source,
        url,
        thumbnail,
        duration: null,
        season: highlight.fixture?.season_id
          ? String(highlight.fixture.season_id)
          : null,
        tags: ["highlight", "sportmonks"],
        addedBy: ADDED_BY,
      },
    });

    processedUrls.add(url);
    ingested++;
  }

  return { ingested, skipped };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface HighlightsIngestionSummary {
  mode: "bulk" | "incremental";
  totalFetched: number;
  totalIngested: number;
  totalSkipped: number;
  planRestricted?: boolean;
}

/**
 * Bulk ingestion: iterates over all Match records in the DB and fetches
 * highlights for each fixture from Sportmonks.
 *
 * Safe to call multiple times — already-ingested URLs are skipped.
 * Degrades gracefully if the Sportmonks plan does not include highlights.
 */
export async function runHighlightsBulkIngestion(): Promise<HighlightsIngestionSummary> {
  console.log("[highlights] Starting fixture-based bulk ingestion...");

  // Load all already-ingested URLs for deduplication
  const existing = await prisma.playerVideo.findMany({
    where: { tags: { has: "sportmonks" } },
    select: { url: true },
  });
  const processedUrls = new Set(existing.map((v) => v.url));

  // All matches with a Sportmonks externalId
  const matches = await prisma.match.findMany({
    select: { id: true, externalId: true },
    orderBy: { externalId: "desc" },
  });

  const validMatches = matches.filter((m) => m.externalId !== null) as Array<{
    id: string;
    externalId: number;
  }>;

  console.log(`[highlights] Total fixtures to process: ${validMatches.length}`);

  let totalIngested = 0;
  let totalSkipped = 0;
  let planRestricted = false;

  for (let i = 0; i < validMatches.length; i += BATCH_SIZE) {
    const batch = validMatches.slice(i, i + BATCH_SIZE);

    for (const match of batch) {
      const result = await processFixtureHighlights(
        match.id,
        match.externalId,
        processedUrls,
      );
      totalIngested += result.ingested;
      totalSkipped += result.skipped;
    }

    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(validMatches.length / BATCH_SIZE);

    console.log(
      `[highlights] Batch ${batchNum}/${totalBatches} done — ` +
      `ingested so far: ${totalIngested}`,
    );

    if (i + BATCH_SIZE < validMatches.length) {
      await sleep(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  // If nothing was ingested but there were matches to process, flag plan restriction
  if (totalIngested === 0 && validMatches.length > 0) {
    planRestricted = true;
    console.warn(
      "[highlights] 0 highlights ingested. " +
      "This likely means the Sportmonks plan does not include the 'highlights' relation. " +
      "Upgrade the plan to access highlight data.",
    );
  }

  console.log(
    `[highlights] Bulk done. Ingested: ${totalIngested}, Skipped: ${totalSkipped}`,
  );

  return {
    mode: "bulk",
    totalFetched: validMatches.length,
    totalIngested,
    totalSkipped,
    planRestricted,
  };
}

/**
 * Incremental sync: same as bulk but only processes the N most recent fixtures
 * (by externalId descending). Useful for periodic runs to pick up highlights
 * from recently ingested matches.
 *
 * Default: last 100 fixtures.
 */
export async function runHighlightsIncrementalSync(
  limit = 100,
): Promise<HighlightsIngestionSummary> {
  console.log(`[highlights] Incremental sync — last ${limit} fixtures`);

  // Load all already-ingested URLs for deduplication
  const existing = await prisma.playerVideo.findMany({
    where: { tags: { has: "sportmonks" } },
    select: { url: true },
  });
  const processedUrls = new Set(existing.map((v) => v.url));

  const matches = await prisma.match.findMany({
    take: limit,
    select: { id: true, externalId: true },
    orderBy: { externalId: "desc" },
  });

  const validMatches = matches.filter((m) => m.externalId !== null) as Array<{
    id: string;
    externalId: number;
  }>;

  console.log(`[highlights] Processing ${validMatches.length} recent fixtures`);

  let totalIngested = 0;
  let totalSkipped = 0;
  let planRestricted = false;

  for (let i = 0; i < validMatches.length; i += BATCH_SIZE) {
    const batch = validMatches.slice(i, i + BATCH_SIZE);

    for (const match of batch) {
      const result = await processFixtureHighlights(
        match.id,
        match.externalId,
        processedUrls,
      );
      totalIngested += result.ingested;
      totalSkipped += result.skipped;
    }

    if (i + BATCH_SIZE < validMatches.length) {
      await sleep(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  if (totalIngested === 0 && validMatches.length > 0) {
    planRestricted = true;
    console.warn(
      "[highlights] 0 highlights ingested. " +
      "Sportmonks plan may not include the 'highlights' relation.",
    );
  }

  console.log(
    `[highlights] Incremental done. Ingested: ${totalIngested}, Skipped: ${totalSkipped}`,
  );

  return {
    mode: "incremental",
    totalFetched: validMatches.length,
    totalIngested,
    totalSkipped,
    planRestricted,
  };
}
