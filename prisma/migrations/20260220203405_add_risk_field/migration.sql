-- AlterTable
ALTER TABLE "ScoutReport" ADD COLUMN     "risk" JSONB;

-- CreateIndex
CREATE INDEX "ScoutReport_createdAt_idx" ON "ScoutReport"("createdAt");
