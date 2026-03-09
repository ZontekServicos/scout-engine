CREATE INDEX IF NOT EXISTS "Player_team_idx" ON "Player"("team");
CREATE INDEX IF NOT EXISTS "Player_overall_desc_idx" ON "Player"("overall" DESC);
CREATE INDEX IF NOT EXISTS "Player_potential_desc_idx" ON "Player"("potential" DESC);
CREATE INDEX IF NOT EXISTS "Player_positions_gin_idx" ON "Player" USING GIN("positions");
