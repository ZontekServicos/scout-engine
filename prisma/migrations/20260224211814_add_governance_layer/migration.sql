-- CreateEnum
CREATE TYPE "DecisionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "ScoutReport" ADD COLUMN     "decisionAt" TIMESTAMP(3),
ADD COLUMN     "decisionStatus" "DecisionStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "requestedBy" TEXT,
ADD COLUMN     "technicalReason" TEXT;

-- CreateIndex
CREATE INDEX "ScoutReport_decisionStatus_idx" ON "ScoutReport"("decisionStatus");
