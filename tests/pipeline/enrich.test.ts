/**
 * tests/pipeline/enrich.test.ts
 *
 * Tests Layer 3 — ingestLeagueViaFixtures().
 * Validates full entity creation: League → Country → Season → Teams → Match → MatchEvent.
 *
 * All external I/O is mocked (Prisma, fetch, fs).
 */

import { jest } from "@jest/globals";
import { makeFixture, makeEvent, makeLeague, paginatedResponse, singleResponse } from "../helpers/fixtures";
import { prismaMock, resetPrismaMock } from "../helpers/prisma.mock";

process.env.SPORTMONKS_API_TOKEN = "test-token";

// Mock the Prisma singleton
jest.mock("../../src/lib/prisma", () => ({ prisma: prismaMock }));

// Mock fs (strategy cache)
jest.mock("fs", () => ({
  existsSync: jest.fn().mockReturnValue(false),
  readFileSync: jest.fn().mockReturnValue("{}"),
  writeFileSync: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

function makeDbLeague(id = "uuid-league") {
  return { id, externalId: 648, name: "Serie A" };
}
function makeDbSeason(id = "uuid-season") {
  return { id, externalId: 25580, name: "Season 25580", leagueId: "uuid-league" };
}
function makeDbTeam(id: string) {
  return { id, externalId: 10, name: "Flamengo" };
}
function makeDbMatch(id = "uuid-match") {
  return { id, externalId: 1_000_000 };
}

function setupPrismaMock() {
  prismaMock.country.upsert.mockResolvedValue({ id: "uuid-country" } as never);
  prismaMock.league.upsert.mockResolvedValue(makeDbLeague() as never);
  prismaMock.season.upsert.mockResolvedValue(makeDbSeason() as never);
  prismaMock.team.upsert.mockResolvedValue(makeDbTeam("uuid-home") as never);
  prismaMock.match.upsert.mockResolvedValue(makeDbMatch() as never);
  prismaMock.match.findUnique.mockResolvedValue(makeDbMatch() as never);
  prismaMock.player.findMany.mockResolvedValue([] as never);
  prismaMock.team.findMany.mockResolvedValue([] as never);
  prismaMock.matchEvent.createMany.mockResolvedValue({ count: 2 } as never);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ingestLeagueViaFixtures (Layer 3 — Enrich)", () => {
  let mockFetch: jest.MockedFunction<typeof fetch>;
  let ingestLeagueViaFixtures: (id: number, opts?: Record<string, unknown>) => Promise<{
    leagueName: string;
    fixturesTotal: number;
    fixturesNew: number;
    fixturesFinished: number;
    fixturesIngested: number;
    eventsTotal: number;
  }>;

  beforeEach(async () => {
    jest.resetModules();

    // Re-apply mocks after resetModules
    jest.mock("../../src/lib/prisma", () => ({ prisma: prismaMock }));
    jest.mock("fs", () => ({
      existsSync: jest.fn().mockReturnValue(false),
      readFileSync: jest.fn().mockReturnValue("{}"),
      writeFileSync: jest.fn(),
    }));

    resetPrismaMock();
    setupPrismaMock();

    mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
    global.fetch = mockFetch;

    const service = await import("../../src/ingestion/fixture-first.ingestion.service");
    ingestLeagueViaFixtures = service.ingestLeagueViaFixtures;
  });

  // -----------------------------------------------------------------------
  // Happy path
  // -----------------------------------------------------------------------

  it("returns correct summary for a finished fixture with events", async () => {
    const fixture = makeFixture({ id: 1, state: "FT" });
    const event = makeEvent({ id: 100, fixture_id: 1 });
    const league = makeLeague();

    mockFetch
      // detectFixtureStrategy probe (strategy.ts)
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(paginatedResponse([fixture])),
        text: () => Promise.resolve("") } as unknown as Response)
      // fetchFixturesByLeague (actual call)
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(paginatedResponse([fixture])),
        text: () => Promise.resolve("") } as unknown as Response)
      // fetchLeagueById
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(singleResponse(league)),
        text: () => Promise.resolve("") } as unknown as Response)
      // fetchMatchEvents
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(paginatedResponse([event])),
        text: () => Promise.resolve("") } as unknown as Response);

    const result = await ingestLeagueViaFixtures(648, {
      maxFinishedFixtures: 5,
      maxPages: 1,
    });

    expect(result.leagueName).toBe("Serie A");
    expect(result.fixturesTotal).toBe(1);
    expect(result.fixturesFinished).toBe(1);
    expect(result.fixturesIngested).toBe(1);
    expect(result.eventsTotal).toBe(2); // createMany returned { count: 2 }
  });

  it("upserts League with correct externalId", async () => {
    const fixture = makeFixture({ state: "FT" });
    const league = makeLeague();

    mockFetch.mockResolvedValue({ ok: true, status: 200, headers: new Headers(),
      json: () => Promise.resolve(paginatedResponse([fixture])),
      text: () => Promise.resolve("") } as unknown as Response);

    // Override league call
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(paginatedResponse([fixture])),
        text: () => Promise.resolve("") } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(paginatedResponse([fixture])),
        text: () => Promise.resolve("") } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(singleResponse(league)),
        text: () => Promise.resolve("") } as unknown as Response)
      .mockResolvedValue({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(paginatedResponse([])),
        text: () => Promise.resolve("") } as unknown as Response);

    await ingestLeagueViaFixtures(648, { maxPages: 1, maxFinishedFixtures: 0 });

    expect(prismaMock.league.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { externalId: 648 },
      }),
    );
  });

  it("upserts home and away Teams from fixture participants", async () => {
    const fixture = makeFixture({ state: "FT" });
    const league = makeLeague();

    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(paginatedResponse([fixture])),
        text: () => Promise.resolve("") } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(paginatedResponse([fixture])),
        text: () => Promise.resolve("") } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(singleResponse(league)),
        text: () => Promise.resolve("") } as unknown as Response)
      .mockResolvedValue({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(paginatedResponse([])),
        text: () => Promise.resolve("") } as unknown as Response);

    await ingestLeagueViaFixtures(648, { maxPages: 1, maxFinishedFixtures: 0 });

    // 2 teams: Flamengo (home) + Fluminense (away)
    expect(prismaMock.team.upsert).toHaveBeenCalledTimes(2);
    expect(prismaMock.team.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { externalId: 10 } }),
    );
    expect(prismaMock.team.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { externalId: 11 } }),
    );
  });

  it("skips non-finished fixtures for event ingestion", async () => {
    const scheduled = makeFixture({ id: 1, state: "NS" }); // NS = not started
    const league = makeLeague();

    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(paginatedResponse([scheduled])),
        text: () => Promise.resolve("") } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(paginatedResponse([scheduled])),
        text: () => Promise.resolve("") } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(singleResponse(league)),
        text: () => Promise.resolve("") } as unknown as Response);

    const result = await ingestLeagueViaFixtures(648, { maxPages: 1, maxFinishedFixtures: 5 });

    expect(result.fixturesFinished).toBe(0);
    expect(result.fixturesIngested).toBe(0);
    expect(prismaMock.matchEvent.createMany).not.toHaveBeenCalled();
  });

  it("does not ingest events beyond maxFinishedFixtures cap", async () => {
    // 5 finished fixtures but cap is 2
    const fixtures = Array.from({ length: 5 }, (_, i) =>
      makeFixture({ id: i + 1, state: "FT" }),
    );
    const league = makeLeague();

    // Setup: probe, fetch, league, then events for 2 fixtures
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(paginatedResponse(fixtures)),
        text: () => Promise.resolve("") } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(paginatedResponse(fixtures)),
        text: () => Promise.resolve("") } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(singleResponse(league)),
        text: () => Promise.resolve("") } as unknown as Response)
      .mockResolvedValue({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(paginatedResponse([])),
        text: () => Promise.resolve("") } as unknown as Response);

    const result = await ingestLeagueViaFixtures(648, {
      maxPages: 1,
      maxFinishedFixtures: 2,
    });

    expect(result.fixturesFinished).toBe(5);
    expect(result.fixturesIngested).toBe(2); // capped at 2
  });

  it("uses createMany with skipDuplicates for MatchEvent batch insert", async () => {
    const fixture = makeFixture({ state: "FT" });
    const events = [makeEvent({ id: 100 }), makeEvent({ id: 101 })];
    const league = makeLeague();

    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(paginatedResponse([fixture])),
        text: () => Promise.resolve("") } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(paginatedResponse([fixture])),
        text: () => Promise.resolve("") } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(singleResponse(league)),
        text: () => Promise.resolve("") } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(paginatedResponse(events)),
        text: () => Promise.resolve("") } as unknown as Response);

    await ingestLeagueViaFixtures(648, { maxPages: 1, maxFinishedFixtures: 1 });

    expect(prismaMock.matchEvent.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });

  it("persists x, y, endX, endY coordinates from events", async () => {
    const fixture = makeFixture({ state: "FT" });
    const event = makeEvent({
      id: 100,
      coordinates: { x: 88.5, y: 45.0, end_x: 100, end_y: 50 },
    });
    const league = makeLeague();

    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(paginatedResponse([fixture])),
        text: () => Promise.resolve("") } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(paginatedResponse([fixture])),
        text: () => Promise.resolve("") } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(singleResponse(league)),
        text: () => Promise.resolve("") } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(paginatedResponse([event])),
        text: () => Promise.resolve("") } as unknown as Response);

    await ingestLeagueViaFixtures(648, { maxPages: 1, maxFinishedFixtures: 1 });

    const createManyCall = prismaMock.matchEvent.createMany.mock.calls[0] as [{ data: Array<{ x: number; y: number; endX: number; endY: number }> }];
    const insertedRows = createManyCall[0].data;

    expect(insertedRows[0]).toMatchObject({ x: 88.5, y: 45.0, endX: 100, endY: 50 });
  });

  // -----------------------------------------------------------------------
  // Failure resilience
  // -----------------------------------------------------------------------

  it("continues processing other fixtures when one fails", async () => {
    const good = makeFixture({ id: 1, state: "FT" });
    const bad  = makeFixture({ id: 2, state: "FT", participants: null }); // malformed
    const league = makeLeague();

    // Force season upsert to fail for fixture id=2
    prismaMock.season.upsert
      .mockResolvedValueOnce(makeDbSeason() as never)
      .mockRejectedValueOnce(new Error("DB constraint violation") as never)
      .mockResolvedValue(makeDbSeason() as never);

    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(paginatedResponse([good, bad])),
        text: () => Promise.resolve("") } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(paginatedResponse([good, bad])),
        text: () => Promise.resolve("") } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(singleResponse(league)),
        text: () => Promise.resolve("") } as unknown as Response)
      .mockResolvedValue({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(paginatedResponse([])),
        text: () => Promise.resolve("") } as unknown as Response);

    // Should not throw — errors are swallowed per-fixture
    await expect(
      ingestLeagueViaFixtures(648, { maxPages: 1, maxFinishedFixtures: 5 }),
    ).resolves.not.toThrow();
  });

  it("handles events without x,y coordinates (null coords)", async () => {
    const fixture = makeFixture({ state: "FT" });
    const eventNoCoords = makeEvent({ id: 200, coordinates: null });
    const league = makeLeague();

    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(paginatedResponse([fixture])),
        text: () => Promise.resolve("") } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(paginatedResponse([fixture])),
        text: () => Promise.resolve("") } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(singleResponse(league)),
        text: () => Promise.resolve("") } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(),
        json: () => Promise.resolve(paginatedResponse([eventNoCoords])),
        text: () => Promise.resolve("") } as unknown as Response);

    await expect(
      ingestLeagueViaFixtures(648, { maxPages: 1, maxFinishedFixtures: 1 }),
    ).resolves.not.toThrow();

    const rows = (prismaMock.matchEvent.createMany.mock.calls[0] as [{ data: Array<{ x: unknown; y: unknown }> }])[0].data;
    expect(rows[0].x).toBeNull();
    expect(rows[0].y).toBeNull();
  });
});
