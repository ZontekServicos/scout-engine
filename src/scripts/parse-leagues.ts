/**
 * parse-leagues.ts
 *
 * Reads Ligas.xlsx from the project root, validates rows,
 * and writes leagues.json to src/scripts/.
 *
 * Run:
 *   npx ts-node src/scripts/parse-leagues.ts
 *
 * Requires xlsx (devDependency):
 *   npm install xlsx --save-dev
 *
 * Excel structure (every 3 rows = 1 league):
 *   Row N+0: [id, null, null, currentSeasonId]
 *   Row N+1: [null, name, country, null]
 *   Row N+2: [null, null, region, null]   ← ignored
 */

import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LeagueSeed {
  id: number;
  name: string;
  country: string;
  currentSeasonId: number;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function parseLeagues(filePath: string): { valid: LeagueSeed[]; skipped: number } {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: (string | number | null)[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
  });

  const valid: LeagueSeed[] = [];
  let skipped = 0;

  for (let i = 0; i < raw.length; i += 3) {
    const r0 = raw[i];
    const r1 = raw[i + 1];

    if (!r0 || !r1) { skipped++; continue; }

    const id = r0[0];
    const currentSeasonId = r0[3];
    const name = r1[1];
    const country = r1[2];

    // Validate required fields
    if (typeof id !== "number" || isNaN(id)) { skipped++; continue; }
    if (typeof name !== "string" || name.trim() === "") { skipped++; continue; }
    if (typeof currentSeasonId !== "number" || isNaN(currentSeasonId)) { skipped++; continue; }

    valid.push({
      id,
      name: name.trim(),
      country: typeof country === "string" ? country.trim() : "Unknown",
      currentSeasonId,
    });
  }

  return { valid, skipped };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const EXCEL_PATH = path.resolve(__dirname, "../../../Ligas.xlsx");
const OUT_PATH = path.resolve(__dirname, "leagues.json");

const { valid, skipped } = parseLeagues(EXCEL_PATH);

fs.writeFileSync(OUT_PATH, JSON.stringify(valid, null, 2), "utf-8");

console.log(`[parse-leagues] Parsed ${valid.length} valid leagues (${skipped} skipped).`);
console.log(`[parse-leagues] Output: ${OUT_PATH}`);
