import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import "dotenv/config";
import analyticsRoutes from "./routes/analytics.routes";
import analysisRoutes from "./routes/analysis.routes";
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
import smartMatchRoutes from "./routes/smart-match.routes";
import teamRoutes from "./routes/team.routes";
import validationRoutes from "./routes/validation.routes";
import watchlistRoutes from "./routes/watchlist.routes";
import eventsRoutes from "./routes/events.routes";
import ingestRoutes from "./routes/ingest.routes";
import filterRoutes from "./routes/filter.routes";
import mapsRoutes from "./routes/maps.routes";
import playerVideoRoutes from "./routes/player-video.routes";
import scoutingRoutes from "./routes/scouting.routes";
import userRoutes from "./routes/user.routes";
import adminRoutes from "./routes/admin.routes";
import { logger } from "./lib/logger";
import { errorMiddleware } from "./middleware/error.middleware";
import { requestLogger } from "./middleware/request-logger.middleware";
import { secureHeaders } from "./middleware/security.middleware";
import { authMiddleware } from "./middleware/auth.middleware";

const app = express();

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX ?? 200),
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(express.json({ limit: "1mb" }));
app.use(requestLogger);
app.use(secureHeaders);
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.options(/.*/, cors());
app.use(limiter);

// Rotas protegidas por autenticação Supabase
app.use("/api/scout", authMiddleware, scoutRoutes);
app.use("/api/analysis", authMiddleware, analysisRoutes);
app.use("/api/compare", authMiddleware, compareRoutes);
app.use("/api/ranking", authMiddleware, rankingRoutes);
app.use("/api/reports", authMiddleware, reportsRoutes);
app.use("/api/smart-match", authMiddleware, smartMatchRoutes);
app.use("/api/leaderboard", authMiddleware, leaderboardRoutes);
app.use("/api/analytics", authMiddleware, analyticsRoutes);
app.use("/api/alerts", authMiddleware, alertsRoutes);
app.use("/api/simulation", authMiddleware, simulationRoutes);
app.use("/api/team", authMiddleware, teamRoutes);
app.use("/api/validation", authMiddleware, validationRoutes);
app.use("/api", authMiddleware, playerRoutes);
app.use("/api", authMiddleware, playerVideoRoutes);
app.use("/api/watchlist", authMiddleware, watchlistRoutes);
app.use("/api/filter", authMiddleware, filterRoutes);
app.use("/api/maps", authMiddleware, mapsRoutes);
app.use("/api/scouting", authMiddleware, scoutingRoutes);
app.use("/api/user",    authMiddleware, userRoutes);
app.use("/api/admin",   authMiddleware, adminRoutes);

app.use("/api/events", authMiddleware, eventsRoutes);

// Rotas abertas (ingestão, health, docs — não expostas ao usuário final)
app.use("/api/ingest", ingestRoutes);
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
