/**
 * seed-mock-players.ts
 *
 * Generates intelligent mock players for leagues with limited or no API coverage.
 *
 * STRATEGY
 * ─────────────────────────────────────────────────────────────────────────────
 *   1. Sample real players from leagues already in the DB.
 *   2. For each donor player, create a variation:
 *       • New name (generated from nationality-specific name pools)
 *       • Overall adjusted ±(3–10) — keeps realistic variance
 *       • Market value recalculated from new overall + league factor
 *       • DNA profile preserved in shape (same strengths, proportionally scaled)
 *       • Physical data derived from position (realistic heights/weights)
 *       • secondaryPosition inferred from primary position
 *       • contractMock and clubHistory generated
 *   3. Player is tagged source="mock" + leagueContext of target league.
 *
 * USAGE
 *   # All mock leagues
 *   npx ts-node src/scripts/seed-mock-players.ts
 *
 *   # Specific group
 *   npx ts-node src/scripts/seed-mock-players.ts --group=africa
 *   npx ts-node src/scripts/seed-mock-players.ts --group=europe_extra
 *   npx ts-node src/scripts/seed-mock-players.ts --group=south_america_lower
 *
 *   # Per league
 *   npx ts-node src/scripts/seed-mock-players.ts --league="Allsvenskan"
 *
 *   # Dry run
 *   npx ts-node src/scripts/seed-mock-players.ts --dry-run
 *
 *   # Force overwrite existing mock players for the target leagues
 *   npx ts-node src/scripts/seed-mock-players.ts --force
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { prisma } from "../lib/prisma";
import {
  calculateMarketValue,
  resolvePositionGroup,
  type PositionGroup,
} from "../analytics/soccermind-overall.engine";
import type { LeagueContext } from "../analytics/overall.engine";

// ─── CLI ─────────────────────────────────────────────────────────────────────

const args     = process.argv.slice(2);
const DRY_RUN  = args.includes("--dry-run");
const FORCE    = args.includes("--force");
const groupArg = args.find((a) => a.startsWith("--group="))?.split("=")[1] ?? null;
const leagueArg= args.find((a) => a.startsWith("--league="))?.split("=")[1] ?? null;

// ─── Mock league registry ────────────────────────────────────────────────────

interface MockLeagueConfig {
  name:           string;
  country:        string;
  leagueContext:  LeagueContext;
  group:          string;
  squads:         number;   // number of teams to generate
  playersPerSquad:number;
  nationalityPool:string[]; // dominant nationalities for name generation
  donorLeague?:   string;   // real league to clone players from (null = any)
}

const MOCK_LEAGUES: MockLeagueConfig[] = [
  // ── Europe Extra ──────────────────────────────────────────────────────────
  {
    name: "Admiral Bundesliga",
    country: "Austria",
    leagueContext: "EUR_EXTRA",
    group: "europe_extra",
    squads: 12,
    playersPerSquad: 22,
    nationalityPool: ["Austrian", "German", "Croatian", "Serbian", "Czech"],
    donorLeague: "Belgian Pro League",
  },
  {
    name: "Superliga",
    country: "Denmark",
    leagueContext: "EUR_EXTRA",
    group: "europe_extra",
    squads: 14,
    playersPerSquad: 22,
    nationalityPool: ["Danish", "Swedish", "Norwegian", "Finnish", "Icelandic"],
    donorLeague: "Eredivisie",
  },
  {
    name: "Allsvenskan",
    country: "Sweden",
    leagueContext: "EUR_EXTRA",
    group: "europe_extra",
    squads: 16,
    playersPerSquad: 22,
    nationalityPool: ["Swedish", "Danish", "Norwegian", "Finnish", "Nigerian"],
    donorLeague: "Eredivisie",
  },
  {
    name: "SuperSport HNL",
    country: "Croatia",
    leagueContext: "EUR_EXTRA",
    group: "europe_extra",
    squads: 10,
    playersPerSquad: 22,
    nationalityPool: ["Croatian", "Bosnian", "Serbian", "Slovenian", "Montenegrin"],
    donorLeague: "Belgian Pro League",
  },
  {
    name: "Fortuna Liga",
    country: "Czech Republic",
    leagueContext: "EUR_EXTRA",
    group: "europe_extra",
    squads: 16,
    playersPerSquad: 22,
    nationalityPool: ["Czech", "Slovak", "Polish", "Ukrainian", "Romanian"],
    donorLeague: "Belgian Pro League",
  },

  // ── South America Lower ───────────────────────────────────────────────────
  {
    name: "Primera División (Uruguay)",
    country: "Uruguay",
    leagueContext: "SA_MID",
    group: "south_america_lower",
    squads: 16,
    playersPerSquad: 22,
    nationalityPool: ["Uruguayan", "Argentine", "Brazilian", "Paraguayan", "Chilean"],
    donorLeague: "Liga BetPlay (Colombia)",
  },
  {
    name: "Liga 1 (Peru)",
    country: "Peru",
    leagueContext: "SA_LOWER",
    group: "south_america_lower",
    squads: 18,
    playersPerSquad: 22,
    nationalityPool: ["Peruvian", "Colombian", "Argentine", "Chilean", "Venezuelan"],
    donorLeague: "Liga BetPlay (Colombia)",
  },

  // ── Africa ────────────────────────────────────────────────────────────────
  {
    name: "DStv Premiership",
    country: "South Africa",
    leagueContext: "AFRICA_TOP",
    group: "africa",
    squads: 16,
    playersPerSquad: 22,
    nationalityPool: ["South African", "Zimbabwean", "Zambian", "Mozambican", "Lesothoan"],
    donorLeague: "Liga BetPlay (Colombia)",
  },
  {
    name: "Egyptian Premier League",
    country: "Egypt",
    leagueContext: "AFRICA_TOP",
    group: "africa",
    squads: 18,
    playersPerSquad: 22,
    nationalityPool: ["Egyptian", "Moroccan", "Senegalese", "Cameroonian", "Ghanaian"],
    donorLeague: "Liga BetPlay (Colombia)",
  },
  {
    name: "Botola Pro",
    country: "Morocco",
    leagueContext: "AFRICA_TOP",
    group: "africa",
    squads: 16,
    playersPerSquad: 22,
    nationalityPool: ["Moroccan", "Algerian", "Tunisian", "Senegalese", "Ivorian"],
    donorLeague: "Liga BetPlay (Colombia)",
  },
  {
    name: "Nigeria Premier Football League",
    country: "Nigeria",
    leagueContext: "AFRICA_MID",
    group: "africa",
    squads: 20,
    playersPerSquad: 22,
    nationalityPool: ["Nigerian", "Ghanaian", "Cameroonian", "Ivorian", "Senegalese"],
  },
];

// ─── Name generation pools ───────────────────────────────────────────────────

const NAME_POOL: Record<string, { first: string[]; last: string[] }> = {
  Austrian:      { first: ["Lukas","Florian","Stefan","Dominik","Alexander","Markus"], last: ["Müller","Bauer","Wagner","Fischer","Weber","Gruber"] },
  German:        { first: ["Lukas","Jonas","Leon","Felix","Moritz","Paul"], last: ["Müller","Schmidt","Becker","Koch","Hoffmann","Wagner"] },
  Croatian:      { first: ["Luka","Mateo","Ivan","Filip","Josip","Ante"], last: ["Horvat","Kovač","Babić","Perić","Jurić","Blašković"] },
  Serbian:       { first: ["Nemanja","Stefan","Nikola","Aleksandar","Marko","Lazar"], last: ["Jović","Milić","Pavlović","Lukić","Đurić","Marković"] },
  Czech:         { first: ["Tomáš","Jakub","Lukáš","Ondřej","Martin","Pavel"], last: ["Novák","Dvořák","Blažek","Havel","Kroupa","Janda"] },
  Slovak:        { first: ["Marek","Patrik","Martin","Tomáš","Miroslav","Peter"], last: ["Kováč","Horváth","Takáč","Blaho","Mináč","Janek"] },
  Danish:        { first: ["Magnus","Mikkel","Anders","Frederik","Christian","Kasper"], last: ["Andersen","Jensen","Nielsen","Hansen","Pedersen","Christensen"] },
  Swedish:       { first: ["Emil","Oscar","Viktor","Anton","Ludwig","Simon"], last: ["Andersson","Svensson","Gustafsson","Lindqvist","Persson","Johansson"] },
  Norwegian:     { first: ["Erling","Martin","Marcus","Sander","Tobias","Henrik"], last: ["Hansen","Olsen","Johansen","Andersen","Nilsen","Berg"] },
  Finnish:       { first: ["Teemu","Mikael","Jere","Tomi","Riku","Lassi"], last: ["Mäkinen","Leinonen","Korhonen","Hämäläinen","Laine","Peltonen"] },
  Icelandic:     { first: ["Aron","Birkir","Gylfi","Jón","Sigurður","Kári"], last: ["Sigurdsson","Gunnarsson","Bjarnason","Kristjánsson","Eiríksson","Stefánsson"] },
  Uruguayan:     { first: ["Rodrigo","Sebastián","Joaquín","Nicolás","Lucas","Emiliano"], last: ["González","Rodríguez","García","Martínez","Suárez","Cavani"] },
  Argentine:     { first: ["Matías","Ezequiel","Ramiro","Tomás","Facundo","Nicolás"], last: ["García","López","Fernández","Torres","Molina","Romero"] },
  Brazilian:     { first: ["Gustavo","Felipe","Bruno","Caio","Thiago","Matheus"], last: ["Silva","Santos","Oliveira","Souza","Rocha","Lima"] },
  Chilean:       { first: ["Cristóbal","Rodrigo","Felipe","Maximiliano","Pablo","Jorge"], last: ["González","Muñoz","Rojas","Díaz","Vargas","Sánchez"] },
  Paraguayan:    { first: ["Julio","Roque","Óscar","Derlis","Miguel","Alejandro"], last: ["González","Benítez","Díaz","Romero","Martínez","López"] },
  Colombian:     { first: ["Luis","Juan","Andrés","Carlos","Sebastián","Miguel"], last: ["Díaz","Moreno","Castro","Palacios","Córdoba","Cuadrado"] },
  Peruvian:      { first: ["Christian","Paolo","Edison","Gianluca","Renato","André"], last: ["Cueva","Guerrero","Flores","Peña","Tapia","Lapadula"] },
  Venezuelan:    { first: ["Salomón","Josef","Tomás","Yangel","Rolf","Cristian"], last: ["Rondón","Martínez","Soteldo","Herrera","Moreno","Rincon"] },
  "South African":{ first: ["Themba","Lyle","Bongani","Percy","Siboniso","Bradley"], last: ["Foster","Tau","Zungu","Dolly","Gaxa","Lakay"] },
  Zimbabwean:    { first: ["Khama","Tendai","Knox","Marvelous","Ishmael","Gerald"], last: ["Billiat","Karuru","Mutizwa","Nakamba","Munetsi","Taylor"] },
  Zambian:       { first: ["Patson","Fashion","Lubambo","Christopher","Enock","Kings"], last: ["Daka","Sakala","Mulenga","Katongo","Chanda","Sinkala"] },
  Mozambican:    { first: ["Reinildo","Witi","Muriqui","Stédio","Felicio","Domingos"], last: ["Mandava","Nhaga","Amade","Chicumba","Chapo","Domingos"] },
  Egyptian:      { first: ["Mohamed","Ahmed","Ramadan","Kahraba","Mostafa","Tarek"], last: ["Salah","Elneny","Trezeguet","Sobhi","Warda","Hamdi"] },
  Moroccan:      { first: ["Achraf","Hakim","Youssef","Sofiane","Munir","Nayef"], last: ["Hakimi","Ziyech","En-Nesyri","Boufal","Amrabat","Aguerd"] },
  Algerian:      { first: ["Riyad","Islam","Sofiane","Youcef","Djamel","Ismail"], last: ["Mahrez","Slimani","Belaili","Atal","Bennacer","Bounedjah"] },
  Tunisian:      { first: ["Youssef","Wahbi","Naim","Hannibal","Sayfallah","Ghailene"], last: ["Msakni","Khazri","Sliti","Mejbri","Skhiri","Jaziri"] },
  Senegalese:    { first: ["Sadio","Kalidou","Idrissa","Ismaïla","Cheikhou","Bamba"], last: ["Mané","Koulibaly","Gueye","Sarr","Kouyaté","Diallo"] },
  Cameroonian:   { first: ["André-Frank","Clinton","Karl","Franck","Stéphane","Aurélien"], last: ["Anguissa","Njie","Toko Ekambi","Ngadeu","Fai","Bassogog"] },
  Ghanaian:      { first: ["Thomas","Jordan","Andre","Mohammed","Iddrisu","Tariq"], last: ["Partey","Ayew","Lamptey","Kudus","Baba","Mensah"] },
  Nigerian:      { first: ["Victor","Emmanuel","Kelechi","Samuel","Wilfred","Ndidi"], last: ["Osimhen","Dennis","Iheanacho","Chukwueze","Ndidi","Ighalo"] },
  Ivorian:       { first: ["Sébastien","Didier","Franck","Serge","Nicolas","Wilfried"], last: ["Haller","Drogba","Kessié","Aurier","Pépé","Zaha"] },
  Bosnian:       { first: ["Edin","Miralem","Anel","Asmir","Ermin","Sead"], last: ["Džeko","Pjanić","Hadziahmetović","Begović","Zec","Kolasinac"] },
  Slovenian:     { first: ["Jan","Benjamin","Jasmin","Žan","Andraž","Petar"], last: ["Oblak","Šeško","Kurtić","Vipotnik","Sporar","Stojanović"] },
  Montenegrin:   { first: ["Stevan","Nikola","Aleksandar","Stefan","Vuk","Marko"], last: ["Jovetić","Savić","Vukčević","Živković","Čolić","Lakić"] },
  Polish:        { first: ["Robert","Piotr","Mateusz","Krzysztof","Sebastian","Jakub"], last: ["Lewandowski","Zieliński","Klich","Grosicki","Bielik","Frankowski"] },
  Ukrainian:     { first: ["Andriy","Oleksandr","Mykhailo","Taras","Vitaliy","Serhiy"], last: ["Shevchenko","Yarmolenko","Mudryk","Stepanenko","Tsygankov","Matviyenko"] },
  Romanian:      { first: ["Florinel","Ianis","Radu","Alexandru","Andrei","Denis"], last: ["Coman","Hagi","Drăguș","Mitrița","Stanciu","Manea"] },
  Lesothoan:     { first: ["Tsepo","Nkau","Fusi","Mokhosi","Litšepe","Lehlohonolo"], last: ["Masilela","Marabe","Phokoboto","Mofolo","Motebang","Matlaba"] },
};

const FALLBACK_NAMES = { first: ["Carlos","Pedro","Marcos","André","Rafael","Diego"], last: ["Silva","Santos","Costa","Oliveira","Souza","Ferreira"] };

function randomName(nationalities: string[]): string {
  const nat = nationalities[Math.floor(Math.random() * nationalities.length)];
  const pool = NAME_POOL[nat] ?? FALLBACK_NAMES;
  const first = pool.first[Math.floor(Math.random() * pool.first.length)];
  const last  = pool.last[Math.floor(Math.random() * pool.last.length)];
  return `${first} ${last}`;
}

// ─── Secondary position by primary ───────────────────────────────────────────

const SECONDARY_POSITION_MAP: Record<string, string[]> = {
  "Goalkeeper":          ["Goalkeeper"],
  "Centre Back":         ["Right Back", "Left Back", "Defensive Midfield"],
  "Right Back":          ["Centre Back", "Right Wing Back", "Right Midfield"],
  "Left Back":           ["Centre Back", "Left Wing Back", "Left Midfield"],
  "Right Wing Back":     ["Right Back", "Right Wing", "Right Midfield"],
  "Left Wing Back":      ["Left Back", "Left Wing", "Left Midfield"],
  "Defensive Midfield":  ["Central Midfield", "Centre Back", "Attacking Midfield"],
  "Central Midfield":    ["Defensive Midfield", "Attacking Midfield", "Right Midfield"],
  "Attacking Midfield":  ["Central Midfield", "Left Wing", "Right Wing", "Second Striker"],
  "Left Wing":           ["Left Midfield", "Attacking Midfield", "Second Striker"],
  "Right Wing":          ["Right Midfield", "Attacking Midfield", "Second Striker"],
  "Second Striker":      ["Attacking Midfield", "Centre Forward", "Left Wing"],
  "Centre Forward":      ["Second Striker", "Left Wing", "Right Wing"],
  "Striker":             ["Centre Forward", "Second Striker", "Left Wing"],
};

function deriveSecondaryPosition(primaryPositions: string[]): string | null {
  for (const pos of primaryPositions) {
    const opts = SECONDARY_POSITION_MAP[pos];
    if (opts && opts.length > 1) {
      // pick one that isn't the primary
      const filtered = opts.filter((p) => !primaryPositions.includes(p));
      if (filtered.length > 0) {
        return filtered[Math.floor(Math.random() * filtered.length)];
      }
    }
  }
  return null;
}

// ─── Physical defaults by position group ─────────────────────────────────────

const PHYSICAL_BY_GROUP: Record<PositionGroup, { height: [number,number]; weight: [number,number] }> = {
  GK:  { height: [186, 196], weight: [80, 95] },
  DEF: { height: [180, 192], weight: [75, 88] },
  MID: { height: [174, 185], weight: [70, 82] },
  ATT: { height: [170, 185], weight: [68, 80] },
};

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generatePhysical(group: PositionGroup): { height: number; weight: number } {
  const range = PHYSICAL_BY_GROUP[group];
  return {
    height: randomInt(range.height[0], range.height[1]),
    weight: randomInt(range.weight[0], range.weight[1]),
  };
}

// ─── Foot distribution by position group ─────────────────────────────────────

function randomFoot(group: PositionGroup): string {
  const r = Math.random();
  // ~75% right-footed, ~20% left, ~5% both (realistic global distribution)
  if (group === "ATT" && r < 0.25) return "left";  // slightly more balanced for ATT
  if (r < 0.22) return "left";
  if (r < 0.26) return "both";
  return "right";
}

// ─── Contract mock ────────────────────────────────────────────────────────────

function generateContractMock(club: string, country: string, currentYear = 2025): object {
  const startYear  = currentYear - randomInt(0, 3);
  const endYear    = currentYear + randomInt(1, 3);
  const salary     = randomInt(1, 30) * 5000; // 5k–150k/month
  const buyout     = salary * 12 * randomInt(10, 40); // 10–40× annual salary
  return {
    club,
    country,
    from:         `${startYear}-07-01`,
    until:        `${endYear}-06-30`,
    salary,
    buyoutClause: buyout,
  };
}

// ─── Club history mock ────────────────────────────────────────────────────────

function generateClubHistory(
  currentClub: string,
  country: string,
  age: number,
): object[] {
  const yearsPlaying = Math.max(1, age - 17);
  const entries: object[] = [];
  let cursor = 2025 - yearsPlaying;

  // first entry — youth/early career same country
  if (yearsPlaying > 3) {
    const youthSeasons = Math.min(randomInt(1, 3), yearsPlaying - 1);
    entries.push({
      club:        `${country} Youth Club`,
      country,
      season:      `${cursor}/${cursor + 1}`,
      appearances: randomInt(10, 30),
      goals:       randomInt(0, 8),
      assists:     randomInt(0, 6),
    });
    cursor += youthSeasons;
  }

  // intermediate clubs
  const prevClubs = Math.min(randomInt(1, 3), Math.floor(yearsPlaying / 2));
  for (let i = 0; i < prevClubs; i++) {
    const seasons = randomInt(1, 3);
    entries.push({
      club:        `${country} FC ${i + 1}`,
      country,
      season:      `${cursor}/${cursor + 1}`,
      appearances: randomInt(20, 38),
      goals:       randomInt(0, 15),
      assists:     randomInt(0, 10),
    });
    cursor += seasons;
    if (cursor >= 2025) break;
  }

  // current club
  entries.push({
    club:        currentClub,
    country,
    season:      "2024/2025",
    appearances: randomInt(15, 34),
    goals:       randomInt(0, 12),
    assists:     randomInt(0, 8),
  });

  return entries;
}

// ─── Overall delta by league context ─────────────────────────────────────────
// Mock players are slightly weaker on average than their donors.

const OVERALL_DELTA: Record<LeagueContext, [number, number]> = {
  DEFAULT:    [-2, +2],
  EUR_MID:    [-3, +2],
  EUR_LOWER:  [-4, +2],
  EUR_EXTRA:  [-5, +3],
  SERIE_A:    [-5, +3],
  SERIE_B:    [-8, +2],
  SA_TOP:     [-6, +3],
  SA_MID:     [-7, +3],
  SA_LOWER:   [-8, +3],
  AFRICA_TOP: [-8, +4],
  AFRICA_MID: [-10,+4],
};

function applyOverallDelta(base: number, ctx: LeagueContext): number {
  const [min, max] = OVERALL_DELTA[ctx];
  const delta = randomInt(min, max);
  return Math.max(40, Math.min(85, base + delta));
}

// ─── DNA scale ────────────────────────────────────────────────────────────────
// Scales all numeric values in a dnaScore JSON proportionally.

function scaleDna(dna: Record<string, unknown> | null, factor: number): Record<string, number> | null {
  if (!dna) return null;
  const scaled: Record<string, number> = {};
  for (const [k, v] of Object.entries(dna)) {
    if (typeof v === "number") {
      scaled[k] = Math.round(Math.min(100, Math.max(0, (v as number) * factor)));
    }
  }
  return scaled;
}

// ─── Team names by country ────────────────────────────────────────────────────

const TEAM_NAMES: Record<string, string[]> = {
  Austria:        ["SK Rapid Wien","FK Austria Wien","LASK","Sturm Graz","Salzburg B","Wolfsberg","Hartberg","Ried"],
  Denmark:        ["FC Kopenhagen","Brøndby IF","FC Midtjylland","AGF Aarhus","Odense BK","Aalborg","Randers","Silkeborg"],
  Sweden:         ["Malmö FF","Djurgårdens IF","IFK Göteborg","AIK","Hammarby","Häcken","Elfsborg","Örebro"],
  Croatia:        ["Dinamo Zagreb","Hajduk Split","HNK Rijeka","NK Osijek","Slaven Belupo","Istra 1961","Šibenik","Varaždin"],
  "Czech Republic":["AC Sparta Praha","AC Slavia Praha","FC Viktoria Plzeň","FK Jablonec","SK Sigma Olomouc","Baník Ostrava","Ml. Boleslav","Bohemians"],
  Uruguay:        ["Club Nacional","Club Peñarol","Montevideo Wanderers","Danubio","Defensor Sporting","Plaza Colonia","River Plate Uy","Boston River"],
  Peru:           ["Alianza Lima","Universitario de Deportes","Sporting Cristal","FBC Melgar","Club César Vallejo","Deportivo Municipal","Cienciano","Ayacucho FC"],
  "South Africa": ["Kaizer Chiefs","Orlando Pirates","Mamelodi Sundowns","SuperSport United","AmaZulu","Cape Town City","Golden Arrows","Stellenbosch"],
  Egypt:          ["Al Ahly","Zamalek SC","Pyramids FC","Al-Ittihad Alex","El Gouna","Pharco FC","Al Masry","Smouha"],
  Morocco:        ["Wydad Casablanca","Raja Casablanca","RS Berkane","FUS Rabat","FAR Rabat","Hassania Agadir","OC Khouribga","CAYB Berrechid"],
  Nigeria:        ["Enyimba FC","Rivers United","Plateau United","Kano Pillars","Shooting Stars","Remo Stars","Akwa United","Heartland"],
};

function getTeamNames(country: string, count: number): string[] {
  const pool = TEAM_NAMES[country] ?? [`${country} FC 1`,`${country} FC 2`,`${country} FC 3`];
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    result.push(pool[i % pool.length]);
  }
  return result;
}

// ─── Slug ─────────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function uniqueSlug(base: string, existing: Set<string>): string {
  let slug = slugify(base);
  if (!existing.has(slug)) { existing.add(slug); return slug; }
  let i = 2;
  while (existing.has(`${slug}-${i}`)) i++;
  existing.add(`${slug}-${i}`);
  return `${slug}-${i}`;
}

// ─── Select leagues ───────────────────────────────────────────────────────────

function selectMockLeagues(): MockLeagueConfig[] {
  if (leagueArg) {
    const match = MOCK_LEAGUES.find((l) => l.name.toLowerCase() === leagueArg.toLowerCase());
    if (!match) {
      console.error(`❌  Liga não encontrada: "${leagueArg}"`);
      process.exit(1);
    }
    return [match];
  }
  if (groupArg) {
    const matched = MOCK_LEAGUES.filter((l) => l.group === groupArg);
    if (matched.length === 0) {
      const groups = [...new Set(MOCK_LEAGUES.map((l) => l.group))].join(", ");
      console.error(`❌  Grupo inválido: "${groupArg}". Disponíveis: ${groups}`);
      process.exit(1);
    }
    return matched;
  }
  return MOCK_LEAGUES;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startedAt = Date.now();
  const targets = selectMockLeagues();

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║      MOCK INTELIGENTE — JOGADORES POR LIGA          ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`\n  Ligas alvo     : ${targets.length}`);
  console.log(`  Modo dry-run   : ${DRY_RUN}`);
  console.log(`  Force overwrite: ${FORCE}`);
  console.log();

  // Load existing slugs once to avoid duplicates
  const existingSlugs = new Set<string>(
    (await prisma.player.findMany({ select: { slug: true } })).map((p) => p.slug),
  );

  let totalCreated = 0;
  let totalSkipped = 0;

  for (const league of targets) {
    console.log(`\n  ▶ ${league.name} (${league.country}) — ${league.leagueContext}`);

    // Delete existing mocks for this league if --force
    if (FORCE && !DRY_RUN) {
      const deleted = await prisma.player.deleteMany({
        where: { source: "mock", league: league.name },
      });
      console.log(`    🗑  ${deleted.count} mocks anteriores removidos.`);
    } else if (!FORCE) {
      const existing = await prisma.player.count({
        where: { source: "mock", league: league.name },
      });
      if (existing > 0) {
        console.log(`    ⏭  ${existing} mocks já existem. Use --force para substituir.`);
        totalSkipped += existing;
        continue;
      }
    }

    // Fetch donor players from DB
    const donorWhere = league.donorLeague
      ? { source: "sportmonks", league: league.donorLeague }
      : { source: "sportmonks" };

    const donors = await prisma.player.findMany({
      where: { ...donorWhere, overall: { not: null } },
      select: {
        positions: true,
        overall:   true,
        potential: true,
        age:       true,
        dnaScore:  true,
        attributes:true,
        archetype: true,
      },
      take: 200,
    });

    if (donors.length === 0) {
      console.log(`    ⚠  Nenhum donor encontrado para ${league.donorLeague ?? "qualquer liga"}. Usando padrões.`);
    }

    const teams = getTeamNames(league.country, league.squads);
    const totalPlayers = league.squads * league.playersPerSquad;
    const playersData: Parameters<typeof prisma.player.create>[0]["data"][] = [];

    for (let t = 0; t < league.squads; t++) {
      const club = teams[t];
      for (let p = 0; p < league.playersPerSquad; p++) {
        // Pick a donor (or use defaults if none available)
        let baseOverall  = randomInt(55, 72);
        let basePotential= randomInt(58, 78);
        let basePositions= ["Central Midfield"];
        let baseAge      = randomInt(19, 32);
        let baseDna: Record<string, unknown> | null = null;
        let baseAttrs: object = {};
        let baseArchetype: object = {};

        if (donors.length > 0) {
          const donor = donors[Math.floor(Math.random() * donors.length)];
          baseOverall   = donor.overall ?? baseOverall;
          basePotential = donor.potential ?? basePotential;
          basePositions = donor.positions.length > 0 ? donor.positions : basePositions;
          baseAge       = donor.age;
          baseDna       = donor.dnaScore as Record<string, unknown> | null;
          baseAttrs     = donor.attributes as object;
          baseArchetype = donor.archetype as object;
        }

        const mockOverall   = applyOverallDelta(baseOverall, league.leagueContext);
        const scaleFactor   = mockOverall / Math.max(1, baseOverall);
        const mockPotential = Math.max(mockOverall, Math.min(90, Math.round(basePotential * scaleFactor)));
        const mockAge       = Math.max(17, Math.min(38, baseAge + randomInt(-2, 2)));
        const group         = resolvePositionGroup(basePositions);
        const phys          = generatePhysical(group);
        const mockedDna     = scaleDna(baseDna, scaleFactor);
        const secondPos     = deriveSecondaryPosition(basePositions);

        const mockMarketValue = calculateMarketValue({
          overall:       mockOverall,
          potential:     mockPotential,
          age:           mockAge,
          positionGroup: group,
          league:        league.name,
        });

        const nationality = league.nationalityPool[Math.floor(Math.random() * league.nationalityPool.length)];
        const fullName    = randomName(league.nationalityPool);
        const slug        = uniqueSlug(`${fullName}-${league.country.toLowerCase()}`, existingSlugs);

        playersData.push({
          slug,
          name:             fullName,
          nameNormalized:   fullName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
          source:           "mock",
          positions:        basePositions,
          secondaryPosition:secondPos ?? undefined,
          age:              mockAge,
          nationality,
          team:             club,
          league:           league.name,
          overall:          mockOverall,
          potential:        mockPotential,
          marketValue:      mockMarketValue,
          dnaScore:         mockedDna ?? undefined,
          dnaCalculatedAt:  mockedDna ? new Date() : undefined,
          overallCalculatedAt: new Date(),
          height:           phys.height,
          weight:           phys.weight,
          foot:             randomFoot(group),
          contractMock:     generateContractMock(club, league.country),
          clubHistory:      generateClubHistory(club, league.country, mockAge),
          attributes:       baseAttrs,
          archetype:        baseArchetype,
        });
      }
    }

    if (DRY_RUN) {
      console.log(`    🔍  [DRY RUN] Geraria ${playersData.length} jogadores para ${league.name}`);
      totalCreated += playersData.length;
      continue;
    }

    // Batch insert in chunks of 100
    const CHUNK = 100;
    let created = 0;
    for (let i = 0; i < playersData.length; i += CHUNK) {
      const chunk = playersData.slice(i, i + CHUNK);
      await prisma.player.createMany({ data: chunk as import("@prisma/client").Prisma.PlayerCreateManyInput[] });
      created += chunk.length;
    }

    console.log(`    ✓  ${created}/${totalPlayers} jogadores criados para ${league.name}`);
    totalCreated += created;
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const sep = "═".repeat(58);

  console.log("\n" + sep);
  console.log("  RESULTADO FINAL — MOCK PLAYERS");
  console.log(sep);
  console.log(`  Criados  : ${totalCreated}`);
  console.log(`  Pulados  : ${totalSkipped}  (já existiam, sem --force)`);
  console.log(`  Duração  : ${elapsed}s`);
  console.log(sep + "\n");

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("❌  Erro fatal:", (err as Error).message);
  await prisma.$disconnect();
  process.exit(1);
});
