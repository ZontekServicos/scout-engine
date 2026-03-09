-- Adiciona URL da foto do jogador para persistir image_path da Sportmonks
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "image_path" TEXT;
