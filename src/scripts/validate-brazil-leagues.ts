/**
 * validate-brazil-leagues.ts
 *
 * Reads leagues.json, filters Brazil leagues, validates each one against
 * the Sportmonks API, classifies the result, and writes three output files:
 *
 *   src/data/brazil-leagues-full.json     — fixtures + events + coordinates
 *   src/data/brazil-leagues-partial.json  — fixtures/events but no x/y
 *   src/data/brazil-leagues-empty.json    — no usable data from API
 *
 * Classification:
 *   FULL    → has at least one event with x and y coordinates
 *   PARTIAL → has fixtures and/or events but no spatial coordinates
 *   EMPTY   → no fixtures returned (or API error)
 *
 * Run:
 *   npx ts-node src/scripts/validate-brazil-leagues.ts
 *   (requires SPORTMONKS_API_TOKEN in .env)
 *
 * Optimisations:
 *   - p-limit(CONCURRENCY) to avoid 429s
 *   - File-based cache (validation-cache.json) so re-runs don't re-hit the API
 *   - Exponential-backoff retry on 429/5xx
 *   - Per-league try/catch — one failure never aborts the run
 */

import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import pLimit from "p-limit";
import type { LeagueSeed } from "./parse-leagues";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LeagueStatus = "FULL" | "PARTIAL" | "EMPTY";

