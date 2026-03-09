import express from "express";
import "dotenv/config";
import analyticsRoutes from "./routes/analytics.routes";
import alertsRoutes from "./routes/alerts.routes";
import compareRoutes from "./routes/compare.routes";
import devRoutes from "./routes/dev.routes";
import docsRoutes from "./routes/docs.routes";
import healthRoutes from "./routes/health.routes";
import leaderboardRoutes from "./routes/leaderboard.routes";
import playerRoutes from "./routes/player.routes";
import rankingRoutes from "./routes/ranking.routes";
import reportsRoutes from "./routes/report.routes";
import scoutRoutes from "./routes/scout.routes";
import simulationRoutes from "./routes/simulation.routes";
import teamRoutes from "./routes/team.routes";
import validationRoutes from "./routes/validation.routes";
import watchlistRoutes from "./routes/watchlist.routes";
import { logger } from "./lib/logger";
import { errorMiddleware } from "./middleware/error.middleware";
import { requestLogger } from "./middleware/request-logger.middleware";
import { corsControl, rateLimiter, secureHeaders } from "./middleware/security.middleware";

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(requestLogger);
app.use(secureHeaders);
app.use(corsControl);
app.use(rateLimiter);

app.use("/api/scout", scoutRoutes);
app.use("/api/compare", compareRoutes);
app.use("/api/ranking", rankingRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/alerts", alertsRoutes);
app.use("/api/simulation", simulationRoutes);
app.use("/api/team", teamRoutes);
app.use("/api/validation", validationRoutes);
app.use("/api", playerRoutes);
app.use("/api/watchlist", watchlistRoutes);
app.use("/api/health", healthRoutes);
app.use("/api/docs", docsRoutes);

if (process.env.NODE_ENV === "development") {
  logger.warn("Dev routes enabled");
  app.use("/api", devRoutes);
}

app.use(errorMiddleware);

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
