-- CreateEnum
CREATE TYPE "ScoutType" AS ENUM ('SINGLE', 'COMPARE', 'RANKING');

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "age" INTEGER,
    "nationality" TEXT,
    "attributes" JSONB NOT NULL,
    "archetype" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoutReport" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "type" "ScoutType" NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB NOT NULL,
    "aiNarrative" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoutReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Player_position_idx" ON "Player"("position");

-- CreateIndex
CREATE INDEX "ScoutReport_playerId_idx" ON "ScoutReport"("playerId");

-- CreateIndex
CREATE INDEX "ScoutReport_type_idx" ON "ScoutReport"("type");

-- AddForeignKey
ALTER TABLE "ScoutReport" ADD CONSTRAINT "ScoutReport_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
