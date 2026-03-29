export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "SoccerMind API",
    version: "2.1.0",
    description: "Institutional scouting, risk and transfer decision platform",
  },
  servers: [
    { url: "https://scout-engine-production.up.railway.app" },
    { url: "http://localhost:3000" },
  ],
  components: {
    schemas: {
      ApiEnvelope: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          data: {},
          error: { type: ["string", "null"] },
          meta: { type: "object", additionalProperties: true },
        },
        required: ["success", "data", "error", "meta"],
      },
      Player: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          position: { type: ["string", "null"], example: "ST" },
          positions: { type: "array", items: { type: "string" }, example: ["ST", "RW"] },
          team: { type: ["string", "null"], example: "Manchester City" },
          league: { type: ["string", "null"], example: "Premier League" },
          nationality: { type: "string", example: "England" },
          age: { type: "integer", example: 24 },
          overall: { type: ["integer", "null"], example: 88 },
          potential: { type: ["integer", "null"], example: 92 },
          marketValue: { type: ["number", "null"], example: 120000000 },
          image: {
            type: ["string", "null"],
            example: "https://cdn.sportmonks.com/images/soccer/players/10/10.png",
          },
          attributes: { type: "object", additionalProperties: true },
        },
        required: [
          "id",
          "name",
          "position",
          "positions",
          "team",
          "league",
          "nationality",
          "age",
          "overall",
          "potential",
          "marketValue",
          "image",
          "attributes",
        ],
      },
      PlayerProfile: {
        type: "object",
        properties: {
          player: { $ref: "#/components/schemas/Player" },
          attributes: { type: "object", additionalProperties: true },
          technical: { type: "object", additionalProperties: true },
          physical: { type: "object", additionalProperties: true },
          mental: { type: "object", additionalProperties: true },
        },
      },
      PlayerComparison: {
        type: "object",
        additionalProperties: true,
      },
      Alert: {
        type: "object",
        properties: {
          type: { type: "string", example: "GROWTH_SPIKE" },
          playerId: { type: "string" },
          playerName: { type: "string" },
          nomeJogador: { type: "string" },
          description: { type: "string" },
        },
      },
      WatchlistItem: {
        type: "object",
        properties: {
          id: { type: "string" },
          playerId: { type: "string" },
          playerName: { type: ["string", "null"] },
          nomeJogador: { type: ["string", "null"] },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      ScoutNote: {
        type: "object",
        properties: {
          id: { type: "string" },
          playerId: { type: "string" },
          note: { type: "string" },
          createdBy: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      PaginationMeta: {
        type: "object",
        properties: {
          page: { type: "integer", example: 1 },
          limit: { type: "integer", example: 20 },
          total: { type: "integer", example: 500 },
          totalPages: { type: "integer", example: 25 },
        },
      },
      AnalysisPlayer: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          club: { type: "string" },
          positions: { type: "array", items: { type: "string" } },
          order: { type: "integer" },
        },
      },
      AnalysisEntry: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          title: { type: "string" },
          description: { type: ["string", "null"] },
          type: { type: "string", enum: ["COMPARISON", "REPORT"] },
          typeLabel: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          status: { type: "string", enum: ["COMPLETED", "IN_PROGRESS", "ARCHIVED"] },
          statusLabel: { type: "string" },
          analyst: { type: "string" },
          playerCount: { type: "integer" },
          canDelete: { type: "boolean" },
          deleteManagedBy: { type: "string", enum: ["analysis", "scout_report"] },
          deleteHint: { type: "string" },
          scoutReportId: { type: ["string", "null"] },
          players: { type: "array", items: { $ref: "#/components/schemas/AnalysisPlayer" } },
          decisionContext: {
            type: "object",
            properties: {
              analyst: { type: "string" },
              status: { type: "string", enum: ["COMPLETED", "IN_PROGRESS", "ARCHIVED"] },
            },
          },
          sourceMetadata: {
            type: "object",
            properties: {
              origin: { type: "string", enum: ["ANALYSIS", "SCOUT_REPORT"] },
              legacy: { type: "boolean" },
                scoutReportType: { type: ["string", "null"], enum: ["SINGLE", "COMPARE", "RANKING", "REPORT", "COMPARISON", null] },
              scoutReportId: { type: ["string", "null"] },
              decisionStatus: { type: ["string", "null"] },
            },
          },
          deletePolicy: {
            type: "object",
            properties: {
              canDelete: { type: "boolean" },
              managedBy: { type: "string", enum: ["ANALYSIS", "SCOUT_REPORT"] },
              reason: { type: "string" },
            },
          },
        },
      },
    },
    parameters: {
      Page: { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
      Limit: {
        name: "limit",
        in: "query",
        schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
      PlayerId: { name: "id", in: "path", required: true, schema: { type: "string" } },
    },
  },
  paths: {
    "/api/players": {
      get: {
        summary: "List players with filtering and pagination",
        parameters: [
          { $ref: "#/components/parameters/Page" },
          { $ref: "#/components/parameters/Limit" },
          { name: "position", in: "query", schema: { type: "string" } },
          { name: "team", in: "query", schema: { type: "string" } },
          { name: "league", in: "query", schema: { type: "string" } },
          { name: "ageMin", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "ageMax", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "overallMin", in: "query", schema: { type: "integer", minimum: 1, maximum: 99 } },
          { name: "overallMax", in: "query", schema: { type: "integer", minimum: 1, maximum: 99 } },
          { name: "minOverall", in: "query", schema: { type: "integer", minimum: 1, maximum: 99 } },
        ],
        responses: {
          200: {
            description: "Paginated players list",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/ApiEnvelope" },
                    {
                      type: "object",
                      properties: {
                        data: { type: "array", items: { $ref: "#/components/schemas/Player" } },
                        meta: { $ref: "#/components/schemas/PaginationMeta" },
                      },
                    },
                  ],
                },
                examples: {
                  default: {
                    value: {
                      success: true,
                      data: [
                        {
                          id: "player-1",
                          name: "Kylian Mbappe",
                          position: "ST",
                          positions: ["ST"],
                          team: "Paris Saint-Germain",
                          league: "Ligue 1",
                          nationality: "France",
                          age: 25,
                          overall: 91,
                          potential: 94,
                          marketValue: 180000000,
                          image:
                            "https://cdn.sportmonks.com/images/soccer/players/10/10.png",
                          attributes: {
                            pace: 97,
                            shooting: 92,
                            passing: 85,
                            dribbling: 94,
                            defending: 40,
                            physical: 78,
                          },
                        },
                      ],
                      error: null,
                      meta: { page: 1, limit: 20, total: 500, totalPages: 25 },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/players/search": {
      get: {
        summary: "Search players with advanced filters",
        parameters: [
          { $ref: "#/components/parameters/Page" },
          { $ref: "#/components/parameters/Limit" },
          { name: "position", in: "query", schema: { type: "string" } },
          { name: "team", in: "query", schema: { type: "string" } },
          { name: "league", in: "query", schema: { type: "string" } },
          { name: "ageMin", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "ageMax", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "overallMin", in: "query", schema: { type: "integer", minimum: 1, maximum: 99 } },
          { name: "overallMax", in: "query", schema: { type: "integer", minimum: 1, maximum: 99 } },
          { name: "minOverall", in: "query", schema: { type: "integer", minimum: 1, maximum: 99 } },
        ],
        responses: {
          200: {
            description: "Advanced search result",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/ApiEnvelope" },
                    {
                      type: "object",
                      properties: {
                        data: { type: "array", items: { $ref: "#/components/schemas/Player" } },
                        meta: { $ref: "#/components/schemas/PaginationMeta" },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
    "/api/player/{id}": {
      get: {
        summary: "Get player profile",
        parameters: [{ $ref: "#/components/parameters/PlayerId" }],
        responses: {
          200: {
            description: "Player profile",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/ApiEnvelope" },
                    { type: "object", properties: { data: { $ref: "#/components/schemas/PlayerProfile" } } },
                  ],
                },
              },
            },
          },
        },
      },
    },
    "/api/player/{id}/projection": {
      get: {
        summary: "Get player projection curve",
        parameters: [{ $ref: "#/components/parameters/PlayerId" }],
        responses: {
          200: {
            description: "Projection data",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiEnvelope" },
                examples: {
                  default: {
                    value: {
                      success: true,
                      data: {
                        currentOverall: 78,
                        projectedPeak: 85,
                        ageCurve: [
                          { age: 20, overall: 76 },
                          { age: 21, overall: 78 },
                          { age: 22, overall: 80 },
                        ],
                      },
                      error: null,
                      meta: {},
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/player/{id}/similar": {
      get: {
        summary: "Get similar players",
        parameters: [{ $ref: "#/components/parameters/PlayerId" }],
        responses: {
          200: {
            description: "Similar players list",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/ApiEnvelope" },
                    { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Player" } } } },
                  ],
                },
              },
            },
          },
        },
      },
    },
    "/api/player/{id}/notes": {
      get: {
        summary: "List player notes",
        parameters: [{ $ref: "#/components/parameters/PlayerId" }],
        responses: {
          200: {
            description: "Notes list",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/ApiEnvelope" },
                    { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/ScoutNote" } } } },
                  ],
                },
              },
            },
          },
        },
      },
      post: {
        summary: "Create player note",
        parameters: [{ $ref: "#/components/parameters/PlayerId" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  note: { type: "string", minLength: 1 },
                  createdBy: { type: "string", default: "analyst" },
                },
                required: ["note"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Note created",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiEnvelope" } } },
          },
        },
      },
    },
    "/api/compare/{idA}/{idB}": {
      get: {
        summary: "Compare players by id",
        parameters: [
          { name: "idA", in: "path", required: true, schema: { type: "string" } },
          { name: "idB", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "Comparison payload",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/ApiEnvelope" },
                    { type: "object", properties: { data: { $ref: "#/components/schemas/PlayerComparison" } } },
                  ],
                },
              },
            },
          },
        },
      },
    },
    "/api/analysis": {
      get: {
        summary: "List analysis hub entries",
        parameters: [
          { name: "type", in: "query", schema: { type: "string", enum: ["COMPARISON", "REPORT"] } },
          { name: "status", in: "query", schema: { type: "string", enum: ["COMPLETED", "IN_PROGRESS", "ARCHIVED"] } },
          { name: "includeLegacy", in: "query", schema: { type: "boolean", default: true } },
        ],
        responses: {
          200: {
            description: "Analysis hub entries",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/ApiEnvelope" },
                    { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/AnalysisEntry" } } } },
                  ],
                },
              },
            },
          },
        },
      },
    },
    "/api/analysis/{id}": {
      get: {
        summary: "Get a single analysis entry",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: {
            description: "Analysis entry",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/ApiEnvelope" },
                    { type: "object", properties: { data: { $ref: "#/components/schemas/AnalysisEntry" } } },
                  ],
                },
              },
            },
          },
        },
      },
      delete: {
        summary: "Delete a persisted Analysis entry",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: {
            description: "Delete confirmation",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiEnvelope" } } },
          },
        },
      },
    },
    "/api/analysis/comparison": {
      post: {
        summary: "Create a comparison analysis entry",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  analyst: { type: "string" },
                  status: { type: "string", enum: ["COMPLETED", "IN_PROGRESS", "ARCHIVED"] },
                  playerIds: {
                    type: "array",
                    minItems: 2,
                    items: { type: "string", format: "uuid" },
                  },
                },
                required: ["playerIds"],
              },
            },
          },
        },
        responses: {
          201: {
            description: "Created analysis entry",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/ApiEnvelope" },
                    { type: "object", properties: { data: { $ref: "#/components/schemas/AnalysisEntry" } } },
                  ],
                },
              },
            },
          },
        },
      },
    },
    "/api/analysis/report": {
      post: {
        summary: "Create a persisted executive report entry",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  analyst: { type: "string" },
                  status: { type: "string", enum: ["COMPLETED", "IN_PROGRESS", "ARCHIVED"] },
                  playerIds: {
                    type: "array",
                    minItems: 1,
                    items: { type: "string", format: "uuid" },
                  },
                },
                required: ["playerIds"],
              },
            },
          },
        },
        responses: {
          201: {
            description: "Created report entry",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/ApiEnvelope" },
                    { type: "object", properties: { data: { $ref: "#/components/schemas/AnalysisEntry" } } },
                  ],
                },
              },
            },
          },
        },
      },
    },
    "/api/compare/by-name/{nameA}/{nameB}": {
      get: {
        summary: "Compare players by name",
        parameters: [
          { name: "nameA", in: "path", required: true, schema: { type: "string" } },
          { name: "nameB", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "Comparison payload",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiEnvelope" } } },
          },
        },
      },
    },
    "/api/simulation/transfer": {
      post: {
        summary: "Simulate transfer impact",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  playerId: { type: "string", format: "uuid" },
                  transferCost: { type: "number", minimum: 0 },
                  salary: { type: "number", minimum: 0 },
                  contractYears: { type: "integer", minimum: 1, maximum: 8 },
                },
                required: ["playerId", "transferCost", "salary", "contractYears"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Transfer simulation",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiEnvelope" } } },
          },
        },
      },
    },
    "/api/team/analysis": {
      get: {
        summary: "Analyze squad by player ids",
        parameters: [
          {
            name: "playerIds",
            in: "query",
            required: true,
            schema: { type: "string", example: "id1,id2,id3" },
          },
        ],
        responses: {
          200: {
            description: "Team analysis",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiEnvelope" } } },
          },
        },
      },
    },
    "/api/watchlist": {
      get: {
        summary: "List watchlist",
        responses: {
          200: {
            description: "Watchlist items",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/ApiEnvelope" },
                    { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/WatchlistItem" } } } },
                  ],
                },
              },
            },
          },
        },
      },
      post: {
        summary: "Add watchlist item",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  playerId: { type: "string", minLength: 1 },
                  playerName: { type: "string" },
                  nomeJogador: { type: "string" },
                },
                required: ["playerId"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Watchlist item upserted",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiEnvelope" } } },
          },
        },
      },
    },
    "/api/watchlist/{id}": {
      delete: {
        summary: "Remove watchlist item",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: {
            description: "Delete status",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiEnvelope" } } },
          },
        },
      },
    },
    "/api/alerts": {
      get: {
        summary: "Market alerts feed",
        responses: {
          200: {
            description: "Alerts list",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/ApiEnvelope" },
                    { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Alert" } } } },
                  ],
                },
              },
            },
          },
        },
      },
    },
    "/api/reports/{id}/explainability": {
      get: {
        summary: "Explainability payload for report",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: {
            description: "Explainability payload",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiEnvelope" },
                examples: {
                  default: {
                    value: {
                      success: true,
                      data: {
                        topFactors: [],
                        riskDrivers: [],
                        positiveSignals: [],
                        negativeSignals: [],
                      },
                      error: null,
                      meta: {},
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/validation/model": {
      post: {
        summary: "Run historical model validation",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  records: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        predictedSuccess: { type: "boolean" },
                        actualSuccess: { type: "boolean" },
                      },
                      required: ["predictedSuccess", "actualSuccess"],
                    },
                  },
                },
                required: ["records"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Validation result",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiEnvelope" } } },
          },
        },
      },
    },
    "/api/health": {
      get: {
        summary: "Health and uptime status",
        responses: {
          200: {
            description: "API health",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiEnvelope" },
                examples: {
                  ok: {
                    value: {
                      success: true,
                      data: {
                        status: "ok",
                        uptime: 12345.67,
                        timestamp: "2026-03-09T12:00:00.000Z",
                      },
                      error: null,
                      meta: {},
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};
