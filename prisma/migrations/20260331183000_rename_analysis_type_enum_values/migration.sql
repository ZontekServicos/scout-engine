DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'AnalysisType' AND e.enumlabel = 'REPORT'
  ) THEN
    ALTER TYPE "AnalysisType" RENAME VALUE 'REPORT' TO 'PLAYER_REPORT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'AnalysisType' AND e.enumlabel = 'COMPARISON'
  ) THEN
    ALTER TYPE "AnalysisType" RENAME VALUE 'COMPARISON' TO 'PLAYER_COMPARISON';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Analysis'
      AND column_name = 'type'
      AND data_type = 'text'
  ) THEN
    UPDATE "Analysis"
    SET "type" = CASE
      WHEN "type" = 'REPORT' THEN 'PLAYER_REPORT'
      WHEN "type" = 'COMPARISON' THEN 'PLAYER_COMPARISON'
      ELSE "type"
    END
    WHERE "type" IN ('REPORT', 'COMPARISON');
  END IF;
END $$;
