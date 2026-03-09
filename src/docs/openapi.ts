export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "SoccerMind API",
    version: "2.1.0",
    description: "Institutional scouting, risk and transfer decision platform",
  },
  servers: [{ url: "http://localhost:3000" }],
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
          position: { type: "string", example: "ST" },
          team: { type: ["string", "null"] },
          league: { type: ["string", "null"] },
          positions: { type: "array", items: { type: "string" } },
          nationality: { type: "string" },
          age: { type: "integer" },
          overall: { type: ["integer", "null"] },
          potential: { type: ["integer", "null"] },
          marketValue: { type: ["number", "null"] },
          image: { type: ["string", "null"] },
          image_path: { type: ["string", "null"] },
          attributes: { type: "object", additionalProperties: true },
        },
        required: ["id", "name", "position", "nationality", "age"],
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
        properties: {
          players: { type: "object", additionalProperties: true },
          overallRating: { type: "object", additionalProperties: true },
          quantitative: { type: "object", additionalProperties: true },
          risk: { type: "object", additionalProperties: true },
          financialRisk: { type: "object", additionalProperties: true },
        },
      },
      Alert: {
        type: "object",
        properties: {
          type: { type: "string" },
          severity: { type: "string" },
          playerId: { type: "string" },
          playerName: { type: "string" },
          message: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      WatchlistItem: {
        type: "object",
        properties: {
          id: { type: "string" },
          playerId: { type: "string" },
          nomeJogador: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
  paths: {
    "/api/players": {
      get: {
        summary: "List players with filtering and pagination",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
          { name: "position", in: "query", schema: { type: "string" } },
          { name: "team", in: "query", schema: { type: "string" } },
          { name: "league", in: "query", schema: { type: "string" } },
          { name: "minOverall", in: "query", schema: { type: "integer", minimum: 1, maximum: 99 } },
          { name: "ageMin", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "ageMax", in: "query", schema: { type: "integer", minimum: 1 } },
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
                        data: {
                          type: "array",
                          items: { $ref: "#/components/schemas/Player" },
                        },
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
    "/api/players/search": {
      get: {
        summary: "Search players with advanced filters",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
          { name: "position", in: "query", schema: { type: "string" } },
          { name: "team", in: "query", schema: { type: "string" } },
          { name: "league", in: "query", schema: { type: "string" } },
          { name: "ageMin", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "ageMax", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "overallMin", in: "query", schema: { type: "integer", minimum: 1, maximum: 99 } },
          { name: "overallMax", in: "query", schema: { type: "integer", minimum: 1, maximum: 99 } },
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
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: {
            description: "Player profile",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/ApiEnvelope" },
                    {
                      type: "object",
                      properties: {
                        data: { $ref: "#/components/schemas/PlayerProfile" },
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
    "/api/player/{id}/projection": { get: { summary: "Get career projection" } },
    "/api/player/{id}/similar": { get: { summary: "Get similar players" } },
    "/api/player/{id}/notes": {
      get: { summary: "List player notes" },
      post: { summary: "Create player note" },
    },
    "/api/compare/{idA}/{idB}": {
      get: {
        summary: "Compare players by id",
        responses: {
          200: {
            description: "Comparison payload",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/ApiEnvelope" },
                    {
                      type: "object",
                      properties: {
                        data: { $ref: "#/components/schemas/PlayerComparison" },
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
    "/api/compare/by-name/{nameA}/{nameB}": { get: { summary: "Compare players by name" } },
    "/api/simulation/transfer": { post: { summary: "Simulate transfer impact" } },
    "/api/team/analysis": { get: { summary: "Analyze full squad by player ids" } },
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
                    {
                      type: "object",
                      properties: {
                        data: {
                          type: "array",
                          items: { $ref: "#/components/schemas/WatchlistItem" },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
      post: { summary: "Add watchlist item" },
    },
    "/api/watchlist/{id}": { delete: { summary: "Remove watchlist item" } },
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
                    {
                      type: "object",
                      properties: {
                        data: {
                          type: "array",
                          items: { $ref: "#/components/schemas/Alert" },
                        },
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
    "/api/reports/{id}/explainability": { get: { summary: "Explainability payload for report" } },
    "/api/health": { get: { summary: "Health and uptime status" } },
    "/api/validation/model": { post: { summary: "Run historical model validation" } },
  },
};
