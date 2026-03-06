-- Migração incremental para suportar múltiplas posições por jogador.
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "positions" TEXT[];

-- Converte posição única antiga para array com um item.
UPDATE "Player"
SET "positions" = ARRAY["position"]
WHERE "positions" IS NULL AND "position" IS NOT NULL;

-- Fallback para registros sem posição.
UPDATE "Player"
SET "positions" = ARRAY['CM']
WHERE "positions" IS NULL OR array_length("positions", 1) IS NULL;

ALTER TABLE "Player" ALTER COLUMN "positions" SET NOT NULL;
ALTER TABLE "Player" DROP COLUMN IF EXISTS "position";

