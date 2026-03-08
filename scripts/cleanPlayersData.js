const fs = require("fs");
const csv = require("csv-parser");
const { createObjectCsvWriter } = require("csv-writer");

const inputFile = "./data/players.csv";
const outputFile = "./data_clean/players_clean.csv";

const cleanedRows = [];

fs.createReadStream(inputFile)
  .pipe(csv())
  .on("data", (row) => {
    try {
      if (!row.name) return;

      const player = {
        name: row.name.trim(),
        age: row.age ? Number(row.age) : null,
        club: row.club ? row.club.trim() : null,
        nationality: row.nationality ? row.nationality.trim() : null,
        market_value: row.market_value ? Number(row.market_value) : 0,
      };

      cleanedRows.push(player);
    } catch (error) {
      console.error("Erro ao processar linha:", error);
    }
  })
  .on("end", async () => {
    try {
      const csvWriter = createObjectCsvWriter({
        path: outputFile,
        header: [
          { id: "name", title: "name" },
          { id: "age", title: "age" },
          { id: "club", title: "club" },
          { id: "nationality", title: "nationality" },
          { id: "market_value", title: "market_value" },
        ],
      });

      await csvWriter.writeRecords(cleanedRows);

      console.log("✅ Dataset limpo criado em:", outputFile);
    } catch (error) {
      console.error("Erro ao salvar CSV:", error);
    }
  })
  .on("error", (error) => {
    console.error("Erro na leitura do CSV:", error);
  });
