CREATE TABLE IF NOT EXISTS "events" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "events_userId_idx" ON "events"("userId");
CREATE INDEX IF NOT EXISTS "events_type_idx" ON "events"("type");
CREATE INDEX IF NOT EXISTS "events_userId_createdAt_idx" ON "events"("userId", "createdAt" DESC);

DO $$
BEGIN
  IF to_regclass('"UserEvent"') IS NOT NULL THEN
    INSERT INTO "events" ("id", "userId", "type", "payload", "createdAt")
    SELECT "id", "userId", "type", "payload", "createdAt"
    FROM "UserEvent"
    ON CONFLICT ("id") DO NOTHING;
  END IF;
END $$;
