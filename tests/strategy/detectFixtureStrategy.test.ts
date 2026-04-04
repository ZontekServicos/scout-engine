/**
 * tests/strategy/detectFixtureStrategy.test.ts
 *
 * Tests strategy detection, DB cache behaviour, and fallback rotation.
 * Mocks: fetch (API calls), prisma.apiStrategyCache (DB cache).
 */

import { jest } from "@jest/globals";
import { makeFixture, mockOkResponse, mockErrorResponse, paginatedResponse } from "../helpers/fixtures";
import { prismaMock, resetPrismaMock } from "../helpers/prisma.mock";

process.env.SPORTMONKS_API_TOKEN = "test-token";

// Mock prisma so DB cache never hits a real database
jest.mock("../../src/lib/prisma", () => ({ prisma: prismaMock }));

// ---------------------------------------------------------------------------
// Helpers: default cache-miss behaviour (findUnique → null, upsert → ok)
// ---------------------------------------------------------------------------

function setupCacheMiss() {
  prismaMock.apiStrategyCache.findUnique.mockResolvedValue(null as never);
  prismaMock.apiStrategyCache.upsert.mockResolvedValue({} as never);
}

// ---------------------------------------------------------------------------
// detectFixtureStrategy
// ---------------------------------------------------------------------------