export interface LeagueValidation extends LeagueSeed {
  status: LeagueStatus;
  fixtureId: number | null;   // first fixture found
  eventCount: number;         // total events on that fixture
  coordCount: number;         // events with x AND y
  validatedAt: string;        // ISO timestamp
  error?: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CONCURRENCY = 2;            // parallel leagues (keep low — API rate limit)
const MAX_RETRIES = 3;            // retries on 429 / 5xx
const BASE_DELAY_MS = 1_000;      // initial retry delay (doubles each attempt)

const LEAGUES_PATH  = path.resolve(__dirname, "leagues.json");
const CACHE_PATH    = path.resolve(__dirname, "validation-cache.json");
const DATA_DIR      = path.resolve(__dirname, "../data");

const OUT_FULL      = path.join(DATA_DIR, "brazil-leagues-full.json");
const OUT_PARTIAL   = path.join(DATA_DIR, "brazil-leagues-partial.json");
const OUT_EMPTY     = path.join(DATA_DIR, "brazil-leagues-empty.json");

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const log = (msg: string) =>
  console.log(`[validate] ${new Date().toISOString().slice(11, 19)}  ${msg}`);

// ---------------------------------------------------------------------------
// HTTP helper with retry + backoff
// ---------------------------------------------------------------------------

function getToken(): string {
  const token = process.env.SPORTMONKS_API_TOKEN;
  if (!token) throw new Error("SPORTMONKS_API_TOKEN not set in environment");
  return token;
}

async function smFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`https://api.sportmonks.com/v3/football${path}`);
  url.searchParams.set("api_token", getToken());
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  let lastError: Error = new Error("unknown");

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });

    if (res.ok) return res.json() as Promise<T>;

    // Rate limit or server error → back off and retry
    if (res.status === 429 || res.status >= 500) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      log(`  ⚠ HTTP ${res.status} on ${path} — retry in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(delay);
      lastError = new Error(`HTTP ${res.status}`);
      continue;
    }

    // 4xx (except 429) → not retryable
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  throw lastError;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Cache (file-based)
// ---------------------------------------------------------------------------

function loadCache(): Map<number, LeagueValidation> {
  if (!fs.existsSync(CACHE_PATH)) return new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8")) as LeagueValidation[];
    return new Map(raw.map((r) => [r.id, r]));
  } catch {
    return new Map();
  }
}

function saveCache(cache: Map<number, LeagueValidation>) {
  fs.writeFileSync(CACHE_PATH, JSON.stringify([...cache.values()], null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Validation logic
// ---------------------------------------------------------------------------

interface FixturePage {
  data?: Array<{ id: number }>;
}

interface EventPage {
  data?: Array<{
    id: number;
    coordinates?: { x?: number | null; y?: number | null } | null;
  }>;
}

async function validateLeague(league: LeagueSeed): Promise<LeagueValidation> {
  // 1. Fetch one fixture for this league
  const fixturePage = await smFetch<FixturePage>("/fixtures", {
    filters: `league_id:${league.id}`,
    per_page: "1",
  });

  const fixtures = fixturePage.data ?? [];

  if (fixtures.length === 0) {
    return {
      ...league,
      status: "EMPTY",
      fixtureId: null,
      eventCount: 0,
      coordCount: 0,
      validatedAt: new Date().toISOString(),
    };
  }

  const fixtureId = fixtures[0].id;

  // 2. Fetch events for that fixture
  const eventPage = await smFetch<EventPage>("/events", {
    filters: `fixture_id:${fixtureId}`,
  });

  const events = eventPage.data ?? [];
  const eventCount = events.length;
  const coordCount = events.filter(
    (e) => e.coordinates?.x != null && e.coordinates?.y != null,
  ).length;

  let status: LeagueStatus;
  if (coordCount > 0) {
    status = "FULL";
  } else if (eventCount > 0 || fixtures.length > 0) {
    status = "PARTIAL";
  } else {
    status = "EMPTY";
  }

  return {
    ...league,
    status,
    fixtureId,
    eventCount,
    coordCount,
    validatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Load and filter
  const allLeagues = JSON.parse(fs.readFileSync(LEAGUES_PATH, "utf-8")) as LeagueSeed[];
  const brazilLeagues = allLeagues.filter((l) =>
    l.country.toLowerCase().includes("brazil"),
  );

  log(`Found ${brazilLeagues.length} Brazil leagues in leagues.json`);

  // Load validation cache
  const cache = loadCache();
  const cached   = brazilLeagues.filter((l) => cache.has(l.id));
  const needsVal = brazilLeagues.filter((l) => !cache.has(l.id));

  log(`Cached: ${cached.length}  Need validation: ${needsVal.length}`);

  // Validate uncached leagues
  const limit = pLimit(CONCURRENCY);
  const results: LeagueValidation[] = [...cached.map((l) => cache.get(l.id)!)];

  await Promise.all(
    needsVal.map((league, i) =>
      limit(async () => {
        const tag = `[${i + 1}/${needsVal.length}] "${league.name}" (id=${league.id})`;
        log(`▶ ${tag}`);
        try {
          const validation = await validateLeague(league);
          cache.set(league.id, validation);
          results.push(validation);

          const icon = validation.status === "FULL" ? "✓" : validation.status === "PARTIAL" ? "~" : "✗";
          log(`  ${icon} ${validation.status}  fixture=${validation.fixtureId ?? "none"}  events=${validation.eventCount}  coords=${validation.coordCount}`);
        } catch (err) {
          const msg = (err as Error).message;
          log(`  ✗ Error: ${msg}`);
          const row: LeagueValidation = {
            ...league,
            status: "EMPTY",
            fixtureId: null,
            eventCount: 0,
            coordCount: 0,
            validatedAt: new Date().toISOString(),
            error: msg,
          };
          cache.set(league.id, row);
          results.push(row);
        }
      }),
    ),
  );

  // Persist cache after all validations
  saveCache(cache);

  // Classify
  const full    = results.filter((r) => r.status === "FULL");
  const partial = results.filter((r) => r.status === "PARTIAL");
  const empty   = results.filter((r) => r.status === "EMPTY");

  // Write output files
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OUT_FULL,    JSON.stringify(full,    null, 2), "utf-8");
  fs.writeFileSync(OUT_PARTIAL, JSON.stringify(partial, null, 2), "utf-8");
  fs.writeFileSync(OUT_EMPTY,   JSON.stringify(empty,   null, 2), "utf-8");

  // Summary
  log("");
  log("── Results ──────────────────────────────────────────────");
  log(`  FULL    (events + coords) : ${full.length}`);
  if (full.length > 0) full.forEach((l) => log(`    ✓ ${l.name} (id=${l.id})`));
  log(`  PARTIAL (events, no x/y)  : ${partial.length}`);
  if (partial.length > 0) partial.forEach((l) => log(`    ~ ${l.name} (id=${l.id})`));
  log(`  EMPTY   (no usable data)  : ${empty.length}`);
  log("─────────────────────────────────────────────────────────");
  log(`  brazil-leagues-full.json    → ${full.length} leagues`);
  log(`  brazil-leagues-partial.json → ${partial.length} leagues`);
  log(`  brazil-leagues-empty.json   → ${empty.length} leagues`);
  log(`  validation-cache.json       → ${cache.size} entries (re-runs skip API)`);
  log("Done.");
}

main().catch((err) => {
  console.error("[validate] Fatal:", err);
  process.exit(1);
});
