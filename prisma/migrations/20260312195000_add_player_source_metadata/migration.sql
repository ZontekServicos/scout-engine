ALTER TABLE "Player"
ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS "externalId" TEXT;

UPDATE "Player"
SET "source" = 'manual'
WHERE "source" IS NULL OR BTRIM("source") = '';

CREATE INDEX IF NOT EXISTS "Player_source_idx" ON "Player"("source");
CREATE UNIQUE INDEX IF NOT EXISTS "Player_source_externalId_key" ON "Player"("source", "externalId");
