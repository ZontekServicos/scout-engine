/**
 * tests/client/buildFilters.test.ts
 *
 * Pure unit tests — no I/O, no mocks needed.
 * Validates every supported input form and separator rule.
 */

import { buildFilters, buildInclude } from "../../src/integrations/sportmonks/sportmonks.client";

describe("buildFilters", () => {
  // -------------------------------------------------------------------------
  // Passthrough (string input)
  // -------------------------------------------------------------------------
  describe("string passthrough", () => {
    it("returns the string unchanged", () => {
      expect(buildFilters("league_id:648")).toBe("league_id:648");
    });

    it("returns an already-composed filter string unchanged", () => {
      expect(buildFilters("populate;idAfter:5000")).toBe("populate;idAfter:5000");
    });

    it("returns empty string unchanged", () => {
      expect(buildFilters("")).toBe("");
    });
  });

  // -------------------------------------------------------------------------
  // Token array input
  // -------------------------------------------------------------------------
  describe("string[] token array", () => {
    it("joins tokens with semicolon", () => {
      expect(buildFilters(["populate", "idAfter:5000"])).toBe("populate;idAfter:5000");
    });

    it("handles single token", () => {
      expect(buildFilters(["populate"])).toBe("populate");
    });

    it("drops empty strings from the array", () => {
      expect(buildFilters(["populate", "", "idAfter:5000"])).toBe("populate;idAfter:5000");
    });
  });

  // -------------------------------------------------------------------------
  // Object input — scalar values
  // -------------------------------------------------------------------------
  describe("FilterObject — scalar values", () => {
    it("serialises a single numeric key:value", () => {
      expect(buildFilters({ league_id: 648 })).toBe("league_id:648");
    });

    it("serialises a single string key:value", () => {
      expect(buildFilters({ status: "FT" })).toBe("status:FT");
    });

    it("joins two fields with semicolon (different fields → ;)", () => {
      expect(buildFilters({ league_id: 648, season_id: 1 })).toBe("league_id:648;season_id:1");
    });
  });

  // -------------------------------------------------------------------------
  // Object input — array values (multiple IDs for same key)
  // -------------------------------------------------------------------------
  describe("FilterObject — array values (same-key multi-value)", () => {
    it("joins multiple IDs with comma (same key → ,)", () => {
      expect(buildFilters({ league_id: [648, 651] })).toBe("league_id:648,651");
    });

    it("handles single-element array", () => {
      expect(buildFilters({ league_id: [648] })).toBe("league_id:648");
    });

    it("handles string ID arrays", () => {
      expect(buildFilters({ league_id: ["648", "651"] })).toBe("league_id:648,651");
    });
  });

  // -------------------------------------------------------------------------
  // Object input — null / undefined / empty drops
  // -------------------------------------------------------------------------
  describe("FilterObject — null/undefined are ignored", () => {
    it("drops null values", () => {
      expect(buildFilters({ league_id: null })).toBe("");
    });

    it("drops undefined values", () => {
      expect(buildFilters({ league_id: undefined })).toBe("");
    });

    it("drops empty arrays", () => {
      expect(buildFilters({ league_id: [] })).toBe("");
    });

    it("drops null but keeps valid sibling", () => {
      expect(buildFilters({ league_id: null, season_id: 1 })).toBe("season_id:1");
    });
  });

  // -------------------------------------------------------------------------
  // Special keywords: populate, idAfter
  // -------------------------------------------------------------------------
  describe("FilterObject — special keywords", () => {
    it("emits 'populate' token when populate=true", () => {
      expect(buildFilters({ populate: true })).toBe("populate");
    });

    it("emits 'idAfter:X' token when idAfter is set", () => {
      expect(buildFilters({ idAfter: 5000 })).toBe("idAfter:5000");
    });

    it("combines populate and idAfter (bulk incremental sync)", () => {
      expect(buildFilters({ populate: true, idAfter: 5000 })).toBe("populate;idAfter:5000");
    });

    it("does not emit 'populate' token when populate=false", () => {
      expect(buildFilters({ populate: false, league_id: 648 })).toBe("league_id:648");
    });

    it("combines special keywords with regular filters", () => {
      // idAfter comes before regular fields (special keywords first)
      const result = buildFilters({ populate: true, league_id: 648 });
      expect(result).toContain("populate");
      expect(result).toContain("league_id:648");
    });
  });

  // -------------------------------------------------------------------------
  // Real-world Sportmonks patterns
  // -------------------------------------------------------------------------
  describe("real-world patterns", () => {
    it("fixtures by league", () => {
      expect(buildFilters({ league_id: 648 })).toBe("league_id:648");
    });

    it("events by fixture", () => {
      expect(buildFilters({ fixture_id: 18_535_517 })).toBe("fixture_id:18535517");
    });

    it("bulk bootstrap sync", () => {
      expect(buildFilters({ populate: true })).toBe("populate");
    });

    it("incremental sync since last ID", () => {
      expect(buildFilters({ populate: true, idAfter: 18_000_000 })).toBe(
        "populate;idAfter:18000000",
      );
    });

    it("multiple leagues (leagueIds pattern from docs)", () => {
      expect(buildFilters({ leagueIds: [2, 5, 8] })).toBe("leagueIds:2,5,8");
    });

    it("event type filter (eventTypes:18)", () => {
      expect(buildFilters({ eventTypes: 18 })).toBe("eventTypes:18");
    });
  });
});

// ===========================================================================

describe("buildInclude", () => {
  it("joins array with semicolons (official Sportmonks v3 syntax)", () => {
    expect(buildInclude(["participants", "scores", "state"])).toBe(
      "participants;scores;state",
    );
  });

  it("returns a single include unchanged", () => {
    expect(buildInclude(["participants"])).toBe("participants");
  });

  it("returns pre-built string unchanged (passthrough)", () => {
    expect(buildInclude("participants;events")).toBe("participants;events");
  });

  it("handles nested include syntax", () => {
    expect(buildInclude(["lineups:player_name", "events:player_name,minute"])).toBe(
      "lineups:player_name;events:player_name,minute",
    );
  });

  it("handles empty array", () => {
    expect(buildInclude([])).toBe("");
  });
});
