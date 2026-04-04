-- ============================================================================
-- migrate-enrichment.sql
--
-- Adds physical profile fields to Player, expands PlayerStats with full
-- Sportmonks stat set, extends Team with shortCode/logoPath/countryId,
-- and adds calculated overall breakdown columns.
--
-- All statements are idempotent (IF NOT EXISTS / IF EXISTS guards).
-- Run with:
--   npx prisma db execute --file prisma/migrate-enrichment.sql --schema prisma/schema.prisma
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Player — physical profile
-- ----------------------------------------------------------------------------
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "height"              INTEGER;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "weight"              INTEGER;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "foot"                TEXT;

-- Player — overall breakdown
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "overallPace"         INTEGER;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "overallShooting"     INTEGER;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "overallPassing"      INTEGER;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "overallDribbling"    INTEGER;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "overallDefending"    INTEGER;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "overallPhysical"     INTEGER;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "overallGkDiving"     INTEGER;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "overallGkHandling"   INTEGER;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "overallGkKicking"    INTEGER;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "overallGkReflex"     INTEGER;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "overallGkPositioning" INTEGER;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "overallCalculatedAt" TIMESTAMP(3);

-- Indexes for overall-based queries
CREATE INDEX IF NOT EXISTS "Player_overallPace_idx"     ON "Player"("overallPace");
CREATE INDEX IF NOT EXISTS "Player_overallCalculatedAt_idx" ON "Player"("overallCalculatedAt");

-- ----------------------------------------------------------------------------
-- Team — branding & country link
-- ----------------------------------------------------------------------------
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "shortCode"  TEXT;
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "logoPath"   TEXT;
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "countryId"  TEXT;

ALTER TABLE "Team" DROP CONSTRAINT IF EXISTS "Team_countryId_fkey";
ALTER TABLE "Team" ADD CONSTRAINT "Team_countryId_fkey"
  FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Team_countryId_idx" ON "Team"("countryId");

-- ----------------------------------------------------------------------------
-- PlayerStats — full Sportmonks stat set
-- ----------------------------------------------------------------------------

-- Shooting extras
ALTER TABLE "PlayerStats" ADD COLUMN IF NOT EXISTS "xGChain"           DOUBLE PRECISION;
ALTER TABLE "PlayerStats" ADD COLUMN IF NOT EXISTS "xGBuildup"         DOUBLE PRECISION;

-- Passing extras
ALTER TABLE "PlayerStats" ADD COLUMN IF NOT EXISTS "progressivePasses"  INTEGER;
ALTER TABLE "PlayerStats" ADD COLUMN IF NOT EXISTS "longPasses"          INTEGER;
ALTER TABLE "PlayerStats" ADD COLUMN IF NOT EXISTS "longPassAccuracy"    DOUBLE PRECISION;
ALTER TABLE "PlayerStats" ADD COLUMN IF NOT EXISTS "crosses"             INTEGER;
ALTER TABLE "PlayerStats" ADD COLUMN IF NOT EXISTS "crossAccuracy"       DOUBLE PRECISION;

-- Dribbling & Carrying
ALTER TABLE "PlayerStats" ADD COLUMN IF NOT EXISTS "dribblesAttempted"   INTEGER;
ALTER TABLE "PlayerStats" ADD COLUMN IF NOT EXISTS "dribblesSuccess"      INTEGER;
ALTER TABLE "PlayerStats" ADD COLUMN IF NOT EXISTS "carries"              INTEGER;
ALTER TABLE "PlayerStats" ADD COLUMN IF NOT EXISTS "progressiveCarries"   INTEGER;

-- Defensive extras
ALTER TABLE "PlayerStats" ADD COLUMN IF NOT EXISTS "tacklesWon"          INTEGER;
ALTER TABLE "PlayerStats" ADD COLUMN IF NOT EXISTS "clearances"          INTEGER;
ALTER TABLE "PlayerStats" ADD COLUMN IF NOT EXISTS "blocks"              INTEGER;
ALTER TABLE "PlayerStats" ADD COLUMN IF NOT EXISTS "pressuresSuccess"    INTEGER;
ALTER TABLE "PlayerStats" ADD COLUMN IF NOT EXISTS "recoveries"          INTEGER;

-- Duels
ALTER TABLE "PlayerStats" ADD COLUMN IF NOT EXISTS "duelsTotal"          INTEGER;
ALTER TABLE "PlayerStats" ADD COLUMN IF NOT EXISTS "duelsWon"            INTEGER;
ALTER TABLE "PlayerStats" ADD COLUMN IF NOT EXISTS "aerialDuelsTotal"    INTEGER;
ALTER TABLE "PlayerStats" ADD COLUMN IF NOT EXISTS "aerialDuelsWon"      INTEGER;
ALTER TABLE "PlayerStats" ADD COLUMN IF NOT EXISTS "groundDuelsWon"      INTEGER;

-- Discipline
ALTER TABLE "PlayerStats" ADD COLUMN IF NOT EXISTS "yellowCards"         INTEGER;
ALTER TABLE "PlayerStats" ADD COLUMN IF NOT EXISTS "redCards"            INTEGER;
ALTER TABLE "PlayerStats" ADD COLUMN IF NOT EXISTS "foulsCommitted"      INTEGER;
ALTER TABLE "PlayerStats" ADD COLUMN IF NOT EXISTS "foulsDrawn"          INTEGER;

-- Goalkeeping
ALTER TABLE "PlayerStats" ADD COLUMN IF NOT EXISTS "saves"              INTEGER;
ALTER TABLE "PlayerStats" ADD COLUMN IF NOT EXISTS "savePct"            DOUBLE PRECISION;
ALTER TABLE "PlayerStats" ADD COLUMN IF NOT EXISTS "cleanSheets"        INTEGER;
ALTER TABLE "PlayerStats" ADD COLUMN IF NOT EXISTS "goalsConceded"      INTEGER;

-- Physical
ALTER TABLE "PlayerStats" ADD COLUMN IF NOT EXISTS "distanceCovered"    DOUBLE PRECISION;
ALTER TABLE "PlayerStats" ADD COLUMN IF NOT EXISTS "sprints"            INTEGER;
