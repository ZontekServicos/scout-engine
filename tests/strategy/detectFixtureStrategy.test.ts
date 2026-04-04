/**
 * tests/strategy/detectFixtureStrategy.test.ts
 *
 * Tests strategy detection, cache behaviour, and fallback rotation.
 * Mocks: fetch (API), fs (cache file), sportmonks.client functions.
 */

import { jest } from "@jest/globals";
import { makeFixture, mockOkResponse, mockErrorResponse, paginatedResponse } from "../helpers/fixtures";

process.env.SPORTMONKS_API_TOKEN = "test-token";

// Mock fs to prevent reading/writing filter-support.json on disk
jest.mock("fs", () => ({
  existsSync: jest.fn().mockReturnValue(false),
  readFileSync: jest.fn().mockReturnValue("{}"),
  writeFileSync: jest.fn(),
}));

describe("detectFixtureStrategy", () => {
  let mockFetch: jest.MockedFunction<typeof fetch>;
  let clearStrategyCache: () => void;
  let detectFixtureStrategy: (id: number, seasonId?: number) => Promise<{ strategy: string; confirmedAt: string; expiresAt: string }>;
  let fetchFixturesSmart: (opts: { leagueId: number; maxPages?: number }) => Promise<unknown[]>;

  beforeEach(async () => {
    jest.resetModules();

    // Reset fs mock to "no cache file"
    const fsMock = await import("fs");
    (fsMock.existsSync as jest.Mock).mockReturnValue(false);
    (fsMock.writeFileSync as jest.Mock).mockImplementation(() => {});

    mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
    global.fetch = mockFetch;

    const strategy = await import("../../src/integrations/sportmonks/sportmonks.strategy");
    clearStrategyCache = strategy.clearStrategyCache;
    detectFixtureStrategy = strategy.detectFixtureStrategy;
    fetchFixturesSmart = strategy.fetchFixturesSmart;
  });

  it("selects FILTER_LEAGUE_ID when filters=league_id:X works", async () => {
    mockFetch.mockResolvedValue(
      mockOkResponse(paginatedResponse([makeFixture()])),
    );

    const entry = await detectFixtureStrategy(648);

    expect(entry.strategy).toBe("FILTER_LEAGUE_ID");
  });

  it("falls back to FILTER_SEASON_ID when league filter returns 400", async () => {
    // First call (league filter probe) → 400
    mockFetch
      .mockResolvedValueOnce(mockErrorResponse(400, "filter not supported"))
      // Second call (season filter probe) → 200
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

  it("writes detected strategy to cache (fs.writeFileSync called)", async () => {
    const fs = await import("fs");
    mockFetch.mockResolvedValue(mockOkResponse(paginatedResponse([makeFixture()])));

    await detectFixtureStrategy(648);

    expect(fs.writeFileSync).toHaveBeenCalled();
    const written = (fs.writeFileSync as jest.Mock).mock.calls[0][1] as string;
    const parsed = JSON.parse(written);
    expect(parsed.strategies).toBeDefined();
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

    const fsMock = await import("fs");
    (fsMock.existsSync as jest.Mock).mockReturnValue(false);
    (fsMock.writeFileSync as jest.Mock).mockImplementation(() => {});

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

  it("auto-rotates to next strategy if cached strategy fails at runtime", async () => {
    // Simulate: detection succeeds (FILTER_LEAGUE_ID cached)
    // but actual runtime call fails → should rotate and retry with next strategy

    const fixture = makeFixture({ id: 42 });

    // probe = success (detection caches FILTER_LEAGUE_ID)
    mockFetch
      .mockResolvedValueOnce(mockOkResponse(paginatedResponse([fixture])))   // probe ok
      .mockResolvedValueOnce(mockErrorResponse(400, "now broken"))            // first smart call fails
      .mockResolvedValueOnce(mockOkResponse(paginatedResponse([fixture])));   // fallback ok

    const results = await fetchFixturesSmart({ leagueId: 648, maxPages: 1 });

    expect(Array.isArray(results)).toBe(true);
  });

  it("filters fixtures by league_id in BULK_CLIENT_SIDE strategy", async () => {
    // Force BULK_CLIENT_SIDE by making all filter probes fail
    const wrongLeague = makeFixture({ id: 1, league_id: 999 });
    const rightLeague = makeFixture({ id: 2, league_id: 648 });

    mockFetch
      .mockResolvedValueOnce(mockErrorResponse(400, ""))   // probe fails
      .mockResolvedValueOnce(mockErrorResponse(400, ""))   // season probe fails (no seasonId)
      // BULK_CLIENT_SIDE: returns both fixtures, should filter to league 648
      .mockResolvedValueOnce(mockOkResponse(paginatedResponse([wrongLeague, rightLeague])));

    const results = await fetchFixturesSmart({ leagueId: 648, maxPages: 1 });

    // Only the fixture matching league_id=648 should be returned
    expect(results).toHaveLength(1);
    expect((results[0] as { league_id: number }).league_id).toBe(648);
  });
});
