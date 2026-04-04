/**
 * tests/helpers/fixtures.ts
 *
 * Factory functions for test data.
 * Every factory returns a complete object with sensible defaults.
 * Override any field with a partial argument.
 */

import type {
  SportmonksFixture,
  SportmonksEvent,
  SportmonksLeague,
  SportmonksParticipant,
} from "../../src/integrations/sportmonks/sportmonks.types";

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

export function makeFixture(overrides: Partial<SportmonksFixture> = {}): SportmonksFixture {
  return {
    id: 1_000_000,
    season_id: 25580,
    league_id: 648,
    starting_at: "2024-08-10T18:00:00.000Z",
    state: "FT",
    scores: [
      { type_id: 1, participant: "home", score: { goals: 2, participant: "home" } },
      { type_id: 1, participant: "away", score: { goals: 1, participant: "away" } },
    ],
    participants: [
      makeParticipant({ id: 10, name: "Flamengo", meta: { location: "home" } }),
      makeParticipant({ id: 11, name: "Fluminense", meta: { location: "away" } }),
    ],
    ...overrides,
  };
}

export function makeParticipant(overrides: Partial<SportmonksParticipant> = {}): SportmonksParticipant {
  return {
    id: 10,
    name: "Flamengo",
    meta: { location: "home" },
    ...overrides,
  };
}

export function makeEvent(overrides: Partial<SportmonksEvent> = {}): SportmonksEvent {
  return {
    id: 5_000_000,
    fixture_id: 1_000_000,
    player_id: 200_000,
    participant_id: 10,
    type: { developer_name: "goal" },
    minute: 32,
    extra_minute: null,
    coordinates: { x: 95, y: 50, end_x: 100, end_y: 45 },
    result: null,
    info: null,
    addition: null,
    ...overrides,
  };
}

export function makeLeague(overrides: Partial<SportmonksLeague> = {}): SportmonksLeague {
  return {
    id: 648,
    name: "Serie A",
    country_id: 32,
    country: { id: 32, name: "Brazil", iso2: "BR" },
    type: "league",
    logo_path: null,
    image_path: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Paginated API response wrappers
// ---------------------------------------------------------------------------

export function paginatedResponse<T>(
  data: T[],
  page = 1,
  totalPages = 1,
): { data: T[]; meta: { pagination: { current_page: number; total_pages: number } } } {
  return {
    data,
    meta: { pagination: { current_page: page, total_pages: totalPages } },
  };
}

export function singleResponse<T>(data: T): { data: T } {
  return { data };
}

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock Response-like object that global.fetch can return.
 */
export function mockOkResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers(),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

export function mockErrorResponse(status: number, body = ""): Response {
  return {
    ok: false,
    status,
    statusText: String(status),
    headers: new Headers(),
    json: () => Promise.reject(new Error("not ok")),
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

export function mockRateLimitResponse(retryAfterSecs = 1): Response {
  const headers = new Headers({ "Retry-After": String(retryAfterSecs) });
  return {
    ok: false,
    status: 429,
    statusText: "Too Many Requests",
    headers,
    json: () => Promise.reject(new Error("429")),
    text: () => Promise.resolve('{"message":"rate limit exceeded"}'),
  } as unknown as Response;
}
