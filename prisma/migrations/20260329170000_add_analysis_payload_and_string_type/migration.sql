ALTER TABLE "Analysis"
ALTER COLUMN "type" TYPE TEXT USING "type"::text;

ALTER TABLE "Analysis"
ADD COLUMN "payload" JSONB;
