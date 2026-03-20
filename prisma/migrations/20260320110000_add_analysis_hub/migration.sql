-- CreateEnum
CREATE TYPE "AnalysisType" AS ENUM ('COMPARISON', 'REPORT');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('COMPLETED', 'IN_PROGRESS', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Analysis" (
    "id" TEXT NOT NULL,
    "type" "AnalysisType" NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'COMPLETED',
    "analyst" TEXT,
    "scout_report_id" TEXT,

    CONSTRAINT "Analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisComparison" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "AnalysisComparison_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Analysis_scout_report_id_key" ON "Analysis"("scout_report_id");

-- CreateIndex
CREATE INDEX "Analysis_type_idx" ON "Analysis"("type");

-- CreateIndex
CREATE INDEX "Analysis_createdAt_idx" ON "Analysis"("createdAt");

-- CreateIndex
CREATE INDEX "Analysis_status_idx" ON "Analysis"("status");

-- CreateIndex
CREATE INDEX "AnalysisComparison_analysisId_idx" ON "AnalysisComparison"("analysisId");

-- CreateIndex
CREATE INDEX "AnalysisComparison_playerId_idx" ON "AnalysisComparison"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisComparison_analysisId_order_key" ON "AnalysisComparison"("analysisId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisComparison_analysisId_playerId_key" ON "AnalysisComparison"("analysisId", "playerId");

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_scout_report_id_fkey" FOREIGN KEY ("scout_report_id") REFERENCES "ScoutReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisComparison" ADD CONSTRAINT "AnalysisComparison_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisComparison" ADD CONSTRAINT "AnalysisComparison_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