describe("detectFixtureStrategy", () => {
  let mockFetch: jest.MockedFunction<typeof fetch>;
  let detectFixtureStrategy: (id: number, seasonId?: number) => Promise<{
    strategy: string;
    confirmedAt: string;
    expiresAt: string;
    supportsFilters: boolean;
  }>;

  beforeEach(async () => {
    jest.resetModules();
    resetPrismaMock();
    setupCacheMiss();

    mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
    global.fetch = mockFetch;

    const strategy = await import("../../src/integrations/sportmonks/sportmonks.strategy");
    detectFixtureStrategy = strategy.detectFixtureStrategy;
  });

  it("selects FILTER_LEAGUE_ID when filters=league_id:X works", async () => {
    mockFetch.mockResolvedValue(mockOkResponse(paginatedResponse([makeFixture()])));

    const entry = await detectFixtureStrategy(648);

    expect(entry.strategy).toBe("FILTER_LEAGUE_ID");
  });

  it("falls back to FILTER_SEASON_ID when league filter returns 400", async () => {
    mockFetch
      .mockResolvedValueOnce(mockErrorResponse(400, "filter not supported"))
      .mockResolvedValueOnce(mockOkResponse(paginatedResponse([makeFixture()])));

    const entry = await detectFixtureStrategy(648, 25580);

    expect(entry.strategy).toBe("FILTER_SEASON_ID");
  });

  it("falls back to BULK_CLIENT_SIDE when all filter strategies fail", async () => {
    mockFetch.mockResolvedValue(mockErrorResponse(400, "filters unsupported"));

    const entry = await detectFixtureStrategy(648, 25580);

    expect(entry.strategy).toBe("BULK_CLIENT_SIDE");
  });

  it("falls back to BULK_CLIENT_SIDE when no seasonId provided and league filter fails", async () => {
    mockFetch.mockResolvedValue(mockErrorResponse(400, ""));

    const entry = await detectFixtureStrategy(648); // no seasonId

    expect(entry.strategy).toBe("BULK_CLIENT_SIDE");
  });

  it("includes confirmedAt and expiresAt timestamps", async () => {
    mockFetch.mockResolvedValue(mockOkResponse(paginatedResponse([makeFixture()])));

    const entry = await detectFixtureStrategy(648);

    expect(new Date(entry.confirmedAt).getTime()).not.toBeNaN();
    expect(new Date(entry.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("writes detected strategy to DB cache (apiStrategyCache.upsert called)", async () => {
    mockFetch.mockResolvedValue(mockOkResponse(paginatedResponse([makeFixture()])));

    await detectFixtureStrategy(648);

    expect(prismaMock.apiStrategyCache.upsert).toHaveBeenCalledTimes(1);
    const call = prismaMock.apiStrategyCache.upsert.mock.calls[0][0] as {
      where: { key: string };
      create: { key: string; data: unknown };
    };
    expect(call.where.key).toBe("fixtures_by_league_v3");
    expect((call.create.data as { strategy: string }).strategy).toBe("FILTER_LEAGUE_ID");
  });

  it("returns cached strategy without probing when cache is fresh", async () => {
    const cachedEntry = {
      strategy: "FILTER_LEAGUE_ID",
      supportsFilters: true,
      confirmedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    };
    prismaMock.apiStrategyCache.findUnique.mockResolvedValue({
      key: "fixtures_by_league_v3",
      data: cachedEntry,
      expiresAt: new Date(Date.now() + 3_600_000),
      updatedAt: new Date(),
    } as never);

    const entry = await detectFixtureStrategy(648);

    expect(entry.strategy).toBe("FILTER_LEAGUE_ID");
    // fetch should NOT be called — cache hit, no probe needed
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("re-probes when cached entry is expired", async () => {
    // Return an expired cache row
    prismaMock.apiStrategyCache.findUnique.mockResolvedValue({
      key: "fixtures_by_league_v3",
      data: { strategy: "BULK_CLIENT_SIDE", expiresAt: new Date(Date.now() - 1000).toISOString() },
      expiresAt: new Date(Date.now() - 1000), // expired
      updatedAt: new Date(),
    } as never);
    mockFetch.mockResolvedValue(mockOkResponse(paginatedResponse([makeFixture()])));

    const entry = await detectFixtureStrategy(648);

    // Should re-probe and find FILTER_LEAGUE_ID
    expect(entry.strategy).toBe("FILTER_LEAGUE_ID");
    expect(mockFetch).toHaveBeenCalled();
  });

  it("falls through to BULK_CLIENT_SIDE when probe gets a transient 429 (probe is best-effort)", async () => {
    // During detection, transient errors are treated like permanent ones for probe purposes.
    // We can't afford to block detection — BULK_CLIENT_SIDE always works as a last resort.
    mockFetch.mockResolvedValue(mockErrorResponse(429, "rate limited"));

    const entry = await detectFixtureStrategy(648);

    expect(entry.strategy).toBe("BULK_CLIENT_SIDE");
    // Cache should be written so we don't re-probe on every call
    expect(prismaMock.apiStrategyCache.upsert).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// fetchFixturesSmart — strategy execution + runtime fallback
// ---------------------------------------------------------------------------

describe("fetchFixturesSmart", () => {
  let mockFetch: jest.MockedFunction<typeof fetch>;
  let fetchFixturesSmart: (opts: {
    leagueId: number;
    seasonId?: number;
    maxPages?: number;
  }) => Promise<unknown[]>;

  beforeEach(async () => {
    jest.resetModules();
    resetPrismaMock();
    setupCacheMiss();

    mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
    global.fetch = mockFetch;

    const strategy = await import("../../src/integrations/sportmonks/sportmonks.strategy");
    fetchFixturesSmart = strategy.fetchFixturesSmart;
  });

  it("returns fixtures when FILTER_LEAGUE_ID strategy works", async () => {
    const fixture = makeFixture({ id: 999 });
    // probe (page 1) + actual fetch (page 1)
    mockFetch.mockResolvedValue(mockOkResponse(paginatedResponse([fixture])));

    const results = await fetchFixturesSmart({ leagueId: 648, maxPages: 1 });

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it("auto-rotates to BULK_CLIENT_SIDE when cached FILTER_LEAGUE_ID fails at runtime (permanent error)", async () => {
    const fixture = makeFixture({ id: 42, league_id: 648 });

    // Probe succeeds → caches FILTER_LEAGUE_ID
    // Smart call #1 fails with 400 (permanent) → rotates to BULK_CLIENT_SIDE
    // Bulk call succeeds
    mockFetch
      .mockResolvedValueOnce(mockOkResponse(paginatedResponse([fixture]))) // probe ok
      .mockResolvedValueOnce(mockErrorResponse(400, "now broken"))          // smart call fails
      .mockResolvedValueOnce(mockOkResponse(paginatedResponse([fixture]))); // bulk fallback

    const results = await fetchFixturesSmart({ leagueId: 648, maxPages: 1 });

    expect(Array.isArray(results)).toBe(true);
  });

  it("does NOT rotate on transient error (429) — propagates to caller", async () => {
    // Probe succeeds, but runtime call hits 429 (transient)
    mockFetch
      .mockResolvedValueOnce(mockOkResponse(paginatedResponse([makeFixture()])))
      .mockResolvedValueOnce(mockErrorResponse(429, "rate limit"));

    await expect(fetchFixturesSmart({ leagueId: 648, maxPages: 1 })).rejects.toThrow();
  });

  it("filters fixtures by league_id in BULK_CLIENT_SIDE strategy", async () => {
    const wrongLeague = makeFixture({ id: 1, league_id: 999 });
    const rightLeague = makeFixture({ id: 2, league_id: 648 });

    // Force BULK_CLIENT_SIDE by making probes fail
    mockFetch
      .mockResolvedValueOnce(mockErrorResponse(400, ""))   // league probe fails
      .mockResolvedValueOnce(mockErrorResponse(400, ""))   // season probe fails (no seasonId)
      .mockResolvedValueOnce(mockOkResponse(paginatedResponse([wrongLeague, rightLeague])));

    const results = await fetchFixturesSmart({ leagueId: 648, maxPages: 1 });

    expect(results).toHaveLength(1);
    expect((results[0] as { league_id: number }).league_id).toBe(648);
  });
});
