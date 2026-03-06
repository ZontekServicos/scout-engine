-- ==========================================
-- Migração de base real para scouting
-- Objetivo: normalizar Player para ingestão massiva de dados reais
-- ==========================================

-- 1) Novas colunas para identidade e scouting real
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "nameNormalized" TEXT;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "team" TEXT;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "league" TEXT;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "marketValue" DOUBLE PRECISION;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "contractEnd" TIMESTAMP(3);
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "overall" INTEGER;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "potential" INTEGER;

-- 2) Backfill de dados obrigatórios para registros já existentes
UPDATE "Player"
SET
  "nameNormalized" = trim(regexp_replace(lower("name"), '[^a-z0-9\s]+', ' ', 'g')),
  "slug" = trim(both '-' from regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g'))
WHERE "nameNormalized" IS NULL OR "slug" IS NULL;

-- 3) Garante unicidade de slug quando existir colisão (ex: nomes iguais)
WITH duplicated AS (
  SELECT
    id,
    slug,
    ROW_NUMBER() OVER (PARTITION BY slug ORDER BY id) AS rn
  FROM "Player"
)
UPDATE "Player" p
SET "slug" = p."slug" || '-' || substring(p."id" from 1 for 8)
FROM duplicated d
WHERE p.id = d.id AND d.rn > 1;

-- 4) Preenche obrigatórios que ainda estejam nulos
UPDATE "Player" SET "nameNormalized" = 'unknown' WHERE "nameNormalized" IS NULL;
UPDATE "Player" SET "slug" = 'player-' || substring("id" from 1 for 8) WHERE "slug" IS NULL;
UPDATE "Player" SET "age" = 25 WHERE "age" IS NULL;
UPDATE "Player" SET "nationality" = 'Unknown' WHERE "nationality" IS NULL;

-- 5) Ajusta constraints para o novo contrato de dados
ALTER TABLE "Player" ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE "Player" ALTER COLUMN "nameNormalized" SET NOT NULL;
ALTER TABLE "Player" ALTER COLUMN "age" SET NOT NULL;
ALTER TABLE "Player" ALTER COLUMN "nationality" SET NOT NULL;

-- 6) Índices e constraint única para performance e deduplicação
CREATE UNIQUE INDEX IF NOT EXISTS "Player_slug_key" ON "Player"("slug");
CREATE INDEX IF NOT EXISTS "Player_nameNormalized_idx" ON "Player"("nameNormalized");
CREATE INDEX IF NOT EXISTS "Player_position_idx" ON "Player"("position");
CREATE INDEX IF NOT EXISTS "Player_league_idx" ON "Player"("league");

