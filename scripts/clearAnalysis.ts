import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.analysis.deleteMany();
  console.log(`Deleted ${result.count} Analysis records.`);
}

main()
  .catch((error) => {
    console.error("Failed to clear Analysis records:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
