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
import eventsRoutes        from "./routes/events.routes";
import searchHistoryRoutes from "./routes/search-history.routes";
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
import { accessGuardMiddleware } from "./middleware/access-guard.middleware";

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

const auth = [authMiddleware, accessGuardMiddleware];

// Rotas protegidas por autenticação Supabase + controle de acesso (trial)
app.use("/api/scout",       ...auth, scoutRoutes);
app.use("/api/analysis",    ...auth, analysisRoutes);
app.use("/api/compare",     ...auth, compareRoutes);
app.use("/api/ranking",     ...auth, rankingRoutes);
app.use("/api/reports",     ...auth, reportsRoutes);
app.use("/api/smart-match", ...auth, smartMatchRoutes);
app.use("/api/leaderboard", ...auth, leaderboardRoutes);
app.use("/api/analytics",   ...auth, analyticsRoutes);
app.use("/api/alerts",      ...auth, alertsRoutes);
app.use("/api/simulation",  ...auth, simulationRoutes);
app.use("/api/team",        ...auth, teamRoutes);
app.use("/api/validation",  ...auth, validationRoutes);
app.use("/api",             ...auth, playerRoutes);
app.use("/api",             ...auth, playerVideoRoutes);
app.use("/api/watchlist",   ...auth, watchlistRoutes);
app.use("/api/filter",      ...auth, filterRoutes);
app.use("/api/maps",        ...auth, mapsRoutes);
app.use("/api/scouting",    ...auth, scoutingRoutes);
app.use("/api/user",        ...auth, userRoutes);
app.use("/api/events",         ...auth, eventsRoutes);
app.use("/api/search-history", ...auth, searchHistoryRoutes);

// Admin — apenas autenticação (admins não têm trial)
app.use("/api/admin", authMiddleware, adminRoutes);

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
