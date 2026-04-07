-- Migration: add SoccerMind DNA score columns to Player
-- dnaScore  : JSONB storing { impact, intelligence, defensiveIQ, consistency, potential }
-- dnaCalculatedAt : timestamp of last DNA recalculation

ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "dnaScore" JSONB;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "dnaCalculatedAt" TIMESTAMP(3);
