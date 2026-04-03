-- Country
CREATE TABLE IF NOT EXISTS "Country" (
  "id"         TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "externalId" INTEGER NOT NULL,
  "name"       TEXT NOT NULL,
  "iso2"       TEXT,
  "flagPath"   TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Country_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Country_externalId_key" ON "Country"("externalId");
CREATE INDEX IF NOT EXISTS "Country_name_idx" ON "Country"("name");

-- League
CREATE TABLE IF NOT EXISTS "League" (
  "id"         TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "externalId" INTEGER NOT NULL,
  "name"       TEXT NOT NULL,
  "countryId"  TEXT,
  "type"       TEXT,
  "logoPath"   TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "League_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "League_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "League_externalId_key" ON "League"("externalId");
CREATE INDEX IF NOT EXISTS "League_name_idx" ON "League"("name");
CREATE INDEX IF NOT EXISTS "League_countryId_idx" ON "League"("countryId");

-- Season
CREATE TABLE IF NOT EXISTS "Season" (
  "id"         TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "externalId" INTEGER NOT NULL,
  "name"       TEXT NOT NULL,
  "leagueId"   TEXT,
  "year"       INTEGER,
  "isCurrent"  BOOLEAN NOT NULL DEFAULT false,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Season_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Season_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Season_externalId_key" ON "Season"("externalId");
CREATE INDEX IF NOT EXISTS "Season_leagueId_idx" ON "Season"("leagueId");
CREATE INDEX IF NOT EXISTS "Season_isCurrent_idx" ON "Season"("isCurrent");
CREATE INDEX IF NOT EXISTS "Season_year_idx" ON "Season"("year");

-- SeasonTeams (M2M join table)
CREATE TABLE IF NOT EXISTS "_SeasonTeams" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL,
  CONSTRAINT "_SeasonTeams_AB_pkey" PRIMARY KEY ("A","B"),
  CONSTRAINT "_SeasonTeams_A_fkey" FOREIGN KEY ("A") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "_SeasonTeams_B_fkey" FOREIGN KEY ("B") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "_SeasonTeams_B_index" ON "_SeasonTeams"("B");

-- Match
CREATE TABLE IF NOT EXISTS "Match" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "externalId"  INTEGER NOT NULL,
  "seasonId"    TEXT,
  "homeTeamId"  TEXT,
  "awayTeamId"  TEXT,
  "homeScore"   INTEGER,
  "awayScore"   INTEGER,
  "startingAt"  TIMESTAMP(3),
  "status"      TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Match_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Match_seasonId_fkey"   FOREIGN KEY ("seasonId")   REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Match_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team"("id")   ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Match_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team"("id")   ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Match_externalId_key" ON "Match"("externalId");
CREATE INDEX IF NOT EXISTS "Match_seasonId_idx"   ON "Match"("seasonId");
CREATE INDEX IF NOT EXISTS "Match_homeTeamId_idx" ON "Match"("homeTeamId");
CREATE INDEX IF NOT EXISTS "Match_awayTeamId_idx" ON "Match"("awayTeamId");
CREATE INDEX IF NOT EXISTS "Match_startingAt_idx" ON "Match"("startingAt");
CREATE INDEX IF NOT EXISTS "Match_status_idx"     ON "Match"("status");

-- MatchEvent
CREATE TABLE IF NOT EXISTS "MatchEvent" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "externalId"  INTEGER,
  "matchId"     TEXT NOT NULL,
  "playerId"    TEXT,
  "teamId"      TEXT,
  "type"        TEXT NOT NULL,
  "minute"      INTEGER,
  "extraMinute" INTEGER,
  "x"           DOUBLE PRECISION,
  "y"           DOUBLE PRECISION,
  "endX"        DOUBLE PRECISION,
  "endY"        DOUBLE PRECISION,
  "outcome"     TEXT,
  "meta"        JSONB,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MatchEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MatchEvent_matchId_fkey"  FOREIGN KEY ("matchId")  REFERENCES "Match"("id")  ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MatchEvent_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MatchEvent_teamId_fkey"   FOREIGN KEY ("teamId")   REFERENCES "Team"("id")   ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "MatchEvent_externalId_key"   ON "MatchEvent"("externalId") WHERE "externalId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "MatchEvent_matchId_idx"             ON "MatchEvent"("matchId");
CREATE INDEX IF NOT EXISTS "MatchEvent_playerId_idx"            ON "MatchEvent"("playerId");
CREATE INDEX IF NOT EXISTS "MatchEvent_teamId_idx"              ON "MatchEvent"("teamId");
CREATE INDEX IF NOT EXISTS "MatchEvent_type_idx"                ON "MatchEvent"("type");
CREATE INDEX IF NOT EXISTS "MatchEvent_minute_idx"              ON "MatchEvent"("minute");
CREATE INDEX IF NOT EXISTS "MatchEvent_playerId_type_idx"       ON "MatchEvent"("playerId","type");
CREATE INDEX IF NOT EXISTS "MatchEvent_matchId_type_idx"        ON "MatchEvent"("matchId","type");

-- Add seasonId to PlayerStats
ALTER TABLE "PlayerStats" ADD COLUMN IF NOT EXISTS "seasonId" TEXT;
ALTER TABLE "PlayerStats" DROP CONSTRAINT IF EXISTS "PlayerStats_seasonId_fkey";
ALTER TABLE "PlayerStats" ADD CONSTRAINT "PlayerStats_seasonId_fkey"
  FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "PlayerStats_seasonId_idx" ON "PlayerStats"("seasonId");
