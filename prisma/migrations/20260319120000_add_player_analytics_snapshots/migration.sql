CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

CREATE TABLE "PlayerMetrics" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "overall" INTEGER NOT NULL,
    "potential" INTEGER NOT NULL,
    "pace" INTEGER NOT NULL,
    "shooting" INTEGER NOT NULL,
    "passing" INTEGER NOT NULL,
    "defending" INTEGER NOT NULL,
    "physical" INTEGER NOT NULL,
    "dribbling" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerMetrics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlayerFinancials" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "marketValue" DOUBLE PRECISION,
    "salary" DOUBLE PRECISION,
    "transferCostEstimate" DOUBLE PRECISION,
    "contractYears" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerFinancials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlayerRiskSnapshot" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "structuralRisk" DOUBLE PRECISION NOT NULL,
    "financialRisk" DOUBLE PRECISION NOT NULL,
    "liquidityScore" DOUBLE PRECISION NOT NULL,
    "compositeRisk" DOUBLE PRECISION NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "explanation" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerRiskSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlayerMetrics_playerId_idx" ON "PlayerMetrics"("playerId");
CREATE INDEX "PlayerMetrics_timestamp_idx" ON "PlayerMetrics"("timestamp");
CREATE INDEX "PlayerFinancials_playerId_idx" ON "PlayerFinancials"("playerId");
CREATE INDEX "PlayerFinancials_timestamp_idx" ON "PlayerFinancials"("timestamp");
CREATE INDEX "PlayerRiskSnapshot_playerId_idx" ON "PlayerRiskSnapshot"("playerId");
CREATE INDEX "PlayerRiskSnapshot_riskLevel_idx" ON "PlayerRiskSnapshot"("riskLevel");
CREATE INDEX "PlayerRiskSnapshot_timestamp_idx" ON "PlayerRiskSnapshot"("timestamp");

ALTER TABLE "PlayerMetrics"
ADD CONSTRAINT "PlayerMetrics_playerId_fkey"
FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlayerFinancials"
ADD CONSTRAINT "PlayerFinancials_playerId_fkey"
FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlayerRiskSnapshot"
ADD CONSTRAINT "PlayerRiskSnapshot_playerId_fkey"
FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
