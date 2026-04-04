/**
 * tests/failure/scenarios.test.ts
 *
 * Tests that the pipeline degrades gracefully under adverse conditions:
 *   - API offline / network timeout
 *   - Persistent rate limiting (429)
 *   - Partial data (events without coordinates)
 *   - DB write failures
 */

import { jest } from "@jest/globals";
import { makeFixture, makeEvent, makeLeague, paginatedResponse, singleResponse } from "../helpers/fixtures";
import { prismaMock, resetPrismaMock } from "../helpers/prisma.mock";

process.env.SPORTMONKS_API_TOKEN = "test-token";

jest.mock("../../src/lib/prisma", () => ({ prisma: prismaMock }));
jest.mock("fs", () => ({
  existsSync: jest.fn().mockReturnValue(false),
  readFileSync: jest.fn().mockReturnValue("{}"),
  writeFileSync: jest.fn(),
}));

function okResponse(body: unknown) {
  return {
    ok: true, status: 200, headers: new Headers(),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(""),
  } as unknown as Response;
}

function errResponse(status: number, body = "") {
  return {
    ok: false, status, statusText: String(status), headers: new Headers(),
    json: () => Promise.reject(new Error("err")),
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

function rl429Response() {
  return {
    ok: false, status: 429, statusText: "Too Many Requests",
    headers: new Headers({ "Retry-After": "0" }),
    json: () => Promise.reject(new Error("429")),
    text: () => Promise.resolve('{"message":"rate limit"}'),
  } as unknown as Response;
}

describe("Failure scenarios", () => {
  let mockFetch: jest.MockedFunction<typeof fetch>;
  let ingestLeagueViaFixtures: (id: number, opts?: Record<string, unknown>) => Promise<{
    fixturesIngested: number;
    eventsTotal: number;
  }>;
  let bootstrapFixtures: (maxPages?: number) => Promise<{
    matchesUpserted: number;
    errors: number;
  }>;
  let fetchWithRetry: (url: string) => Promise<Response>;

  beforeEach(async () => {
    jest.resetModules();
    jest.mock("../../src/lib/prisma", () => ({ prisma: prismaMock }));
    jest.mock("fs", () => ({
      existsSync: jest.fn().mockReturnValue(false),
      readFileSync: jest.fn().mockReturnValue("{}"),
      writeFileSync: jest.fn(),
    }));

    resetPrismaMock();
    prismaMock.country.upsert.mockResolvedValue({ id: "c" } as never);
    prismaMock.league.upsert.mockResolvedValue({ id: "l", name: "Serie A" } as never);
    prismaMock.season.upsert.mockResolvedValue({ id: "s" } as never);
    prismaMock.team.upsert.mockResolvedValue({ id: "t" } as never);
    prismaMock.match.upsert.mockResolvedValue({ id: "m" } as never);
    prismaMock.match.findUnique.mockResolvedValue({ id: "m" } as never);
    prismaMock.player.findMany.mockResolvedValue([] as never);
    prismaMock.team.findMany.mockResolvedValue([] as never);
    prismaMock.matchEvent.createMany.mockResolvedValue({ count: 0 } as never);
    // Return Tier 2 profile so getLeagueCapabilities() hits DB cache (no extra API calls)
    prismaMock.apiStrategyCache.findUnique.mockResolvedValue(null as never);
    prismaMock.apiStrategyCache.upsert.mockResolvedValue({} as never);
    prismaMock.leagueDataProfile.findUnique.mockResolvedValue({
      leagueId: 648, hasFixtures: true, hasEvents: true, hasCoordinates: false,
      tier: 2, fixturesSample: 1, eventsSample: 2, coordsSample: 0,
      checkedAt: new Date(),
    } as never);

    mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
    global.fetch = mockFetch;

    const [service, client] = await Promise.all([
      import("../../src/ingestion/fixture-first.ingestion.service"),
      import("../../src/integrations/sportmonks/sportmonks.client"),
    ]);
    ingestLeagueViaFixtures = service.ingestLeagueViaFixtures;
    bootstrapFixtures = service.bootstrapFixtures;
    fetchWithRetry = client.fetchWithRetry;
  });

  // -------------------------------------------------------------------------
  // Rate limiting (429)
  // -------------------------------------------------------------------------

  it("retries on 429 and succeeds after rate limit clears", async () => {
    mockFetch
      .mockResolvedValueOnce(rl429Response())          // 429
      .mockResolvedValueOnce(okResponse({ data: [] })); // 200 on retry

    const res = await fetchWithRetry("https://api.sportmonks.com/v3/football/fixtures");
    expect(res.ok).toBe(true);
  }, 10_000);

  it("throws after exhausting MAX_RETRIES on persistent 429", async () => {
    mockFetch.mockResolvedValue(rl429Response()); // always 429

    await expect(
      fetchWithRetry("https://api.sportmonks.com/v3/football/fixtures"),
    ).rejects.toThrow();
  }, 15_000);

  // -------------------------------------------------------------------------
  // API offline / network failure
  // -------------------------------------------------------------------------

  it("throws when fetch itself rejects (network offline)", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(
      fetchWithRetry("https://api.sportmonks.com/v3/football/fixtures"),
    ).rejects.toThrow("ECONNREFUSED");
  });

  // -------------------------------------------------------------------------
  // Partial data — events without coordinates
  // -------------------------------------------------------------------------

  it("inserts events with null coordinates without throwing", async () => {
    const fixture = makeFixture({ state: "FT" });
    const eventNoCoords = makeEvent({ id: 500, coordinates: null });
    const eventPartial  = makeEvent({ id: 501, coordinates: { x: null, y: null, end_x: null, end_y: null } });
    const league = makeLeague();

    mockFetch
      .mockResolvedValueOnce(okResponse(paginatedResponse([fixture])))
      .mockResolvedValueOnce(okResponse(paginatedResponse([fixture])))
      .mockResolvedValueOnce(okResponse(singleResponse(league)))
      .mockResolvedValueOnce(okResponse(paginatedResponse([eventNoCoords, eventPartial])));

    await expect(
      ingestLeagueViaFixtures(648, { maxPages: 1, maxFinishedFixtures: 1 }),
    ).resolves.not.toThrow();

    const call = prismaMock.matchEvent.createMany.mock.calls[0] as [{ data: Array<{ x: unknown; y: unknown }> }];
    const rows = call[0].data;

    rows.forEach((row) => {
      expect(row.x).toBeNull();
      expect(row.y).toBeNull();
    });
  });

  it("inserts events without an externalId using sourceHash for deduplication", async () => {
    const fixture = makeFixture({ state: "FT" });
    // Event with no id — should be inserted via sourceHash, not skipped
    const eventNoId = { ...makeEvent({ id: 0 }), id: undefined } as unknown as ReturnType<typeof makeEvent>;
    const league = makeLeague();

    mockFetch
      .mockResolvedValueOnce(okResponse(paginatedResponse([fixture])))
      .mockResolvedValueOnce(okResponse(paginatedResponse([fixture])))
      .mockResolvedValueOnce(okResponse(singleResponse(league)))
      .mockResolvedValueOnce(okResponse(paginatedResponse([eventNoId])));

    await ingestLeagueViaFixtures(648, { maxPages: 1, maxFinishedFixtures: 1 });

    // createMany should have been called with the id-less event carrying a sourceHash
    expect(prismaMock.matchEvent.createMany).toHaveBeenCalledTimes(1);
    const rows = (
      prismaMock.matchEvent.createMany.mock.calls[0] as [{ data: Array<{ externalId: unknown; sourceHash: unknown }> }]
    )[0].data;
    expect(rows).toHaveLength(1);
    expect(rows[0].externalId).toBeNull();
    expect(typeof rows[0].sourceHash).toBe("string");
    expect(rows[0].sourceHash).toHaveLength(32); // first 32 hex chars of SHA-256
  });

  // -------------------------------------------------------------------------
  // DB write failure
  // -------------------------------------------------------------------------

  it("propagates error when league DB upsert fails (league is required — fatal)", async () => {
    // The league upsert failure is FATAL: no league = no IDs for Season/Match FKs.
    // The seed scripts catch this per-league and continue to the next league.
    prismaMock.league.upsert.mockRejectedValue(new Error("DB connection lost") as never);

    const fixture = makeFixture({ state: "FT" });

    mockFetch
      .mockResolvedValueOnce(okResponse(paginatedResponse([fixture])))  // probe
      .mockResolvedValueOnce(okResponse(paginatedResponse([fixture])))  // fetch fixtures
      .mockResolvedValueOnce(okResponse(singleResponse(makeLeague()))); // league API ok

    // Throws — caller (seed script) handles with per-league try/catch
    await expect(
      ingestLeagueViaFixtures(648, { maxPages: 1, maxFinishedFixtures: 0 }),
    ).rejects.toThrow("DB connection lost");
  });

  it("bootstrap reports errors without throwing when match upsert fails", async () => {
    // All upserts fail
    prismaMock.match.upsert.mockRejectedValue(new Error("constraint violation") as never);

    const fixture = makeFixture();
    mockFetch.mockResolvedValue(okResponse(paginatedResponse([fixture, makeFixture({ id: 2 })])));

    const result = await bootstrapFixtures(1);

    expect(result.errors).toBe(2);
    expect(result.matchesUpserted).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 400 on /fixtures — does not crash pipeline
  // -------------------------------------------------------------------------

  it("falls back gracefully when /fixtures returns 400", async () => {
    // All fetch strategies fail → BULK_CLIENT_SIDE → but even bulk might 400 here
    // In this case the strategy layer itself throws, which propagates to the caller
    mockFetch.mockResolvedValue(errResponse(400, "filters not supported"));

    await expect(
      ingestLeagueViaFixtures(648, { maxPages: 1, maxFinishedFixtures: 0 }),
    ).rejects.toThrow();
    // Expected: the error surfaces (not silently swallowed at the top level)
    // The caller (seed script) handles it with try/catch per league
  });
});
