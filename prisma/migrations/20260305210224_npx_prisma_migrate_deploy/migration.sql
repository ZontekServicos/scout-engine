-- AlterTable
ALTER TABLE "ScoutReport" ADD COLUMN     "antiFlopVersion" TEXT,
ADD COLUMN     "decisionBy" TEXT,
ADD COLUMN     "decisionDate" TIMESTAMP(3),
ADD COLUMN     "decisionReason" TEXT,
ADD COLUMN     "engineVersion" TEXT,
ADD COLUMN     "modelVersion" TEXT,
ADD COLUMN     "riskVersion" TEXT;
