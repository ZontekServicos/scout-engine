import "dotenv/config";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { importPlayersFromCsv } from "../src/data/players.importer";

const prisma = new PrismaClient();

async function main() {
  const inputPath = process.argv[2];

  if (!inputPath) {
    console.error("Uso: npx ts-node scripts/importPlayers.ts <caminho-do-csv>");
    process.exit(1);
  }

  const csvPath = path.resolve(process.cwd(), inputPath);
  console.log(`Iniciando importação de jogadores a partir de: ${csvPath}`);

  const result = await importPlayersFromCsv(prisma, csvPath, (progress) => {
    console.log(
      `[progresso] processados=${progress.processed} inseridos=${progress.inserted} ignorados=${progress.skipped} lotes=${progress.batches}`,
    );
  });

  console.log("Importação finalizada com sucesso.");
  console.log(
    `Resumo: processados=${result.processed}, inseridos=${result.inserted}, ignorados=${result.skipped}, lotes=${result.batches}`,
  );
}

main()
  .catch((error) => {
    console.error("Erro na importação:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
