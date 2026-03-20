DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'AnalysisType'
  ) THEN
    CREATE TYPE "AnalysisType" AS ENUM ('COMPARISON', 'REPORT');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'AnalysisStatus'
  ) THEN
    CREATE TYPE "AnalysisStatus" AS ENUM ('COMPLETED', 'IN_PROGRESS', 'ARCHIVED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Analysis" (
  "id" TEXT NOT NULL,
  "type" "AnalysisType" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "status" "AnalysisStatus" NOT NULL DEFAULT 'COMPLETED',
  "analyst" TEXT,
  "scout_report_id" TEXT,
  CONSTRAINT "Analysis_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Analysis"
ADD COLUMN IF NOT EXISTS "description" TEXT;

CREATE TABLE IF NOT EXISTS "AnalysisComparison" (
  "id" TEXT NOT NULL,
  "analysisId" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  CONSTRAINT "AnalysisComparison_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Analysis_scout_report_id_key" ON "Analysis"("scout_report_id");
CREATE INDEX IF NOT EXISTS "Analysis_type_idx" ON "Analysis"("type");
CREATE INDEX IF NOT EXISTS "Analysis_createdAt_idx" ON "Analysis"("createdAt");
CREATE INDEX IF NOT EXISTS "Analysis_status_idx" ON "Analysis"("status");

CREATE INDEX IF NOT EXISTS "AnalysisComparison_analysisId_idx" ON "AnalysisComparison"("analysisId");
CREATE INDEX IF NOT EXISTS "AnalysisComparison_playerId_idx" ON "AnalysisComparison"("playerId");
CREATE UNIQUE INDEX IF NOT EXISTS "AnalysisComparison_analysisId_order_key" ON "AnalysisComparison"("analysisId", "order");
CREATE UNIQUE INDEX IF NOT EXISTS "AnalysisComparison_analysisId_playerId_key" ON "AnalysisComparison"("analysisId", "playerId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Analysis_scout_report_id_fkey'
  ) THEN
    ALTER TABLE "Analysis"
    ADD CONSTRAINT "Analysis_scout_report_id_fkey"
    FOREIGN KEY ("scout_report_id")
    REFERENCES "ScoutReport"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AnalysisComparison_analysisId_fkey'
  ) THEN
    ALTER TABLE "AnalysisComparison"
    ADD CONSTRAINT "AnalysisComparison_analysisId_fkey"
    FOREIGN KEY ("analysisId")
    REFERENCES "Analysis"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AnalysisComparison_playerId_fkey'
  ) THEN
    ALTER TABLE "AnalysisComparison"
    ADD CONSTRAINT "AnalysisComparison_playerId_fkey"
    FOREIGN KEY ("playerId")
    REFERENCES "Player"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
  END IF;
END $$;
