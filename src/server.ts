import express from "express";
import scoutRoutes from "./routes/scout.routes";
import compareRoutes from "./routes/compare.routes";
import rankingRoutes from "./routes/ranking.routes";
import devRoutes from "./routes/dev.routes";
import "dotenv/config";
import leaderboardRoutes from "./routes/leaderboard.routes";
import reportsRoutes from "./routes/report.routes";
import analyticsRoutes from "./routes/analytics.routes";
import { errorMiddleware } from "./middleware/error.middleware";

const app = express();

app.use(express.json());

app.use("/api/scout", scoutRoutes);
app.use("/api/compare", compareRoutes);
app.use("/api/ranking", rankingRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use(errorMiddleware);

// 🔒 Rotas de desenvolvimento
if (process.env.NODE_ENV === "development") {
  console.log("⚠️ Dev routes enabled");
  app.use("/api", devRoutes);
}

app.listen(3000, () => {
  console.log("🚀 Scout Engine rodando em http://localhost:3000");
});
