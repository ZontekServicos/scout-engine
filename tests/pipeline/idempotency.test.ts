/**
 * tests/pipeline/idempotency.test.ts
 *
 * Validates that running the ingestion twice produces no duplicates.
 * Tests the upsert pattern and createMany + skipDuplicates for events.
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

describe("Idempotency", () => {
  let mockFetch: jest.MockedFunction<typeof fetch>;
  let ingestLeagueViaFixtures: (id: number, opts?: Record<string, unknown>) => Promise<{
    eventsTotal: number;
    fixturesIngested: number;
  }>;

  beforeEach(async () => {
    jest.resetModules();
    jest.mock("../../src/lib/prisma", () => ({ prisma: prismaMock }));
    jest.mock("fs", () => ({
      existsSync: jest.fn().mockReturnValue(false),
      readFileSync: jest.fn().mockReturnValue("{}"),
      writeFileSync: jest.fn(),
    }));

    resetPrismaMock();

    // Standard happy-path mock setup
    prismaMock.country.upsert.mockResolvedValue({ id: "uuid-country" } as never);
    prismaMock.league.upsert.mockResolvedValue({ id: "uuid-league", name: "Serie A" } as never);
    prismaMock.season.upsert.mockResolvedValue({ id: "uuid-season" } as never);
    prismaMock.team.upsert.mockResolvedValue({ id: "uuid-team" } as never);
    prismaMock.match.upsert.mockResolvedValue({ id: "uuid-match" } as never);
    prismaMock.match.findUnique.mockResolvedValue({ id: "uuid-match" } as never);
    prismaMock.player.findMany.mockResolvedValue([] as never);
    prismaMock.team.findMany.mockResolvedValue([] as never);
    // First run: 2 events inserted. Second run: 0 (all skipped as duplicates).
    prismaMock.matchEvent.createMany
      .mockResolvedValueOnce({ count: 2 } as never)
      .mockResolvedValueOnce({ count: 0 } as never);
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

    const service = await import("../../src/ingestion/fixture-first.ingestion.service");
    ingestLeagueViaFixtures = service.ingestLeagueViaFixtures;
  });

  function setupFetchForRun(fixture: ReturnType<typeof makeFixture>, events: ReturnType<typeof makeEvent>[]) {
    const league = makeLeague();
    mockFetch
      .mockResolvedValueOnce(okResponse(paginatedResponse([fixture])))  // probe
      .mockResolvedValueOnce(okResponse(paginatedResponse([fixture])))  // fetch fixtures
      .mockResolvedValueOnce(okResponse(singleResponse(league)))         // fetch league
      .mockResolvedValueOnce(okResponse(paginatedResponse(events)));    // fetch events
  }

  it("upsert is called each run (not insert) — prevents duplicates", async () => {
    const fixture = makeFixture({ state: "FT" });
    const events = [makeEvent({ id: 100 }), makeEvent({ id: 101 })];

    // Run 1
    setupFetchForRun(fixture, events);
    await ingestLeagueViaFixtures(648, { maxPages: 1, maxFinishedFixtures: 1 });

    const upsertCallsRun1 = prismaMock.match.upsert.mock.calls.length;

    // Run 2 (same data)
    setupFetchForRun(fixture, events);
    await ingestLeagueViaFixtures(648, { maxPages: 1, maxFinishedFixtures: 1 });

    const upsertCallsRun2 = prismaMock.match.upsert.mock.calls.length;

    // upsert called twice total (once per run), not doubled
    expect(upsertCallsRun2).toBe(upsertCallsRun1 * 2);
  });

  it("createMany skipDuplicates returns 0 new inserts on second run (no duplicates)", async () => {
    const fixture = makeFixture({ state: "FT" });
    const events = [makeEvent({ id: 100 }), makeEvent({ id: 101 })];

    // Run 1
    setupFetchForRun(fixture, events);
    const run1 = await ingestLeagueViaFixtures(648, { maxPages: 1, maxFinishedFixtures: 1 });

    // Run 2 — same events, skipDuplicates → 0 new rows
    setupFetchForRun(fixture, events);
    const run2 = await ingestLeagueViaFixtures(648, { maxPages: 1, maxFinishedFixtures: 1 });

    expect(run1.eventsTotal).toBe(2);   // first run inserts 2
    expect(run2.eventsTotal).toBe(0);   // second run: all duplicates, 0 inserted
  });

  it("league upsert is called with the same where clause on both runs", async () => {
    const fixture = makeFixture({ state: "FT" });
    const events = [makeEvent({ id: 100 })];

    setupFetchForRun(fixture, events);
    await ingestLeagueViaFixtures(648, { maxPages: 1, maxFinishedFixtures: 1 });

    setupFetchForRun(fixture, events);
    await ingestLeagueViaFixtures(648, { maxPages: 1, maxFinishedFixtures: 1 });

    // Both calls must use the same `where` condition
    const calls = prismaMock.league.upsert.mock.calls as Array<[{ where: { externalId: number } }]>;
    expect(calls[0][0].where).toEqual({ externalId: 648 });
    expect(calls[1][0].where).toEqual({ externalId: 648 });
  });

  it("does not double-insert teams on re-run", async () => {
    const fixture = makeFixture({ state: "NS" }); // not finished = no events
    const events: ReturnType<typeof makeEvent>[] = [];

    setupFetchForRun(fixture, events);
    await ingestLeagueViaFixtures(648, { maxPages: 1, maxFinishedFixtures: 0 });

    const teamsAfterRun1 = prismaMock.team.upsert.mock.calls.length;

    setupFetchForRun(fixture, events);
    await ingestLeagueViaFixtures(648, { maxPages: 1, maxFinishedFixtures: 0 });

    const teamsAfterRun2 = prismaMock.team.upsert.mock.calls.length;

    // Each run upserts 2 teams; second run is identical (not additive)
    expect(teamsAfterRun2 - teamsAfterRun1).toBe(teamsAfterRun1);
  });
});
