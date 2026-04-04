/**
 * tests/client/fetchWithRetry.test.ts
 *
 * Tests the HTTP retry layer in isolation.
 * Mocks global.fetch — no real network calls.
 */

import { jest } from "@jest/globals";
import {
  mockOkResponse,
  mockErrorResponse,
  mockRateLimitResponse,
  paginatedResponse,
  makeFixture,
} from "../helpers/fixtures";

// Set token before importing the module
process.env.SPORTMONKS_API_TOKEN = "test-token";

// Mock fs so strategy cache tests don't pollute disk
jest.mock("fs");

let fetchWithRetry: (url: string) => Promise<Response>;
let fetchFixturesByLeague: (id: number, pages?: number) => Promise<unknown[]>;

beforeAll(async () => {
  const client = await import("../../src/integrations/sportmonks/sportmonks.client");
  fetchWithRetry = client.fetchWithRetry;
  fetchFixturesByLeague = client.fetchFixturesByLeague as typeof fetchFixturesByLeague;
});

// ---------------------------------------------------------------------------
// fetchWithRetry
// ---------------------------------------------------------------------------

describe("fetchWithRetry", () => {
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
    global.fetch = mockFetch;
  });

  it("returns the response immediately on 200 OK", async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({ data: [] }));

    const res = await fetchWithRetry("https://example.com/test");

    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("adds Authorization header to every request", async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({}));

    await fetchWithRetry("https://example.com/test");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/test",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "test-token" }),
      }),
    );
  });

  it("retries on HTTP 429 (rate limit)", async () => {
    mockFetch
      .mockResolvedValueOnce(mockRateLimitResponse(0)) // 429
      .mockResolvedValueOnce(mockOkResponse({ data: [] })); // 200

    const res = await fetchWithRetry("https://example.com/test");

    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  }, 10_000);

  it("retries on HTTP 500 (server error)", async () => {
    mockFetch
      .mockResolvedValueOnce(mockErrorResponse(500, "Internal Server Error"))
      .mockResolvedValueOnce(mockErrorResponse(500, "Internal Server Error"))
      .mockResolvedValueOnce(mockOkResponse({ data: [] }));

    const res = await fetchWithRetry("https://example.com/test");

    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  }, 15_000);

  it("throws immediately on HTTP 400 (non-retryable 4xx)", async () => {
    mockFetch.mockResolvedValueOnce(
      mockErrorResponse(400, '{"message":"You requested filters do not exist"}'),
    );

    await expect(fetchWithRetry("https://example.com/test")).rejects.toThrow("400");

    expect(mockFetch).toHaveBeenCalledTimes(1); // no retry
  });

  it("throws immediately on HTTP 401 (auth error)", async () => {
    mockFetch.mockResolvedValueOnce(mockErrorResponse(401, '{"message":"Unauthorized"}'));

    await expect(fetchWithRetry("https://example.com/test")).rejects.toThrow("401");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("throws after exhausting all retries on persistent 500", async () => {
    mockFetch.mockResolvedValue(mockErrorResponse(500, "Always failing"));

    await expect(fetchWithRetry("https://example.com/test")).rejects.toThrow();

    // MAX_RETRIES = 3
    expect(mockFetch).toHaveBeenCalledTimes(3);
  }, 15_000);

  it("includes the API error body in the thrown error message", async () => {
    mockFetch.mockResolvedValueOnce(
      mockErrorResponse(400, '{"message":"Bad filter: league_id"}'),
    );

    await expect(fetchWithRetry("https://example.com/fixtures")).rejects.toThrow(
      "Bad filter: league_id",
    );
  });
});

// ---------------------------------------------------------------------------
// URL construction (via fetchFixturesByLeague which calls smGet internally)
// ---------------------------------------------------------------------------

describe("URL construction", () => {
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
    global.fetch = mockFetch;
  });

  it("includes api_token as query param", async () => {
    const fixture = makeFixture();
    mockFetch.mockResolvedValue(mockOkResponse(paginatedResponse([fixture])));

    await fetchFixturesByLeague(648, 1);

    const url = new URL(mockFetch.mock.calls[0][0] as string);
    expect(url.searchParams.get("api_token")).toBe("test-token");
  });

  it("builds filters=league_id:648 correctly", async () => {
    const fixture = makeFixture();
    mockFetch.mockResolvedValue(mockOkResponse(paginatedResponse([fixture])));

    await fetchFixturesByLeague(648, 1);

    const url = new URL(mockFetch.mock.calls[0][0] as string);
    expect(url.searchParams.get("filters")).toBe("league_id:648");
  });

  it("builds include=participants;scores;state using semicolon", async () => {
    const fixture = makeFixture();
    mockFetch.mockResolvedValue(mockOkResponse(paginatedResponse([fixture])));

    await fetchFixturesByLeague(648, 1);

    const url = new URL(mockFetch.mock.calls[0][0] as string);
    const include = url.searchParams.get("include") ?? "";
    expect(include).toContain("participants");
    expect(include).toContain(";"); // semicolon separator (not comma)
    expect(include).not.toMatch(/participants,/); // must NOT use comma
  });
});

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

describe("smGetAll pagination", () => {
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
    global.fetch = mockFetch;
  });

  it("fetches multiple pages and concatenates results", async () => {
    const page1 = paginatedResponse([makeFixture({ id: 1 })], 1, 2);
    const page2 = paginatedResponse([makeFixture({ id: 2 })], 2, 2);

    mockFetch
      .mockResolvedValueOnce(mockOkResponse(page1))
      .mockResolvedValueOnce(mockOkResponse(page2));

    const results = await fetchFixturesByLeague(648, 5);

    expect(results).toHaveLength(2);
    expect((results[0] as { id: number }).id).toBe(1);
    expect((results[1] as { id: number }).id).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("stops at maxPages even if more pages exist", async () => {
    // API claims 10 total pages but we cap at 2
    const page = (n: number) => paginatedResponse([makeFixture({ id: n })], n, 10);

    mockFetch
      .mockResolvedValueOnce(mockOkResponse(page(1)))
      .mockResolvedValueOnce(mockOkResponse(page(2)));

    const results = await fetchFixturesByLeague(648, 2); // maxPages=2

    expect(results).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("stops on first page when total_pages=1", async () => {
    mockFetch.mockResolvedValueOnce(
      mockOkResponse(paginatedResponse([makeFixture()], 1, 1)),
    );

    const results = await fetchFixturesByLeague(648, 10);

    expect(results).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
