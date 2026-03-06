import "dotenv/config";
import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { PrismaClient } from "@prisma/client";
import { nameToSlug, normalizeName } from "../src/utils/normalizeName";
import { parsePositions, SUPPORTED_POSITIONS } from "../src/utils/positions";

const prisma = new PrismaClient();

type CsvRow = {
  short_name?: string;
  player_positions?: string;
  age?: string;
  nationality?: string;
  club_name?: string;
  league_name?: string;
  overall?: string;
  potential?: string;
  value_eur?: string;
};

type ImportStats = {
  processed: number;
  updated: number;
  created: number;
  skipped: number;
};

function buildFallbackAttributes(overall?: number | null) {
  const base = Math.max(40, Math.min(99, overall ?? 60));
  return {
    pace: base,
    shooting: base,
    passing: base,
    dribbling: base,
    defending: base,
    physical: base,
    overall: base,
  };
}

/**
 * Faz merge de posições sem duplicar e removendo entradas fora do padrão.
 * Esta função é o núcleo da atualização incremental pedida.
 */
function mergePositions(existing: string[] | null | undefined, incoming: string[]): string[] {
  const merged = new Set<string>();

  for (const position of existing ?? []) {
    if (SUPPORTED_POSITIONS.includes(position as any)) {
      merged.add(position);
    }
  }

  for (const position of incoming) {
    if (SUPPORTED_POSITIONS.includes(position as any)) {
      merged.add(position);
    }
  }

  return Array.from(merged);
}

/**
 * Atualiza jogadores existentes por slug/nameNormalized e cria novos
 * quando não há correspondência. Não duplica jogadores já existentes.
 */
async function updatePlayerPositionsFromCsv(csvPath: string): Promise<ImportStats> {
  let processed = 0;
  let updated = 0;
  let created = 0;
  let skipped = 0;

  await new Promise<void>((resolve, reject) => {
    const parser = fs.createReadStream(csvPath).pipe(csv());

    parser
      .on("data", async (row: CsvRow) => {
        // Pausamos o stream para evitar concorrência não controlada entre updates.
        parser.pause();

        try {
          processed += 1;

          const name = String(row.short_name ?? "").trim();
          if (!name) {
            skipped += 1;
            parser.resume();
            return;
          }

          const slug = nameToSlug(name);
          const nameNormalized = normalizeName(name);
          const incomingPositions = parsePositions(String(row.player_positions ?? ""));

          // Se não houver posição válida, não faz sentido atualizar/criar.
          if (!incomingPositions.length) {
            skipped += 1;
            parser.resume();
            return;
          }

          // Busca por slug (chave principal textual) e fallback por nameNormalized.
          const existingBySlug = await prisma.player.findUnique({ where: { slug } });
          const existingByName = existingBySlug
            ? existingBySlug
            : await prisma.player.findFirst({ where: { nameNormalized } });

          if (existingByName) {
            const merged = mergePositions(existingByName.positions, incomingPositions);

            // Atualiza apenas se houve mudança real, reduzindo escrita desnecessária.
            const hasChanged =
              merged.length !== (existingByName.positions?.length ?? 0) ||
              merged.some((position) => !(existingByName.positions ?? []).includes(position));

            if (hasChanged) {
              await prisma.player.update({
                where: { id: existingByName.id },
                data: { positions: merged },
              });
              updated += 1;
            } else {
              skipped += 1;
            }
          } else {
            // Criação de novo jogador somente quando não existe por slug/nome normalizado.
            const age = Number(row.age ?? 24);
            const overall = row.overall ? Number(row.overall) : null;
            const potential = row.potential ? Number(row.potential) : null;
            const marketValue = row.value_eur ? Number(row.value_eur) : null;
            const nationality = String(row.nationality ?? "Unknown").trim() || "Unknown";

            await prisma.player.create({
              data: {
                slug,
                name,
                nameNormalized,
                positions: incomingPositions,
                age: Number.isFinite(age) && age > 0 ? age : 24,
                nationality,
                team: row.club_name ? String(row.club_name).trim() : null,
                league: row.league_name ? String(row.league_name).trim() : null,
                marketValue,
                contractEnd: null,
                overall,
                potential,
                attributes: buildFallbackAttributes(overall),
                archetype: {
                  role: `Imported ${incomingPositions[0]}`,
                },
              },
            });

            created += 1;
          }

          parser.resume();
        } catch (error) {
          reject(error);
        }
      })
      .on("end", () => resolve())
      .on("error", reject);
  });

  return { processed, updated, created, skipped };
}

/**
 * Entrada do script:
 * npx ts-node scripts/updatePlayerPositions.ts data/players.csv
 */
async function main() {
  const inputFile = process.argv[2];

  if (!inputFile) {
    console.error("Uso: npx ts-node scripts/updatePlayerPositions.ts <caminho-do-csv>");
    process.exit(1);
  }

  const csvPath = path.resolve(process.cwd(), inputFile);
  console.log(`Atualização incremental de posições iniciada: ${csvPath}`);

  const stats = await updatePlayerPositionsFromCsv(csvPath);

  console.log("Atualização concluída.");
  console.log(
    `processados=${stats.processed} atualizados=${stats.updated} criados=${stats.created} ignorados=${stats.skipped}`,
  );
}

main()
  .catch((error) => {
    console.error("Erro na atualização incremental de posições:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
