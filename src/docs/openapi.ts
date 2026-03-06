export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "SoccerMind API",
    version: "2.0.0",
    description: "Institutional scouting, risk and transfer decision platform",
  },
  servers: [{ url: "http://localhost:3000" }],
  paths: {
    "/api/compare/{idA}/{idB}": { get: { summary: "Compare players by id" } },
    "/api/compare/by-name/{nameA}/{nameB}": { get: { summary: "Compare players by name" } },
    "/api/simulation/transfer": { post: { summary: "Simulate transfer impact" } },
    "/api/team/analysis": { get: { summary: "Analyze full squad by player ids" } },
    "/api/player/{id}": { get: { summary: "Get player profile" } },
    "/api/player/{id}/projection": { get: { summary: "Get career projection" } },
    "/api/player/{id}/similar": { get: { summary: "Get similar players" } },
    "/api/player/{id}/notes": {
      get: { summary: "List player notes" },
      post: { summary: "Create player note" },
    },
    "/api/watchlist": {
      get: { summary: "List watchlist" },
      post: { summary: "Add watchlist item" },
    },
    "/api/watchlist/{id}": { delete: { summary: "Remove watchlist item" } },
    "/api/alerts": { get: { summary: "Market alerts feed" } },
    "/api/reports/{id}/explainability": { get: { summary: "Explainability payload for report" } },
    "/api/health": { get: { summary: "Health and uptime status" } },
    "/api/validation/model": { post: { summary: "Run historical model validation" } },
  },
};
